import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createAiProviderService } from '@/application/ai/ai-provider-service';
import { resolveConfigOrigin, type AiProviderConfig } from '@/domain/ai-provider';
import {
  ChromeHostPermissions,
  originMatchPattern,
} from '@/infrastructure/ai/chrome-host-permissions';
import { FakeAiConnectionTester, InMemoryAiProviderConfigRepository } from '../support/fakes';

type PermissionCall = (value: { origins?: string[] }) => Promise<boolean>;

/** O tipo publicado pelo fake-browser declara retorno vazio; o contrato real resolve booleano. */
function grant(result: boolean): never {
  return (async () => result) as unknown as never;
}

function permissionCall(implementation: PermissionCall): never {
  return implementation as unknown as never;
}

const CONFIG: AiProviderConfig = {
  provider: 'CUSTOM',
  apiBase: 'http://localhost:11434/v1',
  credential: 'ollama',
  model: 'llama3.1',
};

describe('ChromeHostPermissions', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('converte a origem em um padrão de uma única origem', () => {
    expect(originMatchPattern('https://api.openai.com')).toBe('https://api.openai.com/*');
    expect(originMatchPattern('http://localhost:11434')).toBe('http://localhost:11434/*');
  });

  it('consulta, solicita e revoga usando a origem resolvida da configuração', async () => {
    const contains = vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation(grant(false));
    const request = vi.spyOn(fakeBrowser.permissions, 'request').mockImplementation(grant(true));
    const remove = vi.spyOn(fakeBrowser.permissions, 'remove').mockImplementation(grant(true));
    const origin = resolveConfigOrigin(CONFIG);
    const permissions = new ChromeHostPermissions();

    await permissions.has(origin);
    await permissions.request(origin);
    await permissions.revoke(origin);

    expect(contains).toHaveBeenCalledWith({ origins: ['http://localhost:11434/*'] });
    expect(request).toHaveBeenCalledWith({ origins: ['http://localhost:11434/*'] });
    expect(remove).toHaveBeenCalledWith({ origins: ['http://localhost:11434/*'] });
  });

  it('nunca solicita permissão de API, apenas de origem', async () => {
    const request = vi.spyOn(fakeBrowser.permissions, 'request').mockImplementation(grant(true));

    await new ChromeHostPermissions().request('https://api.anthropic.com');

    const [argument] = request.mock.calls[0]!;
    expect(Object.keys(argument)).toEqual(['origins']);
    expect(argument.origins).toEqual(['https://api.anthropic.com/*']);
  });

  it('solicita a origem da configuração e a revoga na remoção, pelo serviço', async () => {
    const granted = new Set<string>();
    vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation(
      permissionCall(async (value) => (value.origins ?? []).every((origin) => granted.has(origin))),
    );
    const request = vi.spyOn(fakeBrowser.permissions, 'request').mockImplementation(
      permissionCall(async (value) => {
        (value.origins ?? []).forEach((origin) => granted.add(origin));
        return true;
      }),
    );
    const remove = vi.spyOn(fakeBrowser.permissions, 'remove').mockImplementation(
      permissionCall(async (value) => {
        (value.origins ?? []).forEach((origin) => granted.delete(origin));
        return true;
      }),
    );

    const service = createAiProviderService({
      repository: new InMemoryAiProviderConfigRepository(CONFIG),
      permissions: new ChromeHostPermissions(),
      tester: new FakeAiConnectionTester(),
    });

    await service.requestPermission(resolveConfigOrigin(CONFIG));
    expect(request).toHaveBeenCalledWith({ origins: ['http://localhost:11434/*'] });

    await service.remove();
    expect(remove).toHaveBeenCalledWith({ origins: ['http://localhost:11434/*'] });
    expect(granted.size).toBe(0);
  });
});
