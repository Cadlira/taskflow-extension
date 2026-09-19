import {
  AiConfigStorageError,
  type AiProviderConfigRepository,
} from '@/application/ai/ai-provider-config-repository';
import type { AiProviderConfig } from '@/domain/ai-provider';
import {
  AI_CONFIG_STORAGE_KEY,
  decodeStoredAiConfig,
  encodeStoredAiConfig,
} from '@/infrastructure/storage/stored-ai-config';

function unavailable(cause: unknown): AiConfigStorageError {
  return new AiConfigStorageError(
    'UNAVAILABLE',
    'Não foi possível acessar o armazenamento local.',
    { cause },
  );
}

/**
 * Repository da configuração de provedor sobre `chrome.storage.local`, em chave própria e
 * versionada. Nunca usa armazenamento sincronizado: a credencial não é replicada para os
 * servidores do navegador nem para outros dispositivos do perfil.
 */
export class ChromeAiProviderConfigRepository implements AiProviderConfigRepository {
  async read(): Promise<AiProviderConfig | undefined> {
    let stored: Record<string, unknown>;

    try {
      stored = await browser.storage.local.get(AI_CONFIG_STORAGE_KEY);
    } catch (error) {
      throw unavailable(error);
    }

    return decodeStoredAiConfig(stored[AI_CONFIG_STORAGE_KEY]);
  }

  async save(config: AiProviderConfig): Promise<void> {
    try {
      await browser.storage.local.set({
        [AI_CONFIG_STORAGE_KEY]: encodeStoredAiConfig(config),
      });
    } catch (error) {
      throw unavailable(error);
    }
  }

  async remove(): Promise<void> {
    try {
      await browser.storage.local.remove(AI_CONFIG_STORAGE_KEY);
    } catch (error) {
      throw unavailable(error);
    }
  }
}
