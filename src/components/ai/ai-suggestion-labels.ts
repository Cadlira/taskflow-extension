import type { AiGenerationFailure } from '@/application/ai/ai-subtask-suggester';
import { MAX_SUBTASKS } from '@/domain/task-subtasks';
import { AI_FAILURE_LABELS } from './ai-provider-labels';

export const AI_SUGGEST_SUBTASKS_ACTION = 'Sugerir subtarefas';

export const AI_SUGGESTION_TITLE_REQUIRED =
  'Preencha o título da tarefa para pedir sugestões de subtarefa.';

export const AI_SUGGESTION_AT_LIMIT = `Limite de ${MAX_SUBTASKS} subtarefas atingido: não há vaga para novas sugestões.`;

export const AI_SUGGESTION_PREVIEW_HEADING = 'Conteúdo que será enviado';

export const AI_SUGGESTION_PREVIEW_NOTICE =
  'Este é o texto exato que sairá deste dispositivo. Nada é enviado antes da sua confirmação.';

export const AI_SUGGESTION_DESCRIPTION_TRUNCATED =
  'A descrição foi cortada no limite de envio do TaskFlow. O texto acima é o que será transmitido.';

export const AI_SUGGESTION_PREVIEW_RECOMPOSED =
  'O título ou a descrição mudaram: a pré-visualização foi recomposta com o texto atual e precisa ser confirmada de novo.';

export const AI_SUGGESTION_ORIGIN_CHANGED =
  'A origem do provedor mudou desde que a pré-visualização foi apresentada. Nada foi enviado; confirme novamente para a nova origem.';

export const AI_SUGGESTION_NOT_CONFIGURED =
  'Não há provedor de IA configurado. Nada foi enviado.';

export const AI_SUGGESTION_CANCELLED = 'Sugestão cancelada. Nada foi alterado no formulário.';

export const AI_SUGGESTION_IN_PROGRESS = 'Pedindo sugestões ao provedor…';

export const AI_SUGGESTION_CANCEL_ACTION = 'Cancelar envio';

export const AI_SUGGESTION_DISCARD_ACTION = 'Descartar proposta';

export const AI_SUGGESTION_ACCEPT_ACTION = 'Adicionar selecionadas';

export const AI_SUGGESTION_PROPOSAL_HEADING = 'Sugestões de subtarefa';

export const AI_SUGGESTION_PROPOSAL_NOTICE =
  'Revise, edite e escolha o que aceitar. Nada é gravado: a tarefa só muda quando você salvar o formulário.';

export const AI_SUGGESTION_LIMIT_DISCARDED =
  'Parte das sugestões foi descartada porque não cabia nas vagas restantes de subtarefa.';

export const AI_SUGGESTION_NOTHING_SELECTED = 'Selecione ao menos uma sugestão para adicionar.';

export const AI_SUGGESTION_DISCARDED =
  'Proposta descartada. A lista de subtarefas permaneceu como estava.';

/** Consentimento próprio do envio de conteúdo de tarefa, distinto do de credencial. */
export function aiTaskContentConsentMessage(origin: string): string {
  return `O texto acima, com o título e a descrição desta tarefa, será enviado para ${origin}. Concordar em enviar a credencial no teste de conexão não autoriza este envio. O consentimento vale para esta origem e apenas enquanto o painel estiver aberto.`;
}

export function aiSuggestionConsentAction(origin: string): string {
  return `Concordar e enviar para ${origin}`;
}

export function aiSuggestionSendAction(origin: string): string {
  return `Enviar para ${origin}`;
}

export function aiSuggestionPermissionNotice(origin: string): string {
  return `A permissão de acesso a ${origin} é necessária para contatar o provedor. Nada será enviado enquanto ela não for concedida.`;
}

export function aiSuggestionPermissionAction(origin: string): string {
  return `Conceder acesso a ${origin} e enviar`;
}

export function aiSuggestionAcceptedMessage(count: number): string {
  return count === 1
    ? '1 sugestão adicionada à lista de subtarefas. Salve o formulário para gravar.'
    : `${count} sugestões adicionadas à lista de subtarefas. Salve o formulário para gravar.`;
}

/** Motivos próprios da geração, somados aos já previstos para a verificação de conexão. */
export const AI_GENERATION_FAILURE_LABELS: Record<AiGenerationFailure, string> = {
  ...AI_FAILURE_LABELS,
  EMPTY_RESPONSE: 'O provedor respondeu sem nenhum texto. Nada foi alterado no formulário.',
  UNREADABLE_RESPONSE:
    'Não foi possível interpretar a resposta do provedor. Nada foi alterado no formulário.',
  NO_VALID_ITEM:
    'Nenhuma sugestão aproveitável veio na resposta. Nada foi alterado no formulário.',
};

/**
 * Mensagem de falha acompanhada, no máximo, da origem de destino e do código de estado. O corpo
 * devolvido pelo provedor, os cabeçalhos e a URL completa nunca chegam até aqui.
 */
export function aiSuggestionFailureMessage(
  reason: AiGenerationFailure,
  origin: string | null,
  status?: number,
): string {
  const details = [
    ...(origin === null ? [] : [`origem ${origin}`]),
    ...(status === undefined ? [] : [`código ${status}`]),
  ];

  return details.length === 0
    ? AI_GENERATION_FAILURE_LABELS[reason]
    : `${AI_GENERATION_FAILURE_LABELS[reason]} (${details.join(', ')})`;
}
