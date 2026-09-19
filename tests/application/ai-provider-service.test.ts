import { describe, expect, it } from 'vitest';
import type { AiConnectionTester } from '@/application/ai/ai-connection-tester';
import { AiConfigStorageError } from '@/application/ai/ai-provider-config-repository';
import { createAiProviderService } from '@/application/ai/ai-provider-service';
import type { AiProviderConfig } from '@/domain/ai-provider';
import {
  FakeAiConnectionTester,
  FakeHostPermissions,
  InMemoryAiProviderConfigRepository,
} from '../support/fakes';

const OPENAI_CONFIG: AiProviderConfig = {
  provider: 'OPENAI',
  credential: 'sk-secreta',
  model: 'gpt-4o-mini',
};

const CUSTOM_CONFIG: AiProviderConfig = {
  provider: 'CUSTOM',
  apiBase: 'https://gateway.exemplo/v1',
  credential: 'chave-gateway',
  model: 'llama3.1',
};

function setup(config?: AiProviderConfig, ...grantedOrigins: string[]) {
  const repository = new InMemoryAiProviderConfigRepository(config);
  const permissions = new FakeHostPermissions(...grantedOrigins);
  const tester = new FakeAiConnectionTester();
  const service = createAiProviderService({ repository, permissions, tester });

  return { repository, permissions, tester, service };
}

describe('leitura do estado da configuração', () => {
  it('informa nenhum provedor configurado quando a chave está ausente', async () => {
    const { service, tester } = setup();

    await expect(service.load()).resolves.toEqual({ state: 'NONE' });
    expect(tester.requests).toEqual([]);
  });

  it('não realiza nenhuma requisição ao abrir a área com configuração salva', async () => {
    const { service, tester } = setup(OPENAI_CONFIG, 'https://api.openai.com');

    await service.load();

    expect(tester.requests).toEqual([]);
  });

  it('entrega a marca de credencial salva sem expor o valor', async () => {
    const { service } = setup(OPENAI_CONFIG, 'https://api.openai.com');

    const status = await service.load();

    expect(status).toEqual({
      state: 'CONFIGURED',
      summary: {
        provider: 'OPENAI',
        apiBase: 'https://api.openai.com/v1',
        origin: 'https://api.openai.com',
        model: 'gpt-4o-mini',
        hasCredential: true,
      },
      permissionGranted: true,
    });
    expect(JSON.stringify(status)).not.toContain('sk-secreta');
  });

  it('detecta a permissão revogada por fora da extensão ao abrir a área', async () => {
    const { service } = setup(CUSTOM_CONFIG);

    const status = await service.load();

    expect(status).toMatchObject({ state: 'CONFIGURED', permissionGranted: false });
  });
});

describe('bloqueio por configuração incompatível', () => {
  it('apresenta o bloqueio ao abrir a área', async () => {
    const { repository, service } = setup(OPENAI_CONFIG);
    repository.incompatible = true;

    await expect(service.load()).resolves.toEqual({ state: 'BLOCKED', blocked: 'INCOMPATIBLE' });
  });

  it('impede salvar sem sobrescrever o que está persistido', async () => {
    const { repository, service } = setup(OPENAI_CONFIG);
    repository.incompatible = true;

    const result = await service.save({ provider: 'OPENAI', credential: 'nova', model: 'm' });

    expect(result).toEqual({ ok: false, blocked: 'INCOMPATIBLE' });
    expect(repository.saves).toBe(0);
  });

  it('impede testar sem contatar o provedor', async () => {
    const { repository, tester, service } = setup(OPENAI_CONFIG, 'https://api.openai.com');
    repository.incompatible = true;

    const result = await service.testConnection('MODEL_LIST');

    expect(result).toEqual({ ok: false, blocked: 'INCOMPATIBLE' });
    expect(tester.requests).toEqual([]);
  });

  it('permite a remoção explícita, que desbloqueia a área', async () => {
    const { repository, service } = setup(OPENAI_CONFIG);
    repository.incompatible = true;

    await expect(service.remove()).resolves.toEqual({ ok: true, permissionRevoked: false });
    await expect(service.load()).resolves.toEqual({ state: 'NONE' });
  });

  it('distingue armazenamento indisponível de dados incompatíveis', async () => {
    const { repository, service } = setup();
    repository.failNext.read = new AiConfigStorageError('UNAVAILABLE', 'indisponível');

    await expect(service.load()).resolves.toEqual({ state: 'BLOCKED', blocked: 'UNAVAILABLE' });
  });
});

describe('gravação da configuração', () => {
  it('substitui a configuração anterior por completo', async () => {
    const { repository, service } = setup(OPENAI_CONFIG);

    await service.save({
      provider: 'CUSTOM',
      apiBase: 'http://localhost:11434/v1',
      credential: 'ollama',
      model: 'llama3.1',
    });

    expect(repository.stored).toEqual({
      provider: 'CUSTOM',
      apiBase: 'http://localhost:11434/v1',
      credential: 'ollama',
      model: 'llama3.1',
    });
    expect(JSON.stringify(repository.stored)).not.toContain('sk-secreta');
  });

  it('recusa sem credencial ou sem modelo, sem alterar a configuração persistida', async () => {
    const { repository, service } = setup();

    const semCredencial = await service.save({ provider: 'OPENAI', credential: '', model: 'm' });
    const semModelo = await service.save({ provider: 'OPENAI', credential: 'sk', model: '  ' });

    expect(semCredencial).toMatchObject({ ok: false });
    expect(semModelo).toMatchObject({ ok: false });
    expect(repository.saves).toBe(0);
    expect(repository.stored).toBeUndefined();
  });

  it('preserva a credencial gravada quando só o modelo muda', async () => {
    const { repository, service } = setup(OPENAI_CONFIG);

    const result = await service.save({ provider: 'OPENAI', model: 'gpt-4o' });

    expect(result).toMatchObject({ ok: true });
    expect(repository.stored).toEqual({
      provider: 'OPENAI',
      credential: 'sk-secreta',
      model: 'gpt-4o',
    });
  });

  it('recusa CUSTOM sem base informada', async () => {
    const { repository, service } = setup();

    const result = await service.save({
      provider: 'CUSTOM',
      apiBase: '',
      credential: 'sk',
      model: 'm',
    });

    expect(result).toMatchObject({ ok: false });
    expect('errors' in result && result.errors.apiBase).toBeTruthy();
    expect(repository.stored).toBeUndefined();
  });
});

describe('permissão de host', () => {
  it('solicita sempre a origem específica, nunca um padrão abrangente', async () => {
    const { permissions, service } = setup(CUSTOM_CONFIG);

    await service.requestPermission('https://gateway.exemplo');

    expect(permissions.requested).toEqual(['https://gateway.exemplo']);
    for (const origin of permissions.requested) {
      expect(origin).not.toContain('*');
      expect(origin).not.toContain('<all_urls>');
      expect(new URL(origin).pathname).toBe('/');
    }
  });

  it('não solicita de novo quando o acesso já foi concedido', async () => {
    const { permissions, service } = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');

    await expect(service.requestPermission('https://gateway.exemplo')).resolves.toBe(true);

    expect(permissions.requested).toEqual([]);
  });

  it('informa a recusa sem emitir requisição nem enviar credencial', async () => {
    const { permissions, tester, service } = setup(CUSTOM_CONFIG);
    permissions.grantOnRequest = false;

    const granted = await service.requestPermission('https://gateway.exemplo');
    const result = await service.testConnection('MODEL_LIST');

    expect(granted).toBe(false);
    expect(result).toEqual({ ok: false, reason: 'PERMISSION_MISSING' });
    expect(tester.requests).toEqual([]);
  });

  it('recusa testar quando a permissão foi revogada por fora da extensão', async () => {
    const { permissions, tester, service } = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');
    permissions.granted.delete('https://gateway.exemplo');

    await expect(service.testConnection('MODEL_LIST')).resolves.toEqual({
      ok: false,
      reason: 'PERMISSION_MISSING',
    });
    expect(tester.requests).toEqual([]);
  });
});

describe('teste de conexão', () => {
  it('encaminha a configuração e a forma de verificação ao adapter', async () => {
    const { tester, service } = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');

    await expect(service.testConnection('MODEL_LIST')).resolves.toEqual({ ok: true });

    expect(tester.requests).toEqual([
      { config: CUSTOM_CONFIG, probe: 'MODEL_LIST', signal: undefined },
    ]);
  });

  it('só usa o envio mínimo quando a interface o solicita explicitamente', async () => {
    const { tester, service } = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');
    tester.results = [{ ok: false, reason: 'MODEL_LIST_UNSUPPORTED', status: 404 }];

    const first = await service.testConnection('MODEL_LIST');
    expect(first).toEqual({ ok: false, reason: 'MODEL_LIST_UNSUPPORTED', status: 404 });
    expect(tester.requests.map((request) => request.probe)).toEqual(['MODEL_LIST']);

    await service.testConnection('MINIMAL_COMPLETION');

    expect(tester.requests.map((request) => request.probe)).toEqual([
      'MODEL_LIST',
      'MINIMAL_COMPLETION',
    ]);
  });

  it('não expõe nenhuma operação de geração na porta', () => {
    const tester: AiConnectionTester = new FakeAiConnectionTester();

    expect(Object.keys(createAiProviderService({
      repository: new InMemoryAiProviderConfigRepository(),
      permissions: new FakeHostPermissions(),
      tester,
    })).sort()).toEqual(['load', 'remove', 'requestPermission', 'save', 'testConnection']);

    // @ts-expect-error a porta expõe somente testConnection nesta capability.
    expect(tester.generate).toBeUndefined();
    // @ts-expect-error a porta expõe somente testConnection nesta capability.
    expect(tester.complete).toBeUndefined();
  });
});

describe('remoção da configuração', () => {
  it('apaga a credencial e revoga a permissão da origem', async () => {
    const { repository, permissions, service } = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');

    const result = await service.remove();

    expect(result).toEqual({ ok: true, permissionRevoked: true });
    expect(repository.stored).toBeUndefined();
    expect(permissions.revoked).toEqual(['https://gateway.exemplo']);
    expect(permissions.granted.has('https://gateway.exemplo')).toBe(false);
  });

  it('não falha quando não havia nada configurado', async () => {
    const { permissions, service } = setup();

    await expect(service.remove()).resolves.toEqual({ ok: true, permissionRevoked: false });
    expect(permissions.revoked).toEqual([]);
  });
});
