import {
  AI_MINIMAL_PROBE_CONTENT,
  type AiConnectionResult,
  type AiConnectionTester,
  type AiConnectionTestRequest,
} from '@/application/ai/ai-connection-tester';
import { resolveApiBase, resolveOrigin } from '@/domain/ai-provider';
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
