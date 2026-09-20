import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import type { AiSubtaskSuggestionResponse } from '@/application/ai/ai-subtask-suggester';
import {
  AI_GENERATION_BODY_LIMIT,
  runAiGeneration,
  type GeneratedTextExtractor,
} from '@/infrastructure/ai/ai-generation';

const CREDENTIAL = 'sk-abc123SEGREDO';
const ORIGIN = 'https://api.exemplo';
const URL = `${ORIGIN}/v1/chat/completions`;

/** Corpo de erro no formato em que provedores ecoam trechos da chave recusada. */
const CREDENTIAL_ECHO_BODY = JSON.stringify({
  error: { message: `Incorrect API key provided: ${CREDENTIAL}.`, code: 'invalid_api_key' },
});

const SUCCESS_BODY = JSON.stringify({
  id: 'resposta-1',
  choices: [{ message: { content: `Montar roteiro\nPreparar dados` } }],
  usage: { total_tokens: 42, chave_ecoada: CREDENTIAL },
});

let fetchMock: ReturnType<typeof vi.fn>;
let consoleError: MockInstance<typeof console.error>;
let consoleLog: MockInstance<typeof console.log>;
let consoleWarn: MockInstance<typeof console.warn>;
let consoleInfo: MockInstance<typeof console.info>;
let cancelled: number;
let chunksDelivered: number;

/** Caminho mínimo do formato compatível com OpenAI, usado como extrator de referência. */
const extract: GeneratedTextExtractor = (payload) => {
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices)) return undefined;
  const content = (choices[0] as { message?: { content?: unknown } } | undefined)?.message?.content;
  return typeof content === 'string' ? content : undefined;
};

/** Resposta cujo corpo é entregue em pedaços, como um fluxo real. */
function streamed(body: string, { ok = true, status = 200, chunkSize = body.length } = {}): Response {
  const encoder = new TextEncoder();
  let offset = 0;

  return {
    ok,
    status,
    text: () => Promise.resolve(body),
    body: {
      getReader: () => ({
        read: () => {
          if (offset >= body.length) {
            return Promise.resolve({ done: true, value: undefined });
          }

          const slice = body.slice(offset, offset + chunkSize);
          offset += chunkSize;
          chunksDelivered += 1;
          return Promise.resolve({ done: false, value: encoder.encode(slice) });
        },
        cancel: () => {
          cancelled += 1;
          return Promise.resolve();
        },
      }),
    },
  } as unknown as Response;
}

/** Resposta sem fluxo legível, para exercitar o caminho de leitura direta por texto. */
function plain(body: string, { ok = true, status = 200 } = {}): Response {
  return { ok, status, text: () => Promise.resolve(body), body: null } as unknown as Response;
}

/** Tudo o que o console recebeu, serializado, para provar o que nunca é registrado. */
function loggedText(): string {
  return [consoleError, consoleLog, consoleWarn, consoleInfo]
    .flatMap((spy) => spy.mock.calls)
    .map((call) => call.map((value) => JSON.stringify(value) ?? String(value)).join(' '))
    .join('\n');
}

function generate(signal?: AbortSignal): Promise<AiSubtaskSuggestionResponse> {
  return runAiGeneration(
    URL,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${CREDENTIAL}` },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Título: Preparar a demo' }] }),
    },
    { origin: ORIGIN, extract, signal },
  );
}

beforeEach(() => {
  cancelled = 0;
  chunksDelivered = 0;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runAiGeneration', () => {
  it('mantém as defesas de transporte da verificação de conexão', async () => {
    fetchMock.mockResolvedValue(streamed(SUCCESS_BODY));

    await generate();

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(URL);
    expect(init.redirect).toBe('error');
    expect(init.cache).toBe('no-store');
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(init.signal).toBeDefined();
  });

  it('extrai apenas o caminho mínimo até o texto gerado', async () => {
    fetchMock.mockResolvedValue(streamed(SUCCESS_BODY));

    await expect(generate()).resolves.toEqual({
      ok: true,
      text: 'Montar roteiro\nPreparar dados',
    });
  });

  it('recusa o 3xx observado, ainda que o redirecionamento nunca seja seguido', async () => {
    fetchMock.mockResolvedValue(plain('', { ok: false, status: 302 }));

    await expect(generate()).resolves.toEqual({
      ok: false,
      reason: 'UNEXPECTED_RESPONSE',
      status: 302,
    });
  });

  it('descarta o erro capturado sem propagá-lo nem registrá-lo', async () => {
    const thrown = new Error(`falha ao POST ${URL} com Authorization: Bearer ${CREDENTIAL}`);
    fetchMock.mockRejectedValue(thrown);

    await expect(generate()).resolves.toEqual({ ok: false, reason: 'ENDPOINT_UNREACHABLE' });
    expect(loggedText()).not.toContain(CREDENTIAL);
    expect(loggedText()).not.toContain('/v1/chat/completions');
    expect(loggedText()).toContain(ORIGIN);
  });

  it('traduz o cancelamento externo em origem inalcançável, sem detalhe algum', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(
      () => new Promise((_, reject) => controller.signal.addEventListener('abort', () => reject(new Error('abortado')))),
    );

    const pending = generate(controller.signal);
    controller.abort();

    await expect(pending).resolves.toEqual({ ok: false, reason: 'ENDPOINT_UNREACHABLE' });
  });

  describe('corpo de erro 401 que contém trecho de credencial', () => {
    beforeEach(() => {
      fetchMock.mockResolvedValue(streamed(CREDENTIAL_ECHO_BODY, { ok: false, status: 401 }));
    });

    it('devolve credencial inválida sem qualquer trecho do corpo', async () => {
      const result = await generate();

      expect(result).toEqual({ ok: false, reason: 'INVALID_CREDENTIALS', status: 401 });
      expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
      expect(JSON.stringify(result)).not.toContain('invalid_api_key');
    });

    it('não registra a credencial nem o corpo em nenhuma chamada de log', async () => {
      await generate();

      expect(loggedText()).not.toContain(CREDENTIAL);
      expect(loggedText()).not.toContain('Incorrect API key');
      expect(loggedText()).toContain('INVALID_CREDENTIALS');
    });

    it('não chega a ler o corpo de erro', async () => {
      await generate();

      expect(chunksDelivered).toBe(0);
    });
  });

  it('não registra nem devolve o corpo de uma resposta bem-sucedida', async () => {
    fetchMock.mockResolvedValue(streamed(SUCCESS_BODY));

    const result = await generate();

    expect(loggedText()).not.toContain(CREDENTIAL);
    expect(loggedText()).not.toContain('resposta-1');
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
    expect(JSON.stringify(result)).not.toContain('resposta-1');
  });

  it('interrompe a leitura de um corpo desproporcional pelo limite defensivo', async () => {
    const oversized = `{"choices":[{"message":{"content":"${'a'.repeat(AI_GENERATION_BODY_LIMIT * 3)}"}}]}`;
    fetchMock.mockResolvedValue(streamed(oversized, { chunkSize: 8 * 1024 }));

    const result = await generate();

    expect(result).toEqual({ ok: false, reason: 'UNREADABLE_RESPONSE', status: 200 });
    expect(cancelled).toBe(1);
    // A leitura parou logo depois de ultrapassar o limite, longe do corpo inteiro.
    expect(chunksDelivered).toBeLessThan(oversized.length / (8 * 1024));
  });

  it('aplica o limite defensivo também quando a resposta não expõe fluxo legível', async () => {
    fetchMock.mockResolvedValue(plain('a'.repeat(AI_GENERATION_BODY_LIMIT + 1)));

    await expect(generate()).resolves.toEqual({
      ok: false,
      reason: 'UNREADABLE_RESPONSE',
      status: 200,
    });
  });

  it('devolve resposta vazia quando o caminho existe mas vem sem texto aproveitável', async () => {
    fetchMock.mockResolvedValue(streamed(JSON.stringify({ choices: [{ message: { content: '   \n' } }] })));

    await expect(generate()).resolves.toEqual({
      ok: false,
      reason: 'EMPTY_RESPONSE',
      status: 200,
    });
  });

  it('devolve resposta impossível de interpretar quando a estrutura não permite extrair o texto', async () => {
    fetchMock.mockResolvedValue(streamed(JSON.stringify({ resultado: 'formato desconhecido' })));

    await expect(generate()).resolves.toEqual({
      ok: false,
      reason: 'UNREADABLE_RESPONSE',
      status: 200,
    });
  });

  it('devolve resposta impossível de interpretar quando o corpo não é JSON válido', async () => {
    fetchMock.mockResolvedValue(streamed(`<html>erro do gateway com ${CREDENTIAL}</html>`));

    const result = await generate();

    expect(result).toEqual({ ok: false, reason: 'UNREADABLE_RESPONSE', status: 200 });
    expect(JSON.stringify(result)).not.toContain(CREDENTIAL);
    expect(loggedText()).not.toContain(CREDENTIAL);
  });
});
