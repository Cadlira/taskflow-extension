import {
  AI_GENERATION_TIMEOUT_MS,
  type AiGenerationFailure,
  type AiSubtaskSuggestionResponse,
} from '@/application/ai/ai-subtask-suggester';
import { failureForStatus, logAiFailure } from './ai-probe';

/**
 * Limite defensivo do corpo lido. Um gateway defeituoso ou hostil não devolve um corpo
 * desproporcional para dentro da extensão: a leitura é interrompida ao ultrapassá-lo.
 */
export const AI_GENERATION_BODY_LIMIT = 64 * 1024;

/**
 * Extrai o texto gerado navegando apenas o caminho mínimo do formato do provedor. Devolve
 * `undefined` quando a estrutura não permite chegar ao texto; devolver uma string vazia significa
 * que o caminho existe e veio vazio.
 */
export type GeneratedTextExtractor = (payload: unknown) => string | undefined;

export interface GenerationContext {
  origin: string;
  extract: GeneratedTextExtractor;
  /** Cancelamento externo, somado ao limite de tempo próprio do executor. */
  signal?: AbortSignal | undefined;
}

function failed(
  reason: AiGenerationFailure,
  origin: string,
  status?: number,
): AiSubtaskSuggestionResponse {
  logAiFailure(reason, origin, status);
  return { ok: false, reason, ...(status !== undefined && { status }) };
}

/**
 * Lê o corpo como texto, interrompendo assim que o limite defensivo é ultrapassado. Devolve
 * `undefined` quando o corpo excede o limite; o texto lido até ali é descartado sem ser usado.
 */
async function readLimitedText(response: Response): Promise<string | undefined> {
  const stream = response.body;

  if (stream === null || typeof stream?.getReader !== 'function') {
    const whole = await response.text();
    return whole.length > AI_GENERATION_BODY_LIMIT ? undefined : whole;
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      return text + decoder.decode();
    }

    text += decoder.decode(value, { stream: true });

    if (text.length > AI_GENERATION_BODY_LIMIT) {
      // Interrompe a leitura: o restante do corpo nunca entra na memória da extensão.
      await reader.cancel();
      return undefined;
    }
  }
}

/**
 * Executa a requisição de geração já montada pelo adapter e traduz o desfecho. Separado de
 * `runAiProbe` de propósito: aquele descarta o corpo sem ler, e este é o único caminho do TaskFlow
 * que o lê. Manter os dois executores impede que a decisão mais sensível do sistema vire um
 * parâmetro fácil de inverter por engano.
 *
 * Nada do corpo entra em log, em mensagem de erro, em objeto de exceção ou em armazenamento, nem
 * mesmo em respostas de sucesso: um gateway operado por terceiros pode ecoar a credencial.
 */
export async function runAiGeneration(
  url: string,
  init: RequestInit,
  { origin, extract, signal }: GenerationContext,
): Promise<AiSubtaskSuggestionResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AI_GENERATION_TIMEOUT_MS);
  const cancel = (): void => controller.abort();
  signal?.addEventListener('abort', cancel);

  try {
    const response = await fetch(url, {
      ...init,
      // Um redirecionamento desviaria a credencial e o conteúdo da tarefa: nunca é seguido.
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });

    // Defesa em profundidade: `redirect: 'error'` já impede seguir, e um 3xx observado é recusado.
    if (response.status >= 300 && response.status < 400) {
      return failed('UNEXPECTED_RESPONSE', origin, response.status);
    }

    if (!response.ok) {
      // O corpo de erro não é lido: é justamente ali que provedores ecoam trechos da chave.
      return failed(failureForStatus(response.status), origin, response.status);
    }

    const body = await readLimitedText(response);

    if (body === undefined) {
      return failed('UNREADABLE_RESPONSE', origin, response.status);
    }

    let text: string | undefined;

    try {
      text = extract(JSON.parse(body) as unknown);
    } catch {
      // O erro capturado é descartado: ele costuma carregar o trecho do corpo que o produziu.
      text = undefined;
    }

    if (text === undefined) {
      return failed('UNREADABLE_RESPONSE', origin, response.status);
    }

    if (text.trim() === '') {
      return failed('EMPTY_RESPONSE', origin, response.status);
    }

    return { ok: true, text };
  } catch {
    // O erro capturado é descartado: ele pode carregar a requisição inteira, com cabeçalhos.
    return failed(timedOut ? 'TIMEOUT' : 'ENDPOINT_UNREACHABLE', origin);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
