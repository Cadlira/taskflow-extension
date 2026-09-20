import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  createChromeAiProviderService,
  createChromeAiSubtaskSuggestionService,
} from '@/composition/chrome-ai-service';
import type { AiProviderConfig } from '@/domain/ai-provider';
import { ANTHROPIC_DIRECT_BROWSER_HEADER } from '@/infrastructure/ai/anthropic-adapter';
import {
  AI_CONFIG_STORAGE_KEY,
  encodeStoredAiConfig,
} from '@/infrastructure/storage/stored-ai-config';

/** O tipo publicado pelo fake-browser declara retorno vazio; o contrato real resolve booleano. */
const grantsEverything = (async () => true) as unknown as never;

let fetchMock: ReturnType<typeof vi.fn>;

async function seed(config: AiProviderConfig): Promise<void> {
  await fakeBrowser.storage.local.set({
    [AI_CONFIG_STORAGE_KEY]: encodeStoredAiConfig(config),
  });
}

function headerValue(init: RequestInit, name: string): string | undefined {
  const headers = init.headers as Record<string, string> | undefined;
  return Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  )?.[1];
}

beforeEach(() => {
  fakeBrowser.reset();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation(grantsEverything);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('composição do serviço de provedores para o Side Panel', () => {
  it('resolve o adapter compatível com OpenAI para OPENAI', async () => {
    await seed({ provider: 'OPENAI', credential: 'sk-abc', model: 'gpt-4o-mini' });

    await expect(createChromeAiProviderService().testConnection('MODEL_LIST')).resolves.toEqual({
      ok: true,
    });

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(headerValue(init, 'authorization')).toBe('Bearer sk-abc');
  });

  it('resolve o adapter Anthropic para ANTHROPIC', async () => {
    await seed({ provider: 'ANTHROPIC', credential: 'sk-ant', model: 'claude-sonnet-4' });

    await createChromeAiProviderService().testConnection('MODEL_LIST');

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/models');
    expect(headerValue(init, 'x-api-key')).toBe('sk-ant');
    expect(headerValue(init, ANTHROPIC_DIRECT_BROWSER_HEADER)).toBe('true');
    expect(headerValue(init, 'authorization')).toBeUndefined();
  });

  it('resolve o adapter compatível com OpenAI para CUSTOM, com a base informada', async () => {
    await seed({
      provider: 'CUSTOM',
      apiBase: 'http://localhost:11434/v1',
      credential: 'ollama',
      model: 'llama3.1',
    });

    await createChromeAiProviderService().testConnection('MODEL_LIST');

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/v1/models');
    expect(headerValue(init, 'authorization')).toBe('Bearer ollama');
    expect(headerValue(init, 'x-api-key')).toBeUndefined();
  });

  it('lê e grava pela chave taskflow.ai do armazenamento local', async () => {
    const service = createChromeAiProviderService();

    await service.save({ provider: 'OPENAI', credential: 'sk-abc', model: 'gpt-4o-mini' });

    expect((await fakeBrowser.storage.local.get(null))[AI_CONFIG_STORAGE_KEY]).toEqual({
      schemaVersion: 1,
      config: { provider: 'OPENAI', credential: 'sk-abc', model: 'gpt-4o-mini' },
    });
    await expect(service.load()).resolves.toMatchObject({ state: 'CONFIGURED' });
  });

  it('não contata nenhum provedor ao ler o estado atual', async () => {
    await seed({ provider: 'OPENAI', credential: 'sk-abc', model: 'gpt-4o-mini' });

    await createChromeAiProviderService().load();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('composição da sugestão de subtarefas para o Side Panel', () => {
  const CONTENT = 'Instruções fixas\n\nTítulo: Preparar a demo';

  function suggest() {
    return createChromeAiSubtaskSuggestionService().suggest({
      content: CONTENT,
      existingSubtaskCount: 0,
    });
  }

  /** Resposta de geração entregue em fluxo, como o executor de geração a lê. */
  function generated(body: string): Response {
    const encoder = new TextEncoder();
    let delivered = false;

    return {
      ok: true,
      status: 200,
      text: () => Promise.resolve(body),
      body: {
        getReader: () => ({
          read: () => {
            if (delivered) return Promise.resolve({ done: true, value: undefined });
            delivered = true;
            return Promise.resolve({ done: false, value: encoder.encode(body) });
          },
          cancel: () => Promise.resolve(),
        }),
      },
    } as unknown as Response;
  }

  it('resolve o adapter de geração compatível com OpenAI para OPENAI', async () => {
    await seed({ provider: 'OPENAI', credential: 'sk-abc', model: 'gpt-4o-mini' });
    fetchMock.mockResolvedValue(
      generated(JSON.stringify({ choices: [{ message: { content: 'Montar roteiro' } }] })),
    );

    await expect(suggest()).resolves.toEqual({
      ok: true,
      proposal: { drafts: [{ title: 'Montar roteiro' }], discardedByLimit: false },
    });

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('https://api.openai.com/v1/chat/completions');
    expect(headerValue(init, 'authorization')).toBe('Bearer sk-abc');
  });

  it('resolve o adapter de geração da Anthropic para ANTHROPIC', async () => {
    await seed({ provider: 'ANTHROPIC', credential: 'sk-ant', model: 'claude-sonnet-4' });
    fetchMock.mockResolvedValue(
      generated(JSON.stringify({ content: [{ type: 'text', text: 'Montar roteiro' }] })),
    );

    await expect(suggest()).resolves.toMatchObject({ ok: true });

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headerValue(init, 'x-api-key')).toBe('sk-ant');
    expect(headerValue(init, ANTHROPIC_DIRECT_BROWSER_HEADER)).toBe('true');
    expect(headerValue(init, 'authorization')).toBeUndefined();
  });

  it('mantém CUSTOM no adapter compatível com OpenAI, com a base informada', async () => {
    await seed({
      provider: 'CUSTOM',
      apiBase: 'http://localhost:11434/v1',
      credential: 'ollama',
      model: 'llama3.1',
    });
    fetchMock.mockResolvedValue(
      generated(JSON.stringify({ choices: [{ message: { content: 'Montar roteiro' } }] })),
    );

    await expect(suggest()).resolves.toMatchObject({ ok: true });

    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(headerValue(init, 'authorization')).toBe('Bearer ollama');
    expect(headerValue(init, 'x-api-key')).toBeUndefined();
  });

  it('não contata nenhum provedor quando não há configuração salva', async () => {
    await expect(suggest()).resolves.toEqual({ ok: false, state: 'NOT_CONFIGURED' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
