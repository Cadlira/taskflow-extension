import {
  isTaskPriority,
  isTaskStatus,
  type IdGenerator,
  type Task,
  type TaskPriority,
  type TaskStatus,
} from './task';
import { applyStatus } from './task-status';
import { buildReminders, isReminderOffset, type ReminderOffset } from './task-reminders';

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
  reminderOffsets?: readonly number[] | undefined;
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

export type TaskFieldErrors = Partial<Record<TaskField, string>>;

export type TaskDraftResult<T> = { ok: true; value: T } | { ok: false; errors: TaskFieldErrors };

interface NormalizedDraft {
  title: string;
  description?: string;
  requester?: string;
  assignee?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueAt?: string;
  reminderOffsets: ReminderOffset[];
  tags: string[];
  sourceUrl?: string;
}

export interface TaskFactoryContext {
  now: Date;
  generateId: IdGenerator;
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

export function validateTaskDraft(draft: TaskDraft): TaskDraftResult<NormalizedDraft> {
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

  const reminderOffsets: ReminderOffset[] = [];
  for (const offset of draft.reminderOffsets ?? []) {
    if (isReminderOffset(offset)) {
      reminderOffsets.push(offset);
    } else {
      errors.reminders = 'Selecione somente opções de lembrete válidas.';
    }
  }
  if (reminderOffsets.length > 0 && rawDueAt === undefined) {
    errors.reminders = 'Lembretes exigem um prazo.';
  }

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
      reminderOffsets,
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
    reminders: buildReminders(draft.reminderOffsets, existing?.reminders ?? [], generateId),
    tags: draft.tags,
    ...(draft.sourceUrl && { sourceUrl: draft.sourceUrl }),
  };
}

export function createTask(draft: TaskDraft, context: TaskFactoryContext): TaskDraftResult<Task> {
  const validation = validateTaskDraft(draft);
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
  const validation = validateTaskDraft(draft);
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
