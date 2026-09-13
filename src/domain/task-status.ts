import type { Task, TaskStatus } from './task';

/**
 * Aplica as regras de ciclo de vida: `DONE` registra `completedAt`, qualquer outro status o
 * limpa. Reaplicar o mesmo status preserva `completedAt` e não altera `updatedAt`.
 */
export function applyStatus(task: Task, status: TaskStatus, now: Date): Task {
  if (task.status === status) {
    return task;
  }

  const rest: Task = { ...task };
  delete rest.completedAt;
  const timestamp = now.toISOString();

  return status === 'DONE'
    ? { ...rest, status, completedAt: timestamp, updatedAt: timestamp }
    : { ...rest, status, updatedAt: timestamp };
}

export function completeTask(task: Task, now: Date): Task {
  return applyStatus(task, 'DONE', now);
}

export function cancelTask(task: Task, now: Date): Task {
  return applyStatus(task, 'CANCELLED', now);
}

export function reopenTask(task: Task, now: Date): Task {
  return applyStatus(task, 'TODO', now);
}
