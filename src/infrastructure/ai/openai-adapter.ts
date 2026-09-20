import {
  AI_MINIMAL_PROBE_CONTENT,
  type AiConnectionResult,
  type AiConnectionTester,
  type AiConnectionTestRequest,
} from '@/application/ai/ai-connection-tester';
import type {
  AiSubtaskSuggester,
  AiSubtaskSuggestionRequest,
  AiSubtaskSuggestionResponse,
} from '@/application/ai/ai-subtask-suggester';
import { resolveApiBase, resolveOrigin } from '@/domain/ai-provider';
import { runAiGeneration } from './ai-generation';
import { runAiProbe } from './ai-probe';

/**
 * Adapter do protocolo compatível com OpenAI, usado por `OPENAI` e por `CUSTOM`. "Compatível com
 * OpenAI" não é outro adapter: é este, com outra base.
 */
export class OpenAiCompatibleConnectionTester implements AiConnectionTester {
  testConnection({ config, probe, signal }: AiConnectionTestRequest): Promise<AiConnectionResult> {
    const base = resolveApiBase(config);
    const origin = resolveOrigin(base);
    const authorization = { Authorization: `Bearer ${config.credential}` };

    if (probe === 'MODEL_LIST') {
      return runAiProbe(
        `${base}/models`,
        { method: 'GET', headers: { ...authorization, Accept: 'application/json' } },
        { origin, probe, signal },
      );
    }

    // Envio mínimo: conteúdo literal fixo e um token de resposta. Nunca conteúdo de tarefa.
    return runAiProbe(
      `${base}/chat/completions`,
      {
        method: 'POST',
        headers: { ...authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content: AI_MINIMAL_PROBE_CONTENT }],
          max_tokens: 1,
        }),
      },
      { origin, probe, signal },
    );
  }
}

/**
 * Caminho mínimo até o texto gerado no formato compatível com OpenAI. Nada além dele é navegado:
 * uma mudança de formato falha de forma fechada, em vez de expor detalhe do corpo.
 */
function extractOpenAiText(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const { choices } = payload as { choices?: unknown };

  if (!Array.isArray(choices)) {
    return undefined;
  }

  const message = (choices[0] as { message?: { content?: unknown } } | undefined)?.message;

  return typeof message?.content === 'string' ? message.content : undefined;
}

/**
 * Geração no protocolo compatível com OpenAI, usada por `OPENAI` e por `CUSTOM`. Requisição única,
 * sem streaming, com o teto de saída definido pelo TaskFlow. O `content` chega pronto do domínio e
 * é transmitido sem reconstrução: é o mesmo texto que o usuário aprovou na pré-visualização.
 */
export class OpenAiCompatibleSubtaskSuggester implements AiSubtaskSuggester {
  suggestSubtasks({
    config,
    content,
    maxOutputTokens,
    signal,
  }: AiSubtaskSuggestionRequest): Promise<AiSubtaskSuggestionResponse> {
    const base = resolveApiBase(config);

    return runAiGeneration(
      `${base}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.credential}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          messages: [{ role: 'user', content }],
          max_tokens: maxOutputTokens,
          stream: false,
        }),
      },
      { origin: resolveOrigin(base), extract: extractOpenAiText, signal },
    );
  }
}
