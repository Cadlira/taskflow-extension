import type { IdGenerator, Task } from './task';

/** Limite de subtarefas por tarefa. */
export const MAX_SUBTASKS = 20;

/** Limite do título de uma subtarefa; igual ao limite do título da tarefa. */
export const SUBTASK_TITLE_LIMIT = 200;

/** Passo marcável de uma tarefa; não tem status, prazo, lembretes nem subtarefas próprias. */
export interface Subtask {
  /** Identificador gerado localmente, único dentro da tarefa. */
  id: string;
  title: string;
  done: boolean;
}

/**
 * Subtarefa enviada pelo formulário; `id` presente apenas para itens já persistidos. O rascunho
 * não carrega a marcação, de modo que salvar o formulário nunca a altera.
 */
export interface TaskSubtaskDraft {
  id?: string | undefined;
  title: string;
}

export interface SubtaskDraftValidation {
  /** Rascunhos com título normalizado, somente dos itens válidos. */
  drafts: TaskSubtaskDraft[];
  /** Erro da lista como um todo, como o limite de itens. */
  listError?: string;
  /** Erro posicional de cada item, na ordem enviada. */
  itemErrors?: (string | undefined)[];
}

export interface SubtaskProgress {
  done: number;
  total: number;
}

export function validateSubtaskDrafts(drafts: readonly TaskSubtaskDraft[]): SubtaskDraftValidation {
  const itemErrors: (string | undefined)[] = [];
  const normalized: TaskSubtaskDraft[] = [];
  const seenIds = new Set<string>();

  drafts.forEach((draft, index) => {
    if (draft.id !== undefined && (typeof draft.id !== 'string' || draft.id.trim() === '')) {
      itemErrors[index] = 'A subtarefa precisa de um identificador.';
      return;
    }

    if (draft.id !== undefined && seenIds.has(draft.id)) {
      itemErrors[index] = 'As subtarefas não podem repetir o identificador.';
      return;
    }

    const title = typeof draft.title === 'string' ? draft.title.trim() : '';

    if (!title) {
      itemErrors[index] = 'Informe o título da subtarefa.';
      return;
    }

    if (title.length > SUBTASK_TITLE_LIMIT) {
      itemErrors[index] =
        `O título da subtarefa deve ter no máximo ${SUBTASK_TITLE_LIMIT} caracteres.`;
      return;
    }

    if (draft.id !== undefined) {
      seenIds.add(draft.id);
    }

    normalized.push(draft.id !== undefined ? { id: draft.id, title } : { title });
  });

  return {
    drafts: normalized,
    ...(drafts.length > MAX_SUBTASKS && {
      listError: `Informe no máximo ${MAX_SUBTASKS} subtarefas.`,
    }),
    ...(itemErrors.some((message) => message !== undefined) && { itemErrors }),
  };
}

/**
 * Converte os rascunhos em subtarefas na ordem enviada. Itens sem `id` recebem um novo
 * identificador e começam desmarcados; itens com `id` usam a marcação de `current`, que deve ser
 * a tarefa relida no momento de salvar, ou ficam desmarcados se não existirem mais nela.
 */
export function buildSubtasks(
  drafts: readonly TaskSubtaskDraft[],
  current: readonly Subtask[],
  generateId: IdGenerator,
): Subtask[] {
  return drafts.map((draft) => {
    if (draft.id === undefined) {
      return { id: generateId(), title: draft.title, done: false };
    }

    const previous = current.find((subtask) => subtask.id === draft.id);
    return { id: draft.id, title: draft.title, done: previous?.done ?? false };
  });
}

/**
 * Altera somente a marcação da subtarefa. Devolve a mesma instância quando o valor já é o pedido
 * e `undefined` quando a subtarefa não existe. Status, conclusão, prazo e lembretes não mudam.
 */
export function setSubtaskDone(
  task: Task,
  subtaskId: string,
  done: boolean,
  now: Date,
): Task | undefined {
  const target = task.subtasks.find((subtask) => subtask.id === subtaskId);

  if (target === undefined) {
    return undefined;
  }

  if (target.done === done) {
    return task;
  }

  return {
    ...task,
    subtasks: task.subtasks.map((subtask) =>
      subtask.id === subtaskId ? { ...subtask, done } : subtask,
    ),
    updatedAt: now.toISOString(),
  };
}

/** Progresso derivado; nunca é persistido. */
export function countSubtaskProgress(subtasks: readonly Subtask[]): SubtaskProgress {
  return {
    done: subtasks.filter((subtask) => subtask.done).length,
    total: subtasks.length,
  };
}

/** Cópia desmarcada, na mesma ordem e com novos identificadores, para uma nova ocorrência. */
export function resetSubtasks(subtasks: readonly Subtask[], generateId: IdGenerator): Subtask[] {
  return subtasks.map((subtask) => ({ id: generateId(), title: subtask.title, done: false }));
}
