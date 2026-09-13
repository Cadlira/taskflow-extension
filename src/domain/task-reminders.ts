import { isActiveStatus, type IdGenerator, type Task, type TaskReminder } from './task';

/** No horário do prazo, 15 minutos, 1 hora e 1 dia antes. */
export const REMINDER_OFFSETS = [0, 15, 60, 1440] as const;

export type ReminderOffset = (typeof REMINDER_OFFSETS)[number];

/**
 * Tolerância entre o horário registrado no alarme e o horário recalculado a partir da tarefa.
 * O navegador pode ajustar alarmes muito próximos; diferenças maiores indicam alarme obsoleto.
 */
export const ALARM_SCHEDULE_TOLERANCE_MS = 60_000;

const MINUTE_MS = 60_000;

export interface PlannedReminder {
  taskId: string;
  reminderId: string;
  /** Epoch em milissegundos. */
  triggerAt: number;
}

export function isReminderOffset(value: unknown): value is ReminderOffset {
  return typeof value === 'number' && (REMINDER_OFFSETS as readonly number[]).includes(value);
}

/**
 * Converte deslocamentos escolhidos em lembretes únicos, preservando identidade e ocorrência
 * processada dos deslocamentos que já existiam na tarefa.
 */
export function buildReminders(
  offsets: readonly ReminderOffset[],
  existing: readonly TaskReminder[],
  generateId: IdGenerator,
): TaskReminder[] {
  const uniqueOffsets = [...new Set(offsets)].sort((left, right) => left - right);

  return uniqueOffsets.map((offsetMinutes) => {
    const previous = existing.find((reminder) => reminder.offsetMinutes === offsetMinutes);
    return previous ? { ...previous } : { id: generateId(), offsetMinutes };
  });
}

export function reminderTriggerAt(dueAt: string, offsetMinutes: number): number {
  return Date.parse(dueAt) - offsetMinutes * MINUTE_MS;
}

function isPendingFor(reminder: TaskReminder, dueAt: string): boolean {
  return reminder.lastTriggeredFor !== dueAt;
}

/** Alarmes que devem existir para a tarefa no instante informado. */
export function planReminders(task: Task, now: Date): PlannedReminder[] {
  const { dueAt } = task;

  if (dueAt === undefined || !isActiveStatus(task.status)) {
    return [];
  }

  return task.reminders
    .filter((reminder) => isPendingFor(reminder, dueAt))
    .map((reminder) => ({
      taskId: task.id,
      reminderId: reminder.id,
      triggerAt: reminderTriggerAt(dueAt, reminder.offsetMinutes),
    }))
    .filter((planned) => planned.triggerAt > now.getTime());
}

/**
 * Marca como processadas as ocorrências cujo instante já passou, evitando notificações
 * retroativas. Retorna a mesma instância quando nada precisa mudar.
 */
export function settleElapsedReminders(task: Task, now: Date): Task {
  const { dueAt } = task;

  if (dueAt === undefined) {
    return task;
  }

  let changed = false;
  const reminders = task.reminders.map((reminder) => {
    const elapsed = reminderTriggerAt(dueAt, reminder.offsetMinutes) <= now.getTime();

    if (elapsed && isPendingFor(reminder, dueAt)) {
      changed = true;
      return { ...reminder, lastTriggeredFor: dueAt };
    }

    return reminder;
  });

  return changed ? { ...task, reminders } : task;
}

/**
 * Retorna o lembrete somente se o alarme recebido ainda corresponde a uma tarefa ativa, ao
 * lembrete configurado, ao prazo usado no agendamento e a uma ocorrência não processada.
 */
export function findDeliverableReminder(
  task: Task | undefined,
  reminderId: string,
  scheduledTime: number,
): TaskReminder | undefined {
  if (task?.dueAt === undefined || !isActiveStatus(task.status)) {
    return undefined;
  }

  const { dueAt } = task;
  const reminder = task.reminders.find((candidate) => candidate.id === reminderId);

  if (!reminder || !isPendingFor(reminder, dueAt)) {
    return undefined;
  }

  const expected = reminderTriggerAt(dueAt, reminder.offsetMinutes);
  return Math.abs(expected - scheduledTime) <= ALARM_SCHEDULE_TOLERANCE_MS ? reminder : undefined;
}

export function markReminderTriggered(task: Task, reminderId: string): Task {
  const { dueAt } = task;

  if (dueAt === undefined) {
    return task;
  }

  return {
    ...task,
    reminders: task.reminders.map((reminder) =>
      reminder.id === reminderId ? { ...reminder, lastTriggeredFor: dueAt } : reminder,
    ),
  };
}
