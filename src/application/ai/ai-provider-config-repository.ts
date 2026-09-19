import type { AiProviderConfig } from '@/domain/ai-provider';

export type AiConfigStorageErrorReason = 'INCOMPATIBLE_DATA' | 'UNAVAILABLE';

/**
 * Falha ao ler ou gravar a configuração de provedor. Nunca carrega a credencial nem qualquer
 * trecho da configuração na mensagem.
 */
export class AiConfigStorageError extends Error {
  readonly reason: AiConfigStorageErrorReason;

  constructor(reason: AiConfigStorageErrorReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'AiConfigStorageError';
    this.reason = reason;
  }
}

/**
 * Fonte persistente da configuração de provedor. No máximo uma configuração ativa: `save`
 * substitui a anterior por completo. Implementações não expõem detalhes do mecanismo local.
 */
export interface AiProviderConfigRepository {
  /** Resolve `undefined` quando nenhum provedor está configurado. */
  read(): Promise<AiProviderConfig | undefined>;
  /** Substitui a configuração ativa por completo. */
  save(config: AiProviderConfig): Promise<void>;
  /** Apaga a configuração, inclusive a credencial. */
  remove(): Promise<void>;
}
