import type { InjectionKey } from 'vue';
import type { AiSubtaskSuggestionService } from '@/application/ai/ai-subtask-suggestion-service';

/**
 * Serviço de sugestão de subtarefas. Fornecido apenas no Side Panel: o popup do Quick Add não o
 * recebe, e sem ele nenhum elemento de assistência é apresentado.
 */
export const aiSubtaskSuggestionServiceKey: InjectionKey<AiSubtaskSuggestionService> = Symbol(
  'AiSubtaskSuggestionService',
);
