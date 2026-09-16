import type { Recurrence } from './task-recurrence';

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

interface TaskReminderBase {
  /** UUID gerado localmente, preservado ao editar a configuração. */
  id: string;
  /** Instante efetivo (ISO 8601 UTC) da ocorrência já processada. */
  processedFor?: string;
}

/** Lembrete relativo: duração exata antes de `dueAt`; acompanha mudanças do prazo. */
export interface OffsetTaskReminder extends TaskReminderBase {
  type: 'OFFSET';
  /** Minutos exatos antes de `dueAt`. */
  offsetMinutes: number;
}

/** Lembrete absoluto: instante exato (ISO 8601 UTC); não acompanha mudanças do prazo. */
export interface AbsoluteTaskReminder extends TaskReminderBase {
  type: 'AT';
  at: string;
}

export type TaskReminder = OffsetTaskReminder | AbsoluteTaskReminder;

export interface Task {
  /** UUID gerado localmente. */
  id: string;
  title: string;
  description?: string;
  requester?: string;
  assignee?: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Instante ISO 8601 UTC. */
  dueAt?: string;
  reminders: TaskReminder[];
  /** Identificador da série; presente em todas as ocorrências, inclusive terminais. */
  seriesId?: string;
  /** Regra de recorrência; presente apenas na ocorrência que ainda gera a próxima. */
  recurrence?: Recurrence;
  tags: string[];
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export type Clock = () => Date;
export type IdGenerator = () => string;

export function isTaskStatus(value: unknown): value is TaskStatus {
  return typeof value === 'string' && (TASK_STATUSES as readonly string[]).includes(value);
}

export function isTaskPriority(value: unknown): value is TaskPriority {
  return typeof value === 'string' && (TASK_PRIORITIES as readonly string[]).includes(value);
}

export function isActiveStatus(status: TaskStatus): boolean {
  return status === 'TODO' || status === 'IN_PROGRESS';
}
