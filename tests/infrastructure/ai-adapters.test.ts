import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import {
  AI_CONNECTION_TIMEOUT_MS,
  AI_MINIMAL_PROBE_CONTENT,
  type AiConnectionProbe,
  type AiConnectionResult,
} from '@/application/ai/ai-connection-tester';
import type { AiProviderConfig } from '@/domain/ai-provider';
import {
  AnthropicConnectionTester,
  ANTHROPIC_DIRECT_BROWSER_HEADER,
  ANTHROPIC_VERSION,
} from '@/infrastructure/ai/anthropic-adapter';
import { OpenAiCompatibleConnectionTester } from '@/infrastructure/ai/openai-adapter';
import { buildTask } from '../support/task-fixtures';

const CREDENTIAL = 'sk-abc123SEGREDO';

const OPENAI: AiProviderConfig = {
  provider: 'OPENAI',
  credential: CREDENTIAL,
  model: 'gpt-4o-mini',
};

const CUSTOM: AiProviderConfig = {
  provider: 'CUSTOM',
  apiBase: 'http://localhost:11434/v1',
  credential: CREDENTIAL,
  model: 'llama3.1',
};

const ANTHROPIC: AiProviderConfig = {
  provider: 'ANTHROPIC',
  credential: CREDENTIAL,
  model: 'claude-sonnet-4',
};

interface FakeResponse {
  ok: boolean;
  status: number;
  /** Corpo que o adapter nunca deve ler; presente para provar que é descartado. */
  body?: string;
}

let fetchMock: ReturnType<typeof vi.fn>;
let consoleError: MockInstance<typeof console.error>;
let bodyReads: number;

function respond({ ok, status, body = '' }: FakeResponse): Response {
  const read = () => {
    bodyReads += 1;
    return Promise.resolve(body);
  };

  return {
    ok,
    status,
    text: read,
    json: () => read().then(() => JSON.parse(body || '{}') as unknown),
    body: { getReader: read },
  } as unknown as Response;
}

function lastCall(): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(-1);
  if (!call) throw new Error('fetch não foi chamado');
  return call as [string, RequestInit];
}

function headerValue(init: RequestInit, name: string): string | undefined {
  const headers = init.headers as Record<string, string> | undefined;
  const entry = Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return entry?.[1];
}

/** Tudo o que o console recebeu, serializado, para provar o que nunca é registrado. */
function loggedText(): string {
  return consoleError.mock.calls
    .map((call) => call.map((value) => JSON.stringify(value) ?? String(value)).join(' '))
    .join('\n');
}

beforeEach(() => {
  bodyReads = 0;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function testOpenAi(config: AiProviderConfig, probe: AiConnectionProbe = 'MODEL_LIST') {
  return new OpenAiCompatibleConnectionTester().testConnection({ config, probe });
}

function testAnthropic(probe: AiConnectionProbe = 'MODEL_LIST') {
  return new AnthropicConnectionTester().testConnection({ config: ANTHROPIC, probe });
}

describe('adapter compatível com OpenAI', () => {
  it('consulta a listagem de modelos autenticando pelo cabeçalho de portador', async () => {
    fetchMock.mockResolvedValue(respond({ ok: true, status: 200, body: '{"data":[]}' }));

    await expect(testOpenAi(OPENAI)).resolves.toEqual({ ok: true });

    const [url, init] = lastCall();
    expect(url).toBe('https://api.openai.com/v1/models');
    expect(init.method).toBe('GET');
    expect(headerValue(init, 'authorization')).toBe(`Bearer ${CREDENTIAL}`);
  });

  it('usa a base informada quando o provedor é CUSTOM', async () => {
    fetchMock.mockResolvedValue(respond({ ok: true, status: 200 }));

    await testOpenAi(CUSTOM);

    expect(lastCall()[0]).toBe('http://localhost:11434/v1/models');
  });

  it('recusa seguir redirecionamento e informa resposta inesperada', async () => {
    fetchMock.mockResolvedValue(respond({ ok: false, status: 302 }));

    await expect(testOpenAi(OPENAI)).resolves.toEqual({
      ok: false,
      reason: 'UNEXPECTED_RESPONSE',
      status: 302,
    });
    expect(lastCall()[1].redirect).toBe('error');
  });

  it('aborta e informa tempo esgotado quando o provedor não responde', async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const pending = testOpenAi(OPENAI);
    await vi.advanceTimersByTimeAsync(AI_CONNECTION_TIMEOUT_MS);

    await expect(pending).resolves.toEqual({ ok: false, reason: 'TIMEOUT' });
  });

  it('informa origem inalcançável quando a requisição falha antes da resposta', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(testOpenAi(CUSTOM)).resolves.toEqual({
      ok: false,
      reason: 'ENDPOINT_UNREACHABLE',
    });
  });

  it('é cancelável por sinal externo', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          );
        }),
    );

    const pending = new OpenAiCompatibleConnectionTester().testConnection({
      config: OPENAI,
      probe: 'MODEL_LIST',
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).resolves.toMatchObject({ ok: false });
  });
});

describe('adapter Anthropic', () => {
  it('envia a chave própria, a versão da API e o cabeçalho de acesso direto do navegador', async () => {
    fetchMock.mockResolvedValue(respond({ ok: true, status: 200 }));

    await expect(testAnthropic()).resolves.toEqual({ ok: true });

    const [url, init] = lastCall();
    expect(url).toBe('https://api.anthropic.com/v1/models');
    expect(headerValue(init, 'x-api-key')).toBe(CREDENTIAL);
    expect(headerValue(init, 'anthropic-version')).toBe(ANTHROPIC_VERSION);
    expect(headerValue(init, ANTHROPIC_DIRECT_BROWSER_HEADER)).toBe('true');
    expect(headerValue(init, 'authorization')).toBeUndefined();
  });

  it('mantém os três cabeçalhos também no envio mínimo', async () => {
    fetchMock.mockResolvedValue(respond({ ok: true, status: 200 }));

    await testAnthropic('MINIMAL_COMPLETION');

    const [url, init] = lastCall();
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(headerValue(init, 'x-api-key')).toBe(CREDENTIAL);
    expect(headerValue(init, 'anthropic-version')).toBe(ANTHROPIC_VERSION);
    expect(headerValue(init, ANTHROPIC_DIRECT_BROWSER_HEADER)).toBe('true');
  });
});

describe('alternativa quando a listagem de modelos não existe', () => {
  it('informa listagem indisponível em vez de falha genérica', async () => {
    fetchMock.mockResolvedValue(respond({ ok: false, status: 404 }));

    await expect(testOpenAi(CUSTOM)).resolves.toEqual({
      ok: false,
      reason: 'MODEL_LIST_UNSUPPORTED',
      status: 404,
    });
  });

  it('envia conteúdo literal fixo e um token de resposta, sem nenhum dado de tarefa', async () => {
    fetchMock.mockResolvedValue(respond({ ok: true, status: 200 }));
    const task = buildTask({ title: 'Revisar proposta secreta', description: 'confidencial' });

    await testOpenAi(CUSTOM, 'MINIMAL_COMPLETION');

    const [url, init] = lastCall();
    expect(url).toBe('http://localhost:11434/v1/chat/completions');
    expect(JSON.parse(String(init.body))).toEqual({
      model: 'llama3.1',
      messages: [{ role: 'user', content: AI_MINIMAL_PROBE_CONTENT }],
      max_tokens: 1,
    });
    expect(String(init.body)).not.toContain(task.title);
    expect(String(init.body)).not.toContain(task.description);
    expect(String(init.body)).not.toContain(task.id);
  });

  it('não trata 404 do envio mínimo como listagem indisponível', async () => {
    fetchMock.mockResolvedValue(respond({ ok: false, status: 404 }));

    await expect(testOpenAi(CUSTOM, 'MINIMAL_COMPLETION')).resolves.toEqual({
      ok: false,
      reason: 'UNEXPECTED_RESPONSE',
      status: 404,
    });
  });
});

describe('tradução de falhas sem vazamento', () => {
  it('traduz 401 com trecho da credencial no corpo para INVALID_CREDENTIALS', async () => {
    const body = `{"error":{"message":"Incorrect API key provided: ${CREDENTIAL}"}}`;
    fetchMock.mockResolvedValue(respond({ ok: false, status: 401, body }));

    const result = await testOpenAi(OPENAI);

    expect(result).toEqual({ ok: false, reason: 'INVALID_CREDENTIALS', status: 401 });
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
    expect(loggedText()).not.toContain(CREDENTIAL);
    expect(bodyReads).toBe(0);
  });

  it('traduz 403 para credencial inválida e demais estados para resposta inesperada', async () => {
    const outcomes: Array<[number, AiConnectionResult]> = [
      [403, { ok: false, reason: 'INVALID_CREDENTIALS', status: 403 }],
      [429, { ok: false, reason: 'UNEXPECTED_RESPONSE', status: 429 }],
      [500, { ok: false, reason: 'UNEXPECTED_RESPONSE', status: 500 }],
      [504, { ok: false, reason: 'TIMEOUT', status: 504 }],
    ];

    for (const [status, expected] of outcomes) {
      fetchMock.mockResolvedValue(respond({ ok: false, status }));
      await expect(testOpenAi(OPENAI)).resolves.toEqual(expected);
    }
  });

  it('registra apenas motivo, origem e código de estado', async () => {
    fetchMock.mockResolvedValue(
      respond({ ok: false, status: 401, body: `chave ${CREDENTIAL} inválida` }),
    );

    await testOpenAi(CUSTOM);

    expect(consoleError).toHaveBeenCalledTimes(1);
    const [message, details] = consoleError.mock.calls[0]!;
    expect(message).toBe('TaskFlow: falha ao contatar o provedor de IA.');
    expect(details).toEqual({
      reason: 'INVALID_CREDENTIALS',
      origin: 'http://localhost:11434',
      status: 401,
    });
  });

  it('registra falha de rede sem o endereço completo, a consulta ou cabeçalhos', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch https://gateway.exemplo/v1/models'));

    await testOpenAi({
      provider: 'CUSTOM',
      apiBase: 'https://gateway.exemplo/ia/v1',
      credential: CREDENTIAL,
      model: 'm',
    });

    const logged = loggedText();
    expect(consoleError.mock.calls[0]![1]).toEqual({
      reason: 'ENDPOINT_UNREACHABLE',
      origin: 'https://gateway.exemplo',
    });
    expect(logged).not.toContain('/ia/v1');
    expect(logged).not.toContain('/models');
    expect(logged).not.toContain('Bearer');
    expect(logged).not.toContain('authorization');
    expect(logged).not.toContain(CREDENTIAL);
  });

  it('não registra nem lê o corpo de uma resposta bem-sucedida', async () => {
    fetchMock.mockResolvedValue(
      respond({ ok: true, status: 200, body: `{"data":[{"id":"${CREDENTIAL}"}]}` }),
    );

    const result = await testOpenAi(OPENAI);

    expect(result).toEqual({ ok: true });
    expect(Object.keys(result)).toEqual(['ok']);
    expect(bodyReads).toBe(0);
    expect(consoleError).not.toHaveBeenCalled();
  });

  it('não devolve objeto de erro com cause carregando dados da requisição', async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new TypeError('Failed to fetch'), {
        cause: { headers: { Authorization: `Bearer ${CREDENTIAL}` } },
      }),
    );

    const result = await testOpenAi(OPENAI);

    expect(result).toBeInstanceOf(Object);
    expect(result).not.toBeInstanceOf(Error);
    expect('cause' in result).toBe(false);
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
    expect(loggedText()).not.toContain(CREDENTIAL);
  });

  it('não envia a credencial em cookies nem no referenciador', async () => {
    fetchMock.mockResolvedValue(respond({ ok: true, status: 200 }));

    await testOpenAi(OPENAI);

    const [, init] = lastCall();
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.cache).toBe('no-store');
  });
});
