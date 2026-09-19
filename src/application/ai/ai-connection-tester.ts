import type { AiProvider, AiProviderConfig } from '@/domain/ai-provider';

/**
 * Conjunto fechado de motivos de falha. Toda falha é traduzida para um destes valores: o corpo
 * devolvido pelo provedor nunca chega à interface nem ao log, porque pode ecoar trechos da
 * credencial.
 */
export type AiConnectionFailure =
  | 'INVALID_CREDENTIALS'
  | 'PERMISSION_MISSING'
  | 'ENDPOINT_UNREACHABLE'
  | 'MODEL_LIST_UNSUPPORTED'
  | 'TIMEOUT'
  | 'UNEXPECTED_RESPONSE';

/**
 * Forma da verificação. `MODEL_LIST` consulta a listagem de modelos e não consome tokens;
 * `MINIMAL_COMPLETION` é a alternativa explícita para endereços sem listagem.
 */
export type AiConnectionProbe = 'MODEL_LIST' | 'MINIMAL_COMPLETION';

/** Conteúdo literal fixo do envio mínimo. Nunca contém dado de tarefa. */
export const AI_MINIMAL_PROBE_CONTENT = 'ping';

/** Limite de tempo do teste, para que a requisição nunca fique pendente indefinidamente. */
export const AI_CONNECTION_TIMEOUT_MS = 15_000;

export type AiConnectionResult =
  | { ok: true }
  | { ok: false; reason: AiConnectionFailure; status?: number };

export interface AiConnectionTestRequest {
  config: AiProviderConfig;
  probe: AiConnectionProbe;
  /** Cancelamento externo, somado ao limite de tempo próprio do adapter. */
  signal?: AbortSignal | undefined;
}

/**
 * Porta de verificação da configuração. Expõe somente `testConnection`: nenhuma operação de
 * geração existe nesta capability.
 */
export interface AiConnectionTester {
  testConnection(request: AiConnectionTestRequest): Promise<AiConnectionResult>;
}

/**
 * Encaminha o teste ao adapter do provedor selecionado. `CUSTOM` usa o protocolo compatível com
 * OpenAI, então compartilha o adapter de `OPENAI` com outra base.
 */
export function createProviderDispatchingTester(
  testers: Record<AiProvider, AiConnectionTester>,
): AiConnectionTester {
  return {
    testConnection(request) {
      return testers[request.config.provider].testConnection(request);
    },
  };
}
