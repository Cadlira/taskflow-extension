import type { IdGenerator, Task } from './task';
import {
  buildReminders,
  isRepresentableInstant,
  type TaskReminderDraft,
} from './task-reminders';
import { resetSubtasks } from './task-subtasks';

export const RECURRENCE_FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'] as const;

export type RecurrenceFrequency = (typeof RECURRENCE_FREQUENCIES)[number];

/** Limites da regra de recorrência aceitos pelo domínio. */
export const RECURRENCE_LIMITS = {
  intervalDaysMin: 1,
  intervalDaysMax: 365,
  weekdaysMin: 1,
  weekdaysMax: 7,
  dayOfMonthMin: 1,
  dayOfMonthMax: 31,
} as const;

interface RecurrenceBase {
  /** Instante agendado da série (ISO 8601 UTC) quando difere de `dueAt`. */
  anchorAt?: string;
  /** Instante limite da série (ISO 8601 UTC); ocorrências posteriores não são geradas. */
  until?: string;
}

export type Recurrence =
  | (RecurrenceBase & { frequency: 'DAILY'; intervalDays: number })
  | (RecurrenceBase & { frequency: 'WEEKLY'; weekdays: number[] })
  | (RecurrenceBase & { frequency: 'MONTHLY'; dayOfMonth: number });

export function isRecurrenceFrequency(value: unknown): value is RecurrenceFrequency {
  return typeof value === 'string' && (RECURRENCE_FREQUENCIES as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInstant(value: unknown): value is string {
  return typeof value === 'string' && isRepresentableInstant(Date.parse(value));
}

function hasValidBoundaries(value: Record<string, unknown>): boolean {
  return (
    (value.anchorAt === undefined || isInstant(value.anchorAt)) &&
    (value.until === undefined || isInstant(value.until))
  );
}

/**
 * Verifica estruturalmente uma regra de recorrência: frequência conhecida, parâmetros inteiros
 * dentro dos limites e instantes delimitadores representáveis. Não normaliza nem exige formato
 * textual canônico.
 */
export function isRecurrence(value: unknown): value is Recurrence {
  if (!isRecord(value) || !isRecurrenceFrequency(value.frequency) || !hasValidBoundaries(value)) {
    return false;
  }

  if (value.frequency === 'DAILY') {
    const intervalDays = value.intervalDays;

    return (
      typeof intervalDays === 'number' &&
      Number.isSafeInteger(intervalDays) &&
      intervalDays >= RECURRENCE_LIMITS.intervalDaysMin &&
      intervalDays <= RECURRENCE_LIMITS.intervalDaysMax
    );
  }

  if (value.frequency === 'WEEKLY') {
    const weekdays = value.weekdays;

    if (
      !Array.isArray(weekdays) ||
      weekdays.length < RECURRENCE_LIMITS.weekdaysMin ||
      weekdays.length > RECURRENCE_LIMITS.weekdaysMax
    ) {
      return false;
    }

    const seen = new Set<number>();

    for (const weekday of weekdays) {
      if (typeof weekday !== 'number' || !Number.isSafeInteger(weekday) || weekday < 0 || weekday > 6) {
        return false;
      }

      if (seen.has(weekday)) {
        return false;
      }

      seen.add(weekday);
    }

    return true;
  }

  const dayOfMonth = value.dayOfMonth;

  return (
    typeof dayOfMonth === 'number' &&
    Number.isSafeInteger(dayOfMonth) &&
    dayOfMonth >= RECURRENCE_LIMITS.dayOfMonthMin &&
    dayOfMonth <= RECURRENCE_LIMITS.dayOfMonthMax
  );
}

function withLocalTime(source: Date, year: number, month: number, day: number): Date {
  return new Date(
    year,
    month,
    day,
    source.getHours(),
    source.getMinutes(),
    source.getSeconds(),
    source.getMilliseconds(),
  );
}

/**
 * Avança um passo civil no fuso local do navegador, preservando a hora local do dia. Em
 * `MONTHLY`, dia do mês inexistente é ajustado para o último dia daquele mês, sem tornar o
 * ajuste permanente.
 */
export function stepRecurrence(recurrence: Recurrence, instant: Date): Date {
  const year = instant.getFullYear();
  const month = instant.getMonth();
  const day = instant.getDate();

  if (recurrence.frequency === 'DAILY') {
    return withLocalTime(instant, year, month, day + recurrence.intervalDays);
  }

  if (recurrence.frequency === 'WEEKLY') {
    for (let offset = 1; offset <= 7; offset += 1) {
      const candidate = withLocalTime(instant, year, month, day + offset);

      if (recurrence.weekdays.includes(candidate.getDay())) {
        return candidate;
      }
    }

    throw new Error('A regra semanal não possui dias da semana válidos.');
  }

  const nextMonth = month + 1;
  const lastDay = new Date(year, nextMonth + 1, 0).getDate();

  return withLocalTime(instant, year, nextMonth, Math.min(recurrence.dayOfMonth, lastDay));
}

/**
 * Instante agendado da próxima ocorrência após `now`, ancorado em `anchorAt ?? dueAt` e avançando
 * quantas vezes forem necessárias. Ocorrências perdidas são puladas. Devolve `undefined` quando a
 * base é irreversível ou o próximo instante ultrapassa `until`.
 */
export function resolveNextScheduledAt(
  recurrence: Recurrence,
  dueAt: string,
  now: Date,
): string | undefined {
  const anchorMs = Date.parse(recurrence.anchorAt ?? dueAt);

  if (!isRepresentableInstant(anchorMs)) {
    return undefined;
  }

  let instant = new Date(anchorMs);

  do {
    const stepped = stepRecurrence(recurrence, instant);

    if (stepped.getTime() <= instant.getTime()) {
      return undefined;
    }

    instant = stepped;
  } while (instant.getTime() <= now.getTime());

  if (recurrence.until !== undefined) {
    const untilMs = Date.parse(recurrence.until);

    if (!isRepresentableInstant(untilMs) || instant.getTime() > untilMs) {
      return undefined;
    }
  }

  return instant.toISOString();
}

export interface NextOccurrenceContext {
  now: Date;
  generateId: IdGenerator;
}

/** Regra transportada para a nova ocorrência: a ancoragem passa a ser o próprio prazo dela. */
function transferRecurrence(recurrence: Recurrence): Recurrence {
  const base = recurrence.until === undefined ? {} : { until: recurrence.until };

  if (recurrence.frequency === 'DAILY') {
    return { ...base, frequency: 'DAILY', intervalDays: recurrence.intervalDays };
  }

  if (recurrence.frequency === 'WEEKLY') {
    return { ...base, frequency: 'WEEKLY', weekdays: [...recurrence.weekdays] };
  }

  return { ...base, frequency: 'MONTHLY', dayOfMonth: recurrence.dayOfMonth };
}

/**
 * Cria a próxima ocorrência a partir da ocorrência fechada: nova identidade, status `TODO`, os
 * campos editáveis copiados, a regra transferida, o mesmo `seriesId`, os lembretes por
 * deslocamento com identificadores próprios, sem ocorrência processada, e as subtarefas na mesma
 * ordem, desmarcadas e com identificadores próprios.
 */
export function buildNextOccurrence(
  task: Task,
  recurrence: Recurrence,
  scheduledAt: string,
  context: NextOccurrenceContext,
): Task {
  if (task.seriesId === undefined) {
    throw new Error('A série precisa de um identificador para gerar a próxima ocorrência.');
  }

  const reminderDrafts: TaskReminderDraft[] = task.reminders
    .filter((reminder) => reminder.type === 'OFFSET')
    .map((reminder) => ({ type: 'OFFSET', offsetMinutes: reminder.offsetMinutes }));
  const timestamp = context.now.toISOString();

  return {
    id: context.generateId(),
    title: task.title,
    ...(task.description !== undefined && { description: task.description }),
    ...(task.requester !== undefined && { requester: task.requester }),
    ...(task.assignee !== undefined && { assignee: task.assignee }),
    status: 'TODO',
    priority: task.priority,
    dueAt: scheduledAt,
    reminders: buildReminders(reminderDrafts, [], context.generateId),
    recurrence: transferRecurrence(recurrence),
    subtasks: resetSubtasks(task.subtasks, context.generateId),
    seriesId: task.seriesId,
    tags: [...task.tags],
    ...(task.sourceUrl !== undefined && { sourceUrl: task.sourceUrl }),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
