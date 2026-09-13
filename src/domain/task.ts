export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface TaskReminder {
  id: string;
  /** Minutos antes de `dueAt` em que o lembrete deve ocorrer. */
  offsetMinutes: number;
  /** Instante de prazo (ISO 8601 UTC) para o qual esta ocorrência já foi processada. */
  lastTriggeredFor?: string;
}

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
