import {
  isTaskPriority,
  isTaskStatus,
  type IdGenerator,
  type Task,
  type TaskPriority,
  type TaskReminder,
  type TaskStatus,
} from './task';
import { applyStatus } from './task-status';
import {
  buildReminders,
  isRepresentableInstant,
  MAX_REMINDERS,
  resolveReminderTriggerAt,
  type TaskReminderDraft,
} from './task-reminders';

export const TASK_LIMITS = {
  title: 200,
  description: 4000,
  person: 120,
  tag: 30,
  tags: 10,
} as const;

/** Dados informados pelo usuário para criar ou editar uma tarefa. */
export interface TaskDraft {
  title: string;
  description?: string | undefined;
  requester?: string | undefined;
  assignee?: string | undefined;
  status?: TaskStatus | undefined;
  priority?: TaskPriority | undefined;
  /** Instante ISO 8601; é normalizado para UTC. */
  dueAt?: string | undefined;
  reminders?: readonly TaskReminderDraft[] | undefined;
  tags?: readonly string[] | undefined;
  sourceUrl?: string | undefined;
}

export type TaskField =
  | 'title'
  | 'description'
  | 'requester'
  | 'assignee'
  | 'status'
  | 'priority'
  | 'dueAt'
  | 'reminders'
  | 'tags'
  | 'sourceUrl';

export type TaskFieldErrors = Partial<Record<TaskField, string>> & {
  /** Erro posicional de cada item de lembrete, na ordem enviada. */
  reminderItems?: readonly (string | undefined)[];
};

export type TaskDraftResult<T> = { ok: true; value: T } | { ok: false; errors: TaskFieldErrors };

interface NormalizedDraft {
  title: string;
  description?: string;
  requester?: string;
  assignee?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string;
  reminders: TaskReminderDraft[];
  tags: string[];
  sourceUrl?: string;
}

export interface TaskFactoryContext {
  now: Date;
  generateId: IdGenerator;
}

/** Estado atual da tarefa editada; necessário para validar itens novos ou alterados. */
export interface TaskDraftValidationContext {
  now: Date;
  existing?: readonly TaskReminder[] | undefined;
}

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeTags(tags: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of tags) {
    const tag = raw.trim();
    const key = tag.toLocaleLowerCase();

    if (tag && !seen.has(key)) {
      seen.add(key);
      result.push(tag);
    }
  }

  return result;
}

export function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sameReminderConfiguration(
  draft: TaskReminderDraft,
  reminder: TaskReminder,
): boolean {
  if (draft.type === 'OFFSET' && reminder.type === 'OFFSET') {
    return draft.offsetMinutes === reminder.offsetMinutes;
  }

  if (draft.type === 'AT' && reminder.type === 'AT') {
    return draft.at === reminder.at;
  }

  return false;
}

function validateReminderDrafts(
  drafts: readonly TaskReminderDraft[],
  dueAt: string | undefined,
  context: TaskDraftValidationContext | undefined,
  errors: TaskFieldErrors,
): TaskReminderDraft[] {
  const itemErrors: (string | undefined)[] = [];
  const normalized: TaskReminderDraft[] = [];
  const seenIds = new Set<string>();
  const seenInstants = new Set<number>();

  drafts.forEach((draft, index) => {
    if (draft.type !== 'OFFSET' && draft.type !== 'AT') {
      itemErrors[index] = 'Selecione um tipo de lembrete válido.';
      return;
    }

    if (draft.id !== undefined && (typeof draft.id !== 'string' || draft.id.trim() === '')) {
      itemErrors[index] = 'O lembrete precisa de um identificador.';
      return;
    }

    if (draft.id !== undefined && seenIds.has(draft.id)) {
      itemErrors[index] = 'Os lembretes não podem repetir o identificador.';
      return;
    }

    let candidate: TaskReminderDraft;

    if (draft.type === 'OFFSET') {
      if (!Number.isSafeInteger(draft.offsetMinutes) || draft.offsetMinutes < 0) {
        itemErrors[index] = 'Informe um deslocamento em minutos inteiro e não negativo.';
        return;
      }

      candidate = draft.id !== undefined
        ? { id: draft.id, type: 'OFFSET', offsetMinutes: draft.offsetMinutes }
        : { type: 'OFFSET', offsetMinutes: draft.offsetMinutes };
    } else {
      const timestamp = typeof draft.at === 'string' ? Date.parse(draft.at) : Number.NaN;

      if (Number.isNaN(timestamp)) {
        itemErrors[index] = 'Informe uma data e hora válidas.';
        return;
      }

      const at = new Date(timestamp).toISOString();
      candidate = draft.id !== undefined ? { id: draft.id, type: 'AT', at } : { type: 'AT', at };
    }

    if (dueAt !== undefined) {
      const triggerAt = resolveReminderTriggerAt(
        candidate.type === 'OFFSET'
          ? { id: '', type: 'OFFSET', offsetMinutes: candidate.offsetMinutes }
          : { id: '', type: 'AT', at: candidate.at },
        dueAt,
      );

      if (!isRepresentableInstant(triggerAt)) {
        itemErrors[index] = 'O horário do lembrete está fora do intervalo de datas suportado.';
        return;
      }

      if (triggerAt > Date.parse(dueAt)) {
        itemErrors[index] = 'O lembrete deve ocorrer até o prazo.';
        return;
      }

      if (seenInstants.has(triggerAt)) {
        itemErrors[index] = 'Os horários dos lembretes não podem se repetir.';
        return;
      }

      seenInstants.add(triggerAt);

      if (context !== undefined) {
        const previous =
          candidate.id !== undefined
            ? context.existing?.find((reminder) => reminder.id === candidate.id)
            : undefined;
        const carried = previous !== undefined && sameReminderConfiguration(candidate, previous);

        if (!carried && triggerAt <= context.now.getTime()) {
          itemErrors[index] = 'O horário do lembrete já passou.';
          return;
        }
      }
    }

    if (candidate.id !== undefined) {
      seenIds.add(candidate.id);
    }

    normalized.push(candidate);
  });

  if (drafts.length > MAX_REMINDERS) {
    errors.reminders = `Informe no máximo ${MAX_REMINDERS} lembretes distintos.`;
  } else if (drafts.length > 0 && dueAt === undefined) {
    errors.reminders = 'Lembretes exigem um prazo.';
  }

  if (itemErrors.some((message) => message !== undefined)) {
    errors.reminderItems = itemErrors;
  }

  return normalized;
}

export function validateTaskDraft(
  draft: TaskDraft,
  context?: TaskDraftValidationContext,
): TaskDraftResult<NormalizedDraft> {
  const errors: TaskFieldErrors = {};

  const title = draft.title.trim();
  if (!title) {
    errors.title = 'Informe um título.';
  } else if (title.length > TASK_LIMITS.title) {
    errors.title = `O título deve ter no máximo ${TASK_LIMITS.title} caracteres.`;
  }

  const description = optionalText(draft.description);
  if (description && description.length > TASK_LIMITS.description) {
    errors.description = `A descrição deve ter no máximo ${TASK_LIMITS.description} caracteres.`;
  }

  const requester = optionalText(draft.requester);
  if (requester && requester.length > TASK_LIMITS.person) {
    errors.requester = `O solicitante deve ter no máximo ${TASK_LIMITS.person} caracteres.`;
  }

  const assignee = optionalText(draft.assignee);
  if (assignee && assignee.length > TASK_LIMITS.person) {
    errors.assignee = `O responsável deve ter no máximo ${TASK_LIMITS.person} caracteres.`;
  }

  if (draft.status !== undefined && !isTaskStatus(draft.status)) {
    errors.status = 'Selecione um status válido.';
  }

  if (draft.priority !== undefined && !isTaskPriority(draft.priority)) {
    errors.priority = 'Selecione uma prioridade válida.';
  }

  let dueAt: string | undefined;
  const rawDueAt = optionalText(draft.dueAt);
  if (rawDueAt) {
    const timestamp = Date.parse(rawDueAt);
    if (Number.isNaN(timestamp)) {
      errors.dueAt = 'Informe uma data e hora válidas.';
    } else {
      dueAt = new Date(timestamp).toISOString();
    }
  }

  const reminders = validateReminderDrafts(draft.reminders ?? [], dueAt, context, errors);

  const tags = normalizeTags(draft.tags ?? []);
  if (tags.some((tag) => tag.length > TASK_LIMITS.tag)) {
    errors.tags = `Cada tag deve ter no máximo ${TASK_LIMITS.tag} caracteres.`;
  } else if (tags.length > TASK_LIMITS.tags) {
    errors.tags = `Informe no máximo ${TASK_LIMITS.tags} tags distintas.`;
  }

  const sourceUrl = optionalText(draft.sourceUrl);
  if (sourceUrl && !isHttpUrl(sourceUrl)) {
    errors.sourceUrl = 'Informe uma URL válida iniciada por http:// ou https://.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title,
      ...(description && { description }),
      ...(requester && { requester }),
      ...(assignee && { assignee }),
      ...(draft.status && { status: draft.status }),
      ...(draft.priority && { priority: draft.priority }),
      ...(dueAt && { dueAt }),
      reminders,
      tags,
      ...(sourceUrl && { sourceUrl }),
    },
  };
}

function editableFields(
  draft: NormalizedDraft,
  existing: Task | undefined,
  generateId: IdGenerator,
): Omit<Task, 'id' | 'status' | 'createdAt' | 'updatedAt' | 'completedAt'> {
  return {
    title: draft.title,
    ...(draft.description && { description: draft.description }),
    ...(draft.requester && { requester: draft.requester }),
    ...(draft.assignee && { assignee: draft.assignee }),
    priority: draft.priority ?? existing?.priority ?? 'MEDIUM',
    ...(draft.dueAt && { dueAt: draft.dueAt }),
    reminders: buildReminders(draft.reminders, existing?.reminders ?? [], generateId),
    tags: draft.tags,
    ...(draft.sourceUrl && { sourceUrl: draft.sourceUrl }),
  };
}

export function createTask(draft: TaskDraft, context: TaskFactoryContext): TaskDraftResult<Task> {
  const validation = validateTaskDraft(draft, { now: context.now });
  if (!validation.ok) {
    return validation;
  }

  const timestamp = context.now.toISOString();
  const task: Task = {
    id: context.generateId(),
    status: 'TODO',
    ...editableFields(validation.value, undefined, context.generateId),
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  const status = validation.value.status ?? 'TODO';
  return { ok: true, value: applyStatus(task, status, context.now) };
}

/** Substitui os campos editáveis preservando identidade, criação e regras de status. */
export function updateTask(
  task: Task,
  draft: TaskDraft,
  context: TaskFactoryContext,
): TaskDraftResult<Task> {
  const validation = validateTaskDraft(draft, { now: context.now, existing: task.reminders });
  if (!validation.ok) {
    return validation;
  }

  const edited: Task = {
    id: task.id,
    status: task.status,
    ...editableFields(validation.value, task, context.generateId),
    createdAt: task.createdAt,
    updatedAt: context.now.toISOString(),
    ...(task.completedAt && { completedAt: task.completedAt }),
  };

  return {
    ok: true,
    value: applyStatus(edited, validation.value.status ?? task.status, context.now),
  };
}
