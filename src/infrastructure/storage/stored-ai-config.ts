import { AiConfigStorageError } from '@/application/ai/ai-provider-config-repository';
import { isAiProvider, validateApiBase, type AiProviderConfig } from '@/domain/ai-provider';
import { readStoredEnvelope, type UnknownRecord } from './stored-task-collection';

export const AI_CONFIG_STORAGE_KEY = 'taskflow.ai';
export const AI_CONFIG_SCHEMA_VERSION = 1;

/**
 * Formato persistido da configuração de provedor. Acompanha `schemaVersion` própria para que uma
 * versão futura possa migrar sem depender da cadeia das tarefas.
 */
export interface StoredAiConfig {
  schemaVersion: typeof AI_CONFIG_SCHEMA_VERSION;
  config: AiProviderConfig;
}

function incompatibleAiConfig(cause?: unknown): AiConfigStorageError {
  return new AiConfigStorageError(
    'INCOMPATIBLE_DATA',
    'A configuração de IA salva está em um formato incompatível. Nada foi alterado para preservá-la.',
    { cause },
  );
}

function requireString(record: UnknownRecord, key: string): string {
  const value = record[key];

  if (typeof value !== 'string' || value.trim() === '') {
    throw incompatibleAiConfig();
  }

  return value;
}

function decodeConfig(value: unknown): AiProviderConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw incompatibleAiConfig();
  }

  const record = value as UnknownRecord;
  const { provider } = record;

  if (!isAiProvider(provider)) {
    throw incompatibleAiConfig();
  }

  const credential = requireString(record, 'credential');
  const model = requireString(record, 'model');

  if (provider !== 'CUSTOM') {
    // Base gravada em provedor oficial denuncia estrutura de outra origem: nada é sobrescrito.
    if (record.apiBase !== undefined) {
      throw incompatibleAiConfig();
    }

    return { provider, credential, model };
  }

  const validated = validateApiBase(requireString(record, 'apiBase'));

  if (!validated.ok) {
    throw incompatibleAiConfig();
  }

  return { provider, apiBase: validated.base, credential, model };
}

/**
 * Valida a configuração lida do armazenamento. Ausência de dados significa "nenhum provedor
 * configurado"; qualquer estrutura desconhecida é recusada integralmente, sem sobrescrever.
 */
export function decodeStoredAiConfig(value: unknown): AiProviderConfig | undefined {
  let envelope: UnknownRecord | undefined;

  try {
    envelope = readStoredEnvelope(value);
  } catch (error) {
    throw incompatibleAiConfig(error);
  }

  if (envelope === undefined) {
    return undefined;
  }

  if (envelope.schemaVersion !== AI_CONFIG_SCHEMA_VERSION) {
    throw incompatibleAiConfig();
  }

  return decodeConfig(envelope.config);
}

export function encodeStoredAiConfig(config: AiProviderConfig): StoredAiConfig {
  return { schemaVersion: AI_CONFIG_SCHEMA_VERSION, config };
}
