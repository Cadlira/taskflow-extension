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

/** Versão da API declarada em toda requisição à Anthropic. */
export const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Sem este cabeçalho a Anthropic recusa a requisição originada de navegador, e um contexto de
 * extensão envia `Origin: chrome-extension://<id>`. O teste falharia mesmo com permissão concedida
 * e credencial válida.
 */
export const ANTHROPIC_DIRECT_BROWSER_HEADER = 'anthropic-dangerous-direct-browser-access';

/** Adapter da Anthropic: autenticação por chave própria, sob a base fixa do provedor. */
export class AnthropicConnectionTester implements AiConnectionTester {
  testConnection({ config, probe, signal }: AiConnectionTestRequest): Promise<AiConnectionResult> {
    const base = resolveApiBase(config);
    const origin = resolveOrigin(base);
    const headers = {
      'x-api-key': config.credential,
      'anthropic-version': ANTHROPIC_VERSION,
      [ANTHROPIC_DIRECT_BROWSER_HEADER]: 'true',
    };

    if (probe === 'MODEL_LIST') {
      return runAiProbe(
        `${base}/v1/models`,
        { method: 'GET', headers: { ...headers, Accept: 'application/json' } },
        { origin, probe, signal },
      );
    }

    // Envio mínimo: conteúdo literal fixo e um token de resposta. Nunca conteúdo de tarefa.
    return runAiProbe(
      `${base}/v1/messages`,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: config.model,
          max_tokens: 1,
          messages: [{ role: 'user', content: AI_MINIMAL_PROBE_CONTENT }],
        }),
      },
      { origin, probe, signal },
    );
  }
}

/**
 * Caminho mínimo até o texto gerado no formato da Anthropic: o primeiro bloco de texto da
 * resposta. Nada além dele é navegado.
 */
function extractAnthropicText(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const { content } = payload as { content?: unknown };

  if (!Array.isArray(content)) {
    return undefined;
  }

  const block = content.find(
    (candidate): candidate is { type: 'text'; text: string } =>
      typeof candidate === 'object' &&
      candidate !== null &&
      (candidate as { type?: unknown }).type === 'text' &&
      typeof (candidate as { text?: unknown }).text === 'string',
  );

  // Lista de blocos sem nenhum bloco de texto é resposta bem formada e vazia, não ilegível.
  return block === undefined ? '' : block.text;
}

/**
 * Geração na Anthropic. Reutiliza os dois cabeçalhos obrigatórios: sem eles a requisição originada
 * de extensão é recusada mesmo com permissão concedida e credencial válida.
 */
export class AnthropicSubtaskSuggester implements AiSubtaskSuggester {
  suggestSubtasks({
    config,
    content,
    maxOutputTokens,
    signal,
  }: AiSubtaskSuggestionRequest): Promise<AiSubtaskSuggestionResponse> {
    const base = resolveApiBase(config);

    return runAiGeneration(
      `${base}/v1/messages`,
      {
        method: 'POST',
        headers: {
          'x-api-key': config.credential,
          'anthropic-version': ANTHROPIC_VERSION,
          [ANTHROPIC_DIRECT_BROWSER_HEADER]: 'true',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: maxOutputTokens,
          messages: [{ role: 'user', content }],
          stream: false,
        }),
      },
      { origin: resolveOrigin(base), extract: extractAnthropicText, signal },
    );
  }
}
