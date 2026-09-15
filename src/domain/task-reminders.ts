import {
  isActiveStatus,
  type IdGenerator,
  type Task,
  type TaskReminder,
} from './task';

/** Atalhos de interface: no horário do prazo, 15 minutos, 1 hora e 1 dia antes. */
export const REMINDER_PRESETS = [0, 15, 60, 1440] as const;

export type ReminderPreset = (typeof REMINDER_PRESETS)[number];

/** Limite de lembretes distintos por tarefa. */
export const MAX_REMINDERS = 10;

/**
 * Tolerância entre o horário registrado no alarme e o horário recalculado a partir da tarefa.
 * O navegador pode ajustar alarmes muito próximos; diferenças maiores indicam alarme obsoleto.
 */
export const ALARM_SCHEDULE_TOLERANCE_MS = 60_000;

/**
 * Limite de atraso real de entrega: alarmes recebidos depois desse intervalo são liquidados
 * sem notificação para evitar avisos retroativos.
 */
export const REMINDER_DELAY_TOLERANCE_MS = 5 * 60_000;

/** Maior instante representável por `Date`; além disso `toISOString` lança `RangeError`. */
export const MAX_DATE_INSTANT_MS = 8_640_000_000_000_000;

const MINUTE_MS = 60_000;

/** Um instante só pode ser formatado, comparado e persistido dentro do intervalo de `Date`. */
export function isRepresentableInstant(epochMs: number): boolean {
  return Number.isFinite(epochMs) && Math.abs(epochMs) <= MAX_DATE_INSTANT_MS;
}

/** Configuração de lembrete enviada pelo formulário; `id` presente apenas em edição. */
export type TaskReminderDraft =
  | { id?: string; type: 'OFFSET'; offsetMinutes: number }
  | { id?: string; type: 'AT'; at: string };

export interface PlannedReminder {
  taskId: string;
  reminderId: string;
  /** Epoch em milissegundos. */
  triggerAt: number;
}

export interface ReminderOccurrence {
  reminder: TaskReminder;
  /** Epoch em milissegundos do instante efetivo. */
  triggerAt: number;
}

function instantIso(epochMs: number): string {
  return new Date(epochMs).toISOString();
}

/** Instante efetivo da ocorrência: deslocamento exato antes do prazo ou instante absoluto. */
export function resolveReminderTriggerAt(reminder: TaskReminder, dueAt: string): number {
  return reminder.type === 'OFFSET'
    ? Date.parse(dueAt) - reminder.offsetMinutes * MINUTE_MS
    : Date.parse(reminder.at);
}

/** Uma ocorrência está pendente enquanto o instante processado difere do instante efetivo. */
export function isReminderPending(reminder: TaskReminder, dueAt: string): boolean {
  const triggerAt = resolveReminderTriggerAt(reminder, dueAt);
  return isRepresentableInstant(triggerAt) && reminder.processedFor !== instantIso(triggerAt);
}

/**
 * Verifica as invariantes de uma coleção de lembretes já normalizada: limite de itens, exigência
 * de prazo, identificadores únicos, instantes efetivos representáveis e sem repetição e `AT` até
 * o prazo. Não exige formato textual canônico, apenas coerência estrutural e temporal.
 */
export function isReminderCollectionValid(task: Task): boolean {
  const { dueAt, reminders } = task;

  if (reminders.length > MAX_REMINDERS) {
    return false;
  }

  if (reminders.length === 0) {
    return true;
  }

  if (dueAt === undefined) {
    return false;
  }

  const dueMs = Date.parse(dueAt);

  if (!isRepresentableInstant(dueMs)) {
    return false;
  }

  const seenIds = new Set<string>();
  const seenInstants = new Set<number>();

  for (const reminder of reminders) {
    if (reminder.id === '' || seenIds.has(reminder.id)) {
      return false;
    }

    seenIds.add(reminder.id);

    const triggerAt = resolveReminderTriggerAt(reminder, dueAt);

    if (!isRepresentableInstant(triggerAt)) {
      return false;
    }

    if (reminder.type === 'AT' && triggerAt > dueMs) {
      return false;
    }

    if (seenInstants.has(triggerAt)) {
      return false;
    }

    seenInstants.add(triggerAt);
  }

  return true;
}

/**
 * Converte as configurações escolhidas em lembretes únicos, preservando identidade e ocorrência
 * processada dos lembretes existentes. Configurações sem `id` correspondente recebem um novo id.
 */
export function buildReminders(
  drafts: readonly TaskReminderDraft[],
  existing: readonly TaskReminder[],
  generateId: IdGenerator,
): TaskReminder[] {
  return drafts.map((draft) => {
    const previous = draft.id ? existing.find((reminder) => reminder.id === draft.id) : undefined;
    const identity =
      previous === undefined
        ? { id: generateId() }
        : previous.processedFor === undefined
          ? { id: previous.id }
          : { id: previous.id, processedFor: previous.processedFor };

    return draft.type === 'OFFSET'
      ? { ...identity, type: 'OFFSET', offsetMinutes: draft.offsetMinutes }
      : { ...identity, type: 'AT', at: draft.at };
  });
}

/** Alarmes que devem existir para a tarefa no instante informado. */
export function planReminders(task: Task, now: Date): PlannedReminder[] {
  const { dueAt } = task;

  if (dueAt === undefined || !isActiveStatus(task.status)) {
    return [];
  }

  const nowMs = now.getTime();

  return task.reminders
    .filter((reminder) => isReminderPending(reminder, dueAt))
    .map((reminder) => ({
      taskId: task.id,
      reminderId: reminder.id,
      triggerAt: resolveReminderTriggerAt(reminder, dueAt),
    }))
    .filter((planned) => planned.triggerAt > nowMs);
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

  const nowMs = now.getTime();
  let changed = false;

  const reminders = task.reminders.map((reminder) => {
    if (!isReminderPending(reminder, dueAt)) {
      return reminder;
    }

    const triggerAt = resolveReminderTriggerAt(reminder, dueAt);

    if (triggerAt <= nowMs) {
      changed = true;
      return { ...reminder, processedFor: instantIso(triggerAt) };
    }

    return reminder;
  });

  return changed ? { ...task, reminders } : task;
}

/** Registra o instante efetivo como processado no lembrete informado. */
export function markReminderProcessed(
  task: Task,
  reminderId: string,
  processedFor: string,
): Task {
  return {
    ...task,
    reminders: task.reminders.map((reminder) =>
      reminder.id === reminderId ? { ...reminder, processedFor } : reminder,
    ),
  };
}

/**
 * Retorna a ocorrência somente se o alarme recebido ainda corresponde a uma tarefa ativa, ao
 * lembrete configurado, ao instante usado no agendamento e a uma ocorrência não processada.
 * A tolerância aqui identifica alarme obsoleto; a janela de atraso é avaliada separadamente.
 */
export function findReminderOccurrence(
  task: Task | undefined,
  reminderId: string,
  scheduledTime: number,
): ReminderOccurrence | undefined {
  if (task?.dueAt === undefined || !isActiveStatus(task.status)) {
    return undefined;
  }

  const { dueAt } = task;
  const reminder = task.reminders.find((candidate) => candidate.id === reminderId);

  if (!reminder || !isReminderPending(reminder, dueAt)) {
    return undefined;
  }

  const triggerAt = resolveReminderTriggerAt(reminder, dueAt);
  return Math.abs(triggerAt - scheduledTime) <= ALARM_SCHEDULE_TOLERANCE_MS
    ? { reminder, triggerAt }
    : undefined;
}

/** Ocorrências até cinco minutos depois do instante efetivo ainda são entregáveis. */
export function canDeliverReminder(triggerAt: number, now: Date): boolean {
  return now.getTime() <= triggerAt + REMINDER_DELAY_TOLERANCE_MS;
}

/**
 * Registra condicionalmente a ocorrência como processada. Retorna a tarefa atualizada somente
 * quando o lembrete ainda está pendente para o mesmo instante efetivo informado.
 */
export function claimReminderOccurrence(
  task: Task,
  reminderId: string,
  processedFor: string,
): Task | undefined {
  const { dueAt } = task;

  if (dueAt === undefined || !isActiveStatus(task.status)) {
    return undefined;
  }

  const reminder = task.reminders.find((candidate) => candidate.id === reminderId);

  if (!reminder || !isReminderPending(reminder, dueAt)) {
    return undefined;
  }

  if (instantIso(resolveReminderTriggerAt(reminder, dueAt)) !== processedFor) {
    return undefined;
  }

  return markReminderProcessed(task, reminderId, processedFor);
}
