import { isActiveStatus, type Task, type TaskPriority, type TaskStatus } from './task';

export const DUE_SOON_WINDOW_MS = 24 * 60 * 60 * 1000;

export type DueSituation = 'OVERDUE' | 'DUE_SOON';

export type TaskSortKey = 'DUE_DATE' | 'PRIORITY' | 'STATUS';

export interface TaskFilters {
  search: string;
  status: TaskStatus | 'ALL';
  priority: TaskPriority | 'ALL';
  dueSituation: DueSituation | 'ALL';
}

export const EMPTY_TASK_FILTERS: Readonly<TaskFilters> = Object.freeze({
  search: '',
  status: 'ALL',
  priority: 'ALL',
  dueSituation: 'ALL',
});

const PRIORITY_ORDER: Record<TaskPriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
const STATUS_ORDER: Record<TaskStatus, number> = { TODO: 0, IN_PROGRESS: 1, DONE: 2, CANCELLED: 3 };

/**
 * Atrasada: tarefa ativa cujo prazo é anterior ao instante atual.
 * Próxima do vencimento: tarefa ativa com prazo no intervalo [agora, agora + 24 horas].
 */
export function getDueSituation(task: Task, now: Date): DueSituation | undefined {
  if (task.dueAt === undefined || !isActiveStatus(task.status)) {
    return undefined;
  }

  const remaining = Date.parse(task.dueAt) - now.getTime();

  if (remaining < 0) {
    return 'OVERDUE';
  }

  return remaining <= DUE_SOON_WINDOW_MS ? 'DUE_SOON' : undefined;
}

export function matchesSearch(task: Task, search: string): boolean {
  const term = search.trim().toLocaleLowerCase();

  if (!term) {
    return true;
  }

  return [task.title, task.description, task.requester, task.assignee, ...task.tags].some((value) =>
    value?.toLocaleLowerCase().includes(term),
  );
}

export function filterTasks(tasks: readonly Task[], filters: TaskFilters, now: Date): Task[] {
  return tasks.filter(
    (task) =>
      matchesSearch(task, filters.search) &&
      (filters.status === 'ALL' || task.status === filters.status) &&
      (filters.priority === 'ALL' || task.priority === filters.priority) &&
      (filters.dueSituation === 'ALL' || getDueSituation(task, now) === filters.dueSituation),
  );
}

function compareCreatedAtDesc(left: Task, right: Task): number {
  return Date.parse(right.createdAt) - Date.parse(left.createdAt);
}

function compareDueAt(left: Task, right: Task): number {
  if (left.dueAt === undefined || right.dueAt === undefined) {
    return Number(left.dueAt === undefined) - Number(right.dueAt === undefined);
  }

  return Date.parse(left.dueAt) - Date.parse(right.dueAt);
}

const COMPARATORS: Record<TaskSortKey, (left: Task, right: Task) => number> = {
  DUE_DATE: (left, right) => compareDueAt(left, right) || compareCreatedAtDesc(left, right),
  PRIORITY: (left, right) =>
    PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
    compareCreatedAtDesc(left, right),
  STATUS: (left, right) =>
    STATUS_ORDER[left.status] - STATUS_ORDER[right.status] ||
    compareDueAt(left, right) ||
    compareCreatedAtDesc(left, right),
};

export function sortTasks(tasks: readonly Task[], sortKey: TaskSortKey): Task[] {
  return [...tasks].sort(COMPARATORS[sortKey]);
}
