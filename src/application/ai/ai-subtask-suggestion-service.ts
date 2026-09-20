import {
  buildSubtaskSuggestionProposal,
  SUBTASK_SUGGESTION_OUTPUT_LIMIT,
  type SubtaskSuggestionProposal,
} from '@/domain/ai-subtask-suggestion';
import { resolveConfigOrigin } from '@/domain/ai-provider';
import {
  AiConfigStorageError,
  type AiProviderConfigRepository,
} from './ai-provider-config-repository';
import type { AiConfigBlock } from './ai-provider-service';
import {
  AI_GENERATION_TIMEOUT_MS,
  type AiGenerationFailure,
  type AiSubtaskSuggester,
} from './ai-subtask-suggester';
import type { HostPermissions } from './host-permissions';

/**
 * Desfecho de um acionamento. Toda falha de provedor cai em `FAILED`, com um motivo do conjunto
 * fechado; os demais estados descrevem situações em que nada chegou a ser enviado.
 */
export type AiSubtaskSuggestionOutcome =
  | { ok: true; proposal: SubtaskSuggestionProposal }
  /** Nenhum provedor configurado: a assistência não é oferecida. */
  | { ok: false; state: 'NOT_CONFIGURED' }
  /** Já existe uma requisição em andamento; nenhuma outra é iniciada. */
  | { ok: false; state: 'ALREADY_RUNNING' }
  /** O usuário cancelou; qualquer resposta é descartada. */
  | { ok: false; state: 'CANCELLED' }
  | { ok: false; state: 'BLOCKED'; blocked: AiConfigBlock }
  | { ok: false; state: 'FAILED'; reason: AiGenerationFailure; status?: number };

export interface AiSubtaskSuggestionInput {
  /**
   * Texto exato já montado pelo domínio e já apresentado na pré-visualização. O caso de uso o
   * repassa ao adapter sem tocá-lo.
   */
  content: string;
  /** Itens já presentes na lista do formulário, base do cálculo das vagas restantes. */
  existingSubtaskCount: number;
}

export interface AiSubtaskSuggestionServiceDependencies {
  repository: AiProviderConfigRepository;
  permissions: HostPermissions;
  suggester: AiSubtaskSuggester;
}

function blockFor(error: unknown): AiConfigBlock {
  return error instanceof AiConfigStorageError && error.reason === 'INCOMPATIBLE_DATA'
    ? 'INCOMPATIBLE'
    : 'UNAVAILABLE';
}

/**
 * Caso de uso da sugestão de subtarefas. Um acionamento produz no máximo uma requisição, limitada
 * no tempo e cancelável, e devolve a proposta já validada pelas regras da digitação manual ou um
 * motivo do conjunto fechado. Sem permissão de host concedida, nada é enviado.
 *
 * Nada aqui é persistido: o caso de uso não grava no armazenamento em nenhum caminho.
 */
export function createAiSubtaskSuggestionService({
  repository,
  permissions,
  suggester,
}: AiSubtaskSuggestionServiceDependencies) {
  let controller: AbortController | undefined;
  let cancelled = false;
  let timedOut = false;

  function running(): boolean {
    return controller !== undefined;
  }

  /** Cancela a requisição em andamento, se houver. Nenhuma proposta é produzida depois disso. */
  function cancel(): void {
    if (controller === undefined) {
      return;
    }

    cancelled = true;
    controller.abort();
  }

  async function suggest({
    content,
    existingSubtaskCount,
  }: AiSubtaskSuggestionInput): Promise<AiSubtaskSuggestionOutcome> {
    // Guarda síncrona: um segundo acionamento durante a requisição não alcança o adapter.
    if (running()) {
      return { ok: false, state: 'ALREADY_RUNNING' };
    }

    const active = new AbortController();
    controller = active;
    cancelled = false;
    timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      active.abort();
    }, AI_GENERATION_TIMEOUT_MS);

    try {
      let config;

      try {
        config = await repository.read();
      } catch (error) {
        return { ok: false, state: 'BLOCKED', blocked: blockFor(error) };
      }

      if (config === undefined) {
        return { ok: false, state: 'NOT_CONFIGURED' };
      }

      // Sem permissão concedida, nenhum conteúdo de tarefa deixa o dispositivo.
      if (!(await permissions.has(resolveConfigOrigin(config)))) {
        return { ok: false, state: 'FAILED', reason: 'PERMISSION_MISSING' };
      }

      if (cancelled) {
        return { ok: false, state: 'CANCELLED' };
      }

      const response = await suggester.suggestSubtasks({
        config,
        content,
        maxOutputTokens: SUBTASK_SUGGESTION_OUTPUT_LIMIT,
        signal: active.signal,
      });

      // O cancelamento tem precedência: a resposta que porventura chegou é descartada.
      if (cancelled) {
        return { ok: false, state: 'CANCELLED' };
      }

      if (timedOut) {
        return { ok: false, state: 'FAILED', reason: 'TIMEOUT' };
      }

      if (!response.ok) {
        return {
          ok: false,
          state: 'FAILED',
          reason: response.reason,
          ...(response.status !== undefined && { status: response.status }),
        };
      }

      const proposal = buildSubtaskSuggestionProposal(response.text, existingSubtaskCount);

      if (proposal.drafts.length === 0) {
        return { ok: false, state: 'FAILED', reason: 'NO_VALID_ITEM' };
      }

      return { ok: true, proposal };
    } finally {
      clearTimeout(timer);
      controller = undefined;
    }
  }

  return { suggest, cancel, running };
}

export type AiSubtaskSuggestionService = ReturnType<typeof createAiSubtaskSuggestionService>;
