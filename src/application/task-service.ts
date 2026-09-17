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
import {
  revertTasks,
  type RevertOutcome,
  type RevertPlan,
  type RevertRefusal,
  type UndoPlan,
} from '@/domain/task-undo';
import type { ReminderScheduler } from './reminder-scheduler';
import type { TaskRepository } from './task-repository';
import type { TaskTrashRepository } from './task-trash-repository';

export interface TaskServiceDependencies {
  repository: TaskRepository;
  trash: TaskTrashRepository;
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
      /** Como desfazer a ação; ausente quando nada foi alterado ou a ação não admite desfazer. */
      undo?: UndoPlan;
    }
  | { ok: false; errors: TaskFieldErrors };

/** Resultado de excluir uma tarefa, que passa a ficar na lixeira. */
export interface TaskRemovalResult {
  /** Ausente quando a tarefa já não existia e nada foi movido. */
  undo?: UndoPlan;
}

/** Resultado de devolver uma tarefa da lixeira à coleção. */
export type TaskRestoreResult =
  | { status: 'RESTORED'; task: Task; remindersPending: boolean }
  | { status: 'NOT_IN_TRASH' }
  | { status: 'ID_EXISTS' };

/**
 * Resultado de desfazer. `removedTaskId` identifica a ocorrência gerada pela ação e removida junto
 * com a reversão.
 */
export type UndoResult =
  | { status: 'UNDONE'; task: Task; remindersPending: boolean; removedTaskId?: string }
  | { status: 'NOT_IN_TRASH' | 'ID_EXISTS' | RevertRefusal };

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

/** Tarefa gravada por uma ação e, quando houver, a ocorrência criada na mesma gravação. */
interface Persisted {
  task: Task;
  remindersPending: boolean;
  generated?: Task;
}

/**
 * Casos de uso de tarefas. Falhas de persistência são propagadas como exceção; falhas de
 * agendamento não desfazem a tarefa salva e são sinalizadas em `remindersPending`.
 */
export function createTaskService({
  repository,
  trash,
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

  async function persist(task: Task, now: Date): Promise<Persisted> {
    const settled = settleElapsedReminders(task, now);
    await repository.save(settled);
    const remindersPending = await reconcileReminders(settled, now);
    return { task: settled, remindersPending };
  }

  /**
   * Fecha a ocorrência que carrega a regra e, quando a série continua, cria a seguinte na mesma
   * gravação. Os lembretes das duas passam pela reconciliação já existente.
   */
  async function persistOccurrenceTransition(
    closed: Task,
    next: Task,
    now: Date,
  ): Promise<Persisted> {
    const settledClosed = settleElapsedReminders(closed, now);
    const settledNext = settleElapsedReminders(next, now);
    await repository.saveMany([settledClosed, settledNext]);
    const closedPending = await reconcileReminders(settledClosed, now);
    const nextPending = await reconcileReminders(settledNext, now);
    return {
      task: settledClosed,
      remindersPending: closedPending || nextPending,
      generated: settledNext,
    };
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
  ): Promise<Persisted> {
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

  /** Resultado da mutação com o plano para voltar à versão persistida antes da ação. */
  function undoableResult(previous: Task, persisted: Persisted): TaskMutationResult {
    const { task, remindersPending, generated } = persisted;
    const undo: RevertPlan = {
      kind: 'REVERT',
      previous,
      expectedUpdatedAt: task.updatedAt,
      ...(generated !== undefined && {
        generated: { id: generated.id, updatedAt: generated.updatedAt },
      }),
    };

    return { ok: true, task, remindersPending, undo };
  }

  async function requireTask(id: string): Promise<Task> {
    const task = await repository.get(id);

    if (!task) {
      throw new TaskNotFoundError(id);
    }

    return task;
  }

  async function restoreFromTrash(id: string): Promise<TaskRestoreResult> {
    const now = clock();
    const result = await trash.restoreFromTrash(id, (task) => settleElapsedReminders(task, now));

    if (result.status !== 'RESTORED') {
      return result;
    }

    const remindersPending = await reconcileReminders(result.task, now);
    return { status: 'RESTORED', task: result.task, remindersPending };
  }

  async function revert(plan: RevertPlan): Promise<UndoResult> {
    const now = clock();
    const outcome = await repository.revertConditionally<RevertOutcome>((tasks) => {
      const reverted = revertTasks(tasks, plan, now);
      return reverted.ok ? { next: reverted.tasks, result: reverted } : { result: reverted };
    });

    if (!outcome.ok) {
      return { status: outcome.reason };
    }

    const remindersPending = await reconcileReminders(outcome.reverted, now);
    const { generated } = plan;

    if (generated === undefined) {
      return { status: 'UNDONE', task: outcome.reverted, remindersPending };
    }

    // Alarmes remanescentes da ocorrência removida são descartados no disparo e pela reconciliação global.
    await scheduler.reconcileTask(generated.id, []).catch(() => undefined);
    return {
      status: 'UNDONE',
      task: outcome.reverted,
      remindersPending,
      removedTaskId: generated.id,
    };
  }

  return {
    list: (): Promise<Task[]> => repository.list(),

    get: (id: string): Promise<Task | undefined> => repository.get(id),

    subscribe: repository.subscribe.bind(repository),

    async create(draft: TaskDraft): Promise<TaskMutationResult> {
      const now = clock();
      const result = createTask(draft, { now, generateId });

      if (!result.ok) {
        return result;
      }

      const { task, remindersPending } = await persist(result.value, now);
      return { ok: true, task, remindersPending };
    },

    async update(
      id: string,
      draft: TaskDraft,
      cancellation?: RecurrenceCancellation,
    ): Promise<TaskMutationResult> {
      const now = clock();
      const previous = await requireTask(id);
      const result = updateTask(previous, draft, { now, generateId });

      if (!result.ok) {
        return result;
      }

      return undoableResult(previous, await persistTransition(result.value, cancellation, now));
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

      return undoableResult(task, await persistTransition(changed, cancellation, now));
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

    /** Move a tarefa para a lixeira e remove seus alarmes. */
    async remove(id: string): Promise<TaskRemovalResult> {
      const moved = await trash.moveToTrash(id, clock());
      // Alarmes remanescentes são descartados no disparo e pela reconciliação global.
      await scheduler.reconcileTask(id, []).catch(() => undefined);
      return moved === undefined ? {} : { undo: { kind: 'RESTORE_FROM_TRASH', taskId: id } };
    },

    /**
     * Devolve a tarefa da lixeira marcando como processados os lembretes vencidos no intervalo e
     * reconcilia seus alarmes. Falha no agendamento não desfaz a restauração.
     */
    restoreFromTrash,

    /** Aplica o plano de desfazer sobre os dados persistidos mais recentes. */
    async undo(plan: UndoPlan): Promise<UndoResult> {
      if (plan.kind === 'REVERT') {
        return revert(plan);
      }

      const restored = await restoreFromTrash(plan.taskId);

      return restored.status === 'RESTORED'
        ? { status: 'UNDONE', task: restored.task, remindersPending: restored.remindersPending }
        : restored;
    },
  };
}

export type TaskService = ReturnType<typeof createTaskService>;
