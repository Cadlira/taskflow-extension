import type { InjectionKey } from 'vue';
import type { AiProviderService } from '@/application/ai/ai-provider-service';

export const aiProviderServiceKey: InjectionKey<AiProviderService> = Symbol('AiProviderService');
