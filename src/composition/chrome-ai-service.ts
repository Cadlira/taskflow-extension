import { createProviderDispatchingTester } from '@/application/ai/ai-connection-tester';
import {
  createAiProviderService,
  type AiProviderService,
} from '@/application/ai/ai-provider-service';
import { createProviderDispatchingSuggester } from '@/application/ai/ai-subtask-suggester';
import {
  createAiSubtaskSuggestionService,
  type AiSubtaskSuggestionService,
} from '@/application/ai/ai-subtask-suggestion-service';
import {
  AnthropicConnectionTester,
  AnthropicSubtaskSuggester,
} from '@/infrastructure/ai/anthropic-adapter';
import { ChromeAiProviderConfigRepository } from '@/infrastructure/ai/chrome-ai-config-repository';
import { ChromeHostPermissions } from '@/infrastructure/ai/chrome-host-permissions';
import {
  OpenAiCompatibleConnectionTester,
  OpenAiCompatibleSubtaskSuggester,
} from '@/infrastructure/ai/openai-adapter';

/**
 * Composição concreta da configuração de provedores para o Side Panel. O caminho de rede vive
 * aqui, onde ocorre o gesto do usuário, e nunca no service worker.
 */
export function createChromeAiProviderService(): AiProviderService {
  const openAiCompatible = new OpenAiCompatibleConnectionTester();

  return createAiProviderService({
    repository: new ChromeAiProviderConfigRepository(),
    permissions: new ChromeHostPermissions(),
    tester: createProviderDispatchingTester({
      OPENAI: openAiCompatible,
      // `CUSTOM` usa o protocolo compatível com OpenAI, apenas com outra base.
      CUSTOM: openAiCompatible,
      ANTHROPIC: new AnthropicConnectionTester(),
    }),
  });
}

/**
 * Composição da sugestão de subtarefas, ao lado dos testers e sob a mesma regra: a requisição
 * parte do Side Panel, onde ocorre o gesto do usuário. O service worker não participa — o Manifest
 * V3 pode encerrá-lo no meio da requisição — e nenhum código dele alcança esta porta.
 */
export function createChromeAiSubtaskSuggestionService(): AiSubtaskSuggestionService {
  const openAiCompatible = new OpenAiCompatibleSubtaskSuggester();

  return createAiSubtaskSuggestionService({
    repository: new ChromeAiProviderConfigRepository(),
    permissions: new ChromeHostPermissions(),
    suggester: createProviderDispatchingSuggester({
      OPENAI: openAiCompatible,
      // `CUSTOM` usa o protocolo compatível com OpenAI, apenas com outra base.
      CUSTOM: openAiCompatible,
      ANTHROPIC: new AnthropicSubtaskSuggester(),
    }),
  });
}
