import { describe, expect, it } from 'vitest';
import { AiConfigStorageError } from '@/application/ai/ai-provider-config-repository';
import {
  AI_CONFIG_STORAGE_KEY,
  decodeStoredAiConfig,
  encodeStoredAiConfig,
} from '@/infrastructure/storage/stored-ai-config';

describe('codec da configuração de IA', () => {
  it('usa uma chave distinta das tarefas e da lixeira', () => {
    expect(AI_CONFIG_STORAGE_KEY).toBe('taskflow.ai');
  });

  it('trata ausência da chave como nenhum provedor configurado', () => {
    expect(decodeStoredAiConfig(undefined)).toBeUndefined();
    expect(decodeStoredAiConfig(null)).toBeUndefined();
  });

  it('grava e recupera provedor oficial no envelope versionado', () => {
    const config = { provider: 'OPENAI', credential: 'sk-abc', model: 'gpt-4o-mini' } as const;

    const stored = encodeStoredAiConfig(config);

    expect(stored).toEqual({ schemaVersion: 1, config });
    expect(decodeStoredAiConfig(stored)).toEqual(config);
  });

  it('grava e recupera provedor customizado com a base normalizada', () => {
    const stored = encodeStoredAiConfig({
      provider: 'CUSTOM',
      apiBase: 'http://localhost:11434/v1',
      credential: 'ollama',
      model: 'llama3.1',
    });

    expect(decodeStoredAiConfig(stored)).toEqual({
      provider: 'CUSTOM',
      apiBase: 'http://localhost:11434/v1',
      credential: 'ollama',
      model: 'llama3.1',
    });
  });

  it.each([
    ['envelope que não é objeto', 'texto'],
    ['versão desconhecida', { schemaVersion: 99, config: {} }],
    ['configuração ausente', { schemaVersion: 1 }],
    ['provedor desconhecido', { schemaVersion: 1, config: { provider: 'GEMINI' } }],
    [
      'credencial ausente',
      { schemaVersion: 1, config: { provider: 'OPENAI', model: 'gpt-4o-mini' } },
    ],
    ['modelo ausente', { schemaVersion: 1, config: { provider: 'OPENAI', credential: 'sk' } }],
    [
      'base em provedor oficial',
      {
        schemaVersion: 1,
        config: { provider: 'OPENAI', apiBase: 'https://p.exemplo', credential: 'sk', model: 'm' },
      },
    ],
    ['base ausente em CUSTOM', { schemaVersion: 1, config: { provider: 'CUSTOM', credential: 'sk', model: 'm' } }],
    [
      'base inválida em CUSTOM',
      {
        schemaVersion: 1,
        config: {
          provider: 'CUSTOM',
          apiBase: 'http://gateway.exemplo/v1',
          credential: 'sk',
          model: 'm',
        },
      },
    ],
  ])('recusa %s como dados incompatíveis', (_label, value) => {
    expect(() => decodeStoredAiConfig(value)).toThrow(AiConfigStorageError);

    try {
      decodeStoredAiConfig(value);
    } catch (error) {
      expect((error as AiConfigStorageError).reason).toBe('INCOMPATIBLE_DATA');
    }
  });
});
