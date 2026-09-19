import {
  AI_MINIMAL_PROBE_CONTENT,
  type AiConnectionResult,
  type AiConnectionTester,
  type AiConnectionTestRequest,
} from '@/application/ai/ai-connection-tester';
import { resolveApiBase, resolveOrigin } from '@/domain/ai-provider';
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
