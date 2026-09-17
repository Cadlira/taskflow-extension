import {
  isTaskPriority,
  isTaskStatus,
  type IdGenerator,
  type Task,
  type TaskPriority,
  type TaskReminder,
  type TaskStatus,
} from './task';
import {
  isRecurrence,
  isRecurrenceFrequency,
  RECURRENCE_LIMITS,
  type Recurrence,
  type RecurrenceFrequency,
} from './task-recurrence';
import { applyStatus } from './task-status';
import {
  buildReminders,
  isRepresentableInstant,
  MAX_REMINDERS,
  resolveReminderTriggerAt,
  type TaskReminderDraft,
} from './task-reminders';
import { buildSubtasks, validateSubtaskDrafts, type TaskSubtaskDraft } from './task-subtasks';

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
  recurrence?: TaskRecurrenceDraft | undefined;
  /**
   * Subtarefas na ordem desejada, sem marcação. Ausente produz lista vazia na criação e preserva
   * as subtarefas existentes na edição.
   */
  subtasks?: readonly TaskSubtaskDraft[] | undefined;
  tags?: readonly string[] | undefined;
  sourceUrl?: string | undefined;
}

/** Configuração de recorrência informada pelo formulário; a série ainda não tem identidade. */
export interface TaskRecurrenceDraft {
  frequency: RecurrenceFrequency;
  intervalDays?: number | undefined;
  weekdays?: readonly number[] | undefined;
  dayOfMonth?: number | undefined;
  /** Instante ISO 8601 do limite da série; normalizado para UTC. */
  until?: string | undefined;
}

export type RecurrenceField = 'frequency' | 'intervalDays' | 'weekdays' | 'dayOfMonth' | 'until';

export type TaskField =
  | 'title'
  | 'description'
  | 'requester'
  | 'assignee'
  | 'status'
  | 'priority'
  | 'dueAt'
  | 'reminders'
  | 'recurrence'
  | 'subtasks'
  | 'tags'
  | 'sourceUrl';

export type TaskFieldErrors = Partial<Record<TaskField, string>> & {
  /** Erro posicional de cada item de lembrete, na ordem enviada. */
  reminderItems?: readonly (string | undefined)[];
  /** Erro de cada parâmetro da regra de recorrência. */
  recurrenceFields?: Partial<Record<RecurrenceField, string>>;
  /** Erro posicional de cada subtarefa, na ordem enviada. */
  subtaskItems?: readonly (string | undefined)[];
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
  recurrence?: Recurrence;
  subtasks?: TaskSubtaskDraft[];
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
  hasRecurrence: boolean,
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

    if (hasRecurrence && draft.type === 'AT') {
      itemErrors[index] = 'Tarefas recorrentes aceitam somente lembretes por deslocamento.';
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

function isValidWeekdays(value: unknown): value is number[] {
  if (
    !Array.isArray(value) ||
    value.length < RECURRENCE_LIMITS.weekdaysMin ||
    value.length > RECURRENCE_LIMITS.weekdaysMax
  ) {
    return false;
  }

  const seen = new Set<number>();

  for (const weekday of value) {
    if (
      typeof weekday !== 'number' ||
      !Number.isSafeInteger(weekday) ||
      weekday < 0 ||
      weekday > 6 ||
      seen.has(weekday)
    ) {
      return false;
    }

    seen.add(weekday);
  }

  return true;
}

/**
 * Valida e normaliza a regra informada pelo formulário. A recorrência exige prazo, o limite deve
 * ser igual ou posterior a ele e nenhum lembrete de instante absoluto pode coexistir com a série.
 */
function validateRecurrenceDraft(
  draft: TaskRecurrenceDraft,
  dueAt: string | undefined,
  hasAbsoluteReminder: boolean,
  errors: TaskFieldErrors,
): Recurrence | undefined {
  const fieldErrors: Partial<Record<RecurrenceField, string>> = {};
  const addFieldError = (field: RecurrenceField, message: string): void => {
    fieldErrors[field] = message;
  };

  let until: string | undefined;
  const rawUntil = optionalText(draft.until);

  if (rawUntil) {
    const timestamp = Date.parse(rawUntil);

    if (!isRepresentableInstant(timestamp)) {
      addFieldError('until', 'Informe uma data e hora válidas.');
    } else {
      until = new Date(timestamp).toISOString();
    }
  }

  const base = until === undefined ? {} : { until };
  let rule: Recurrence | undefined;

  if (!isRecurrenceFrequency(draft.frequency)) {
    addFieldError('frequency', 'Selecione uma frequência válida.');
  } else if (draft.frequency === 'DAILY') {
    const intervalDays = draft.intervalDays;

    if (
      typeof intervalDays !== 'number' ||
      !Number.isSafeInteger(intervalDays) ||
      intervalDays < RECURRENCE_LIMITS.intervalDaysMin ||
      intervalDays > RECURRENCE_LIMITS.intervalDaysMax
    ) {
      addFieldError(
        'intervalDays',
        `Informe um intervalo de ${RECURRENCE_LIMITS.intervalDaysMin} a ${RECURRENCE_LIMITS.intervalDaysMax} dias.`,
      );
    } else {
      rule = { ...base, frequency: 'DAILY', intervalDays };
    }
  } else if (draft.frequency === 'WEEKLY') {
    const weekdays = draft.weekdays;

    if (!isValidWeekdays(weekdays)) {
      addFieldError(
        'weekdays',
        `Selecione de ${RECURRENCE_LIMITS.weekdaysMin} a ${RECURRENCE_LIMITS.weekdaysMax} dias da semana distintos.`,
      );
    } else {
      rule = { ...base, frequency: 'WEEKLY', weekdays: [...weekdays] };
    }
  } else {
    const dayOfMonth = draft.dayOfMonth;

    if (
      typeof dayOfMonth !== 'number' ||
      !Number.isSafeInteger(dayOfMonth) ||
      dayOfMonth < RECURRENCE_LIMITS.dayOfMonthMin ||
      dayOfMonth > RECURRENCE_LIMITS.dayOfMonthMax
    ) {
      addFieldError(
        'dayOfMonth',
        `Informe um dia do mês de ${RECURRENCE_LIMITS.dayOfMonthMin} a ${RECURRENCE_LIMITS.dayOfMonthMax}.`,
      );
    } else {
      rule = { ...base, frequency: 'MONTHLY', dayOfMonth };
    }
  }

  if (dueAt === undefined) {
    errors.recurrence = 'A recorrência exige um prazo.';
    rule = undefined;
  } else if (until !== undefined && Date.parse(until) < Date.parse(dueAt)) {
    addFieldError('until', 'O limite da série deve ser igual ou posterior ao prazo.');
    rule = undefined;
  }

  if (hasAbsoluteReminder) {
    errors.recurrence =
      'Remova ou converta os lembretes de horário absoluto antes de salvar a recorrência.';
    rule = undefined;
  }

  if (Object.keys(fieldErrors).length > 0) {
    errors.recurrenceFields = fieldErrors;
  }

  return rule !== undefined && isRecurrence(rule) ? rule : undefined;
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

  const reminderDrafts = draft.reminders ?? [];
  const hasAbsoluteReminder = reminderDrafts.some((reminder) => reminder.type === 'AT');
  const recurrence =
    draft.recurrence === undefined
      ? undefined
      : validateRecurrenceDraft(draft.recurrence, dueAt, hasAbsoluteReminder, errors);
  const reminders = validateReminderDrafts(
    reminderDrafts,
    dueAt,
    context,
    errors,
    draft.recurrence !== undefined,
  );

  const subtaskValidation =
    draft.subtasks === undefined ? undefined : validateSubtaskDrafts(draft.subtasks);
  if (subtaskValidation?.listError !== undefined) {
    errors.subtasks = subtaskValidation.listError;
  }
  if (subtaskValidation?.itemErrors !== undefined) {
    errors.subtaskItems = subtaskValidation.itemErrors;
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
      reminders,
      ...(recurrence !== undefined && { recurrence }),
      ...(subtaskValidation !== undefined && { subtasks: subtaskValidation.drafts }),
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
    subtasks:
      draft.subtasks === undefined
        ? [...(existing?.subtasks ?? [])]
        : buildSubtasks(draft.subtasks, existing?.subtasks ?? [], generateId),
    tags: draft.tags,
    ...(draft.sourceUrl && { sourceUrl: draft.sourceUrl }),
  };
}

/**
 * Regra a persistir na edição: a ancoragem da série é preservada quando apenas o prazo desta
 * ocorrência muda e fica ausente quando o novo prazo coincide com o instante agendado.
 */
function resolveRecurrenceUpdate(
  task: Task,
  recurrence: Recurrence | undefined,
  dueAt: string | undefined,
): Recurrence | undefined {
  if (recurrence === undefined || task.recurrence === undefined) {
    return recurrence;
  }

  const anchorAt = task.recurrence.anchorAt ?? task.dueAt;

  if (anchorAt === undefined || anchorAt === dueAt) {
    return recurrence;
  }

  return { ...recurrence, anchorAt };
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
    ...(validation.value.recurrence !== undefined && {
      seriesId: context.generateId(),
      recurrence: validation.value.recurrence,
    }),
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

  const recurrence = resolveRecurrenceUpdate(task, validation.value.recurrence, validation.value.dueAt);
  const seriesId = task.seriesId ?? (recurrence !== undefined ? context.generateId() : undefined);

  const edited: Task = {
    id: task.id,
    status: task.status,
    ...editableFields(validation.value, task, context.generateId),
    ...(seriesId !== undefined && { seriesId }),
    ...(recurrence !== undefined && { recurrence }),
    createdAt: task.createdAt,
    updatedAt: context.now.toISOString(),
    ...(task.completedAt && { completedAt: task.completedAt }),
  };

  return {
    ok: true,
    value: applyStatus(edited, validation.value.status ?? task.status, context.now),
  };
}
