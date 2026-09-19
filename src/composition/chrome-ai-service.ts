import { createProviderDispatchingTester } from '@/application/ai/ai-connection-tester';
import {
  createAiProviderService,
  type AiProviderService,
} from '@/application/ai/ai-provider-service';
import { AnthropicConnectionTester } from '@/infrastructure/ai/anthropic-adapter';
import { ChromeAiProviderConfigRepository } from '@/infrastructure/ai/chrome-ai-config-repository';
import { ChromeHostPermissions } from '@/infrastructure/ai/chrome-host-permissions';
import { OpenAiCompatibleConnectionTester } from '@/infrastructure/ai/openai-adapter';

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
