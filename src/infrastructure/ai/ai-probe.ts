import {
  AI_CONNECTION_TIMEOUT_MS,
  type AiConnectionFailure,
  type AiConnectionProbe,
  type AiConnectionResult,
} from '@/application/ai/ai-connection-tester';
import type { AiGenerationFailure } from '@/application/ai/ai-subtask-suggester';

/**
 * Registra a falha com o mínimo que ainda é útil para diagnóstico: motivo, origem de destino e
 * código de estado. Nunca a URL completa — um gateway pode aceitar a chave na cadeia de consulta —,
 * nunca cabeçalhos e nunca o corpo devolvido pelo provedor.
 */
export function logAiFailure(
  reason: AiGenerationFailure,
  origin: string,
  status?: number,
): void {
  console.error('TaskFlow: falha ao contatar o provedor de IA.', {
    reason,
    origin,
    ...(status !== undefined && { status }),
  });
}

/**
 * Traduz o código de estado para um motivo do conjunto fechado, compartilhado pela verificação e
 * pela geração: 401 significa credencial inválida nos dois caminhos. Na verificação, o corpo da
 * resposta nem chega a ser lido, porque provedores ecoam trechos da chave em mensagens de
 * credencial inválida e um gateway de terceiros pode ecoá-la por completo.
 */
export function failureForStatus(status: number, probe?: AiConnectionProbe): AiConnectionFailure {
  if (status === 401 || status === 403) {
    return 'INVALID_CREDENTIALS';
  }

  // Listagem inexistente é um caso previsto, com alternativa explícita; no envio mínimo, não.
  if (status === 404 && probe === 'MODEL_LIST') {
    return 'MODEL_LIST_UNSUPPORTED';
  }

  if (status === 408 || status === 504) {
    return 'TIMEOUT';
  }

  return 'UNEXPECTED_RESPONSE';
}

interface ProbeContext {
  origin: string;
  probe: AiConnectionProbe;
  signal?: AbortSignal | undefined;
}

/**
 * Executa a requisição já montada pelo adapter e traduz o desfecho. Não monta URL, cabeçalho nem
 * corpo: cada adapter faz isso por conta própria. A resposta de sucesso é descartada sem ser lida
 * e nada dela é registrado ou persistido.
 */
export async function runAiProbe(
  url: string,
  init: RequestInit,
  { origin, probe, signal }: ProbeContext,
): Promise<AiConnectionResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, AI_CONNECTION_TIMEOUT_MS);
  const cancel = (): void => controller.abort();
  signal?.addEventListener('abort', cancel);

  try {
    const response = await fetch(url, {
      ...init,
      // Um redirecionamento desviaria a credencial para outro destino: nunca é seguido.
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });

    // Defesa em profundidade: `redirect: 'error'` já impede seguir, e um 3xx observado é recusado.
    if (response.status >= 300 && response.status < 400) {
      logAiFailure('UNEXPECTED_RESPONSE', origin, response.status);
      return { ok: false, reason: 'UNEXPECTED_RESPONSE', status: response.status };
    }

    if (response.ok) {
      return { ok: true };
    }

    const reason = failureForStatus(response.status, probe);
    logAiFailure(reason, origin, response.status);
    return { ok: false, reason, status: response.status };
  } catch {
    // O erro capturado é descartado: ele pode carregar a requisição inteira, com cabeçalhos.
    const reason: AiConnectionFailure = timedOut ? 'TIMEOUT' : 'ENDPOINT_UNREACHABLE';
    logAiFailure(reason, origin);
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}
