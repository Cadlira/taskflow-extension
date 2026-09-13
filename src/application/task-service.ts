import type { Clock, IdGenerator, Task, TaskStatus } from '@/domain/task';
import { createTask, updateTask, type TaskDraft, type TaskFieldErrors } from '@/domain/task-draft';
import { planReminders, settleElapsedReminders } from '@/domain/task-reminders';
import { applyStatus } from '@/domain/task-status';
import type { ReminderScheduler } from './reminder-scheduler';
import type { TaskRepository } from './task-repository';

export interface TaskServiceDependencies {
  repository: TaskRepository;
  scheduler: ReminderScheduler;
  clock: Clock;
  generateId: IdGenerator;
}

export type TaskMutationResult =
  | {
      ok: true;
      task: Task;
      /** Verdadeiro quando a tarefa foi salva, mas seus lembretes não puderam ser agendados. */
      remindersPending: boolean;
    }
  | { ok: false; errors: TaskFieldErrors };

export class TaskNotFoundError extends Error {
  constructor(id: string) {
    super(`A tarefa ${id} não foi encontrada.`);
    this.name = 'TaskNotFoundError';
  }
}

/**
 * Casos de uso de tarefas. Falhas de persistência são propagadas como exceção; falhas de
 * agendamento não desfazem a tarefa salva e são sinalizadas em `remindersPending`.
 */
export function createTaskService({
  repository,
  scheduler,
  clock,
  generateId,
}: TaskServiceDependencies) {
  async function reconcileReminders(task: Task, now: Date): Promise<boolean> {
    const planned = planReminders(task, now);

    try {
      await scheduler.reconcileTask(task.id, planned);
      return false;
    } catch {
      return planned.length > 0;
    }
  }

  async function persist(task: Task, now: Date): Promise<TaskMutationResult> {
    const settled = settleElapsedReminders(task, now);
    await repository.save(settled);
    const remindersPending = await reconcileReminders(settled, now);
    return { ok: true, task: settled, remindersPending };
  }

  async function requireTask(id: string): Promise<Task> {
    const task = await repository.get(id);

    if (!task) {
      throw new TaskNotFoundError(id);
    }

    return task;
  }

  return {
    list: (): Promise<Task[]> => repository.list(),

    get: (id: string): Promise<Task | undefined> => repository.get(id),

    subscribe: repository.subscribe.bind(repository),

    async create(draft: TaskDraft): Promise<TaskMutationResult> {
      const now = clock();
      const result = createTask(draft, { now, generateId });
      return result.ok ? persist(result.value, now) : result;
    },

    async update(id: string, draft: TaskDraft): Promise<TaskMutationResult> {
      const now = clock();
      const result = updateTask(await requireTask(id), draft, { now, generateId });
      return result.ok ? persist(result.value, now) : result;
    },

    async changeStatus(id: string, status: TaskStatus): Promise<TaskMutationResult> {
      const now = clock();
      const task = await requireTask(id);
      const changed = applyStatus(task, status, now);

      return changed === task ? { ok: true, task, remindersPending: false } : persist(changed, now);
    },

    async remove(id: string): Promise<void> {
      await repository.delete(id);
      // Alarmes remanescentes são descartados no disparo e pela reconciliação global.
      await scheduler.reconcileTask(id, []).catch(() => undefined);
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
