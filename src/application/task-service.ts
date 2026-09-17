import type { Clock, IdGenerator, Task, TaskStatus } from '@/domain/task';
import { createTask, updateTask, type TaskDraft, type TaskFieldErrors } from '@/domain/task-draft';
import {
  buildNextOccurrence,
  resolveNextScheduledAt,
  type Recurrence,
} from '@/domain/task-recurrence';
import { planReminders, settleElapsedReminders } from '@/domain/task-reminders';
import { applyStatus } from '@/domain/task-status';
import { setSubtaskDone } from '@/domain/task-subtasks';
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

/**
 * Resultado de marcar ou desmarcar uma subtarefa. `task` é a versão persistida mais recente
 * quando a tarefa existe, gravada ou não.
 */
export type SubtaskToggleResult =
  | { status: 'SAVED'; task: Task }
  | { status: 'UNCHANGED'; task: Task }
  | { status: 'TASK_NOT_FOUND' }
  | { status: 'SUBTASK_NOT_FOUND'; task: Task };

/** Escolha explícita ao cancelar uma ocorrência que carrega a regra da série. */
export type RecurrenceCancellation = 'SKIP' | 'END';

export class TaskNotFoundError extends Error {
  constructor(id: string) {
    super(`A tarefa ${id} não foi encontrada.`);
    this.name = 'TaskNotFoundError';
  }
}

export class RecurrenceChoiceRequiredError extends Error {
  constructor(id: string) {
    super(`A ocorrência ${id} pertence a uma série e exige a escolha entre pular e encerrar.`);
    this.name = 'RecurrenceChoiceRequiredError';
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

  /**
   * Fecha a ocorrência que carrega a regra e, quando a série continua, cria a seguinte na mesma
   * gravação. Os lembretes das duas passam pela reconciliação já existente.
   */
  async function persistOccurrenceTransition(
    closed: Task,
    next: Task,
    now: Date,
  ): Promise<TaskMutationResult> {
    const settledClosed = settleElapsedReminders(closed, now);
    const settledNext = settleElapsedReminders(next, now);
    await repository.saveMany([settledClosed, settledNext]);
    const closedPending = await reconcileReminders(settledClosed, now);
    const nextPending = await reconcileReminders(settledNext, now);
    return { ok: true, task: settledClosed, remindersPending: closedPending || nextPending };
  }

  function nextOccurrenceOf(closed: Task, recurrence: Recurrence, now: Date): Task | undefined {
    const { dueAt } = closed;

    if (dueAt === undefined) {
      return undefined;
    }

    const scheduledAt = resolveNextScheduledAt(recurrence, dueAt, now);

    return scheduledAt === undefined
      ? undefined
      : buildNextOccurrence(closed, recurrence, scheduledAt, { now, generateId });
  }

  /**
   * Aplica o fechamento de uma ocorrência recorrente: a regra sai da ocorrência fechada e a
   * seguinte nasce apenas quando a série continua. Encerrar a série ou atingir o limite apenas
   * fecha a ocorrência sem gerar nada.
   */
  async function persistTransition(
    task: Task,
    cancellation: RecurrenceCancellation | undefined,
    now: Date,
  ): Promise<TaskMutationResult> {
    const { recurrence, ...withoutRule } = task;

    if (recurrence === undefined || (task.status !== 'DONE' && task.status !== 'CANCELLED')) {
      return persist(task, now);
    }

    if (task.status === 'CANCELLED' && cancellation === undefined) {
      throw new RecurrenceChoiceRequiredError(task.id);
    }

    const closed: Task = withoutRule;
    const next =
      cancellation === 'END' ? undefined : nextOccurrenceOf(closed, recurrence, now);

    if (next === undefined) {
      return persist(closed, now);
    }

    return persistOccurrenceTransition(closed, next, now);
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

    async update(
      id: string,
      draft: TaskDraft,
      cancellation?: RecurrenceCancellation,
    ): Promise<TaskMutationResult> {
      const now = clock();
      const result = updateTask(await requireTask(id), draft, { now, generateId });
      return result.ok ? persistTransition(result.value, cancellation, now) : result;
    },

    async changeStatus(
      id: string,
      status: TaskStatus,
      cancellation?: RecurrenceCancellation,
    ): Promise<TaskMutationResult> {
      const now = clock();
      const task = await requireTask(id);
      const changed = applyStatus(task, status, now);

      if (changed === task) {
        return { ok: true, task, remindersPending: false };
      }

      return persistTransition(changed, cancellation, now);
    },

    /**
     * Altera somente a marcação da subtarefa sobre a tarefa relida, sem sobrescrever alterações
     * concorrentes. Não altera status, prazo nem lembretes e, por isso, não reconcilia alarmes.
     */
    async setSubtaskDone(
      taskId: string,
      subtaskId: string,
      done: boolean,
    ): Promise<SubtaskToggleResult> {
      let outcome: SubtaskToggleResult = { status: 'TASK_NOT_FOUND' };

      const saved = await repository.updateTaskConditionally(taskId, (task) => {
        const changed = setSubtaskDone(task, subtaskId, done, clock());

        if (changed === undefined) {
          outcome = { status: 'SUBTASK_NOT_FOUND', task };
        } else if (changed === task) {
          outcome = { status: 'UNCHANGED', task };
        }

        return changed;
      });

      return saved === undefined ? outcome : { status: 'SAVED', task: saved };
    },

    async remove(id: string): Promise<void> {
      await repository.delete(id);
      // Alarmes remanescentes são descartados no disparo e pela reconciliação global.
      await scheduler.reconcileTask(id, []).catch(() => undefined);
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
