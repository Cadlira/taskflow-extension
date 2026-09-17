import { defineStore } from 'pinia';
import { computed, inject, onBeforeUnmount, onMounted, ref, type InjectionKey } from 'vue';
import { TaskStorageError } from '@/application/task-repository';
import type {
  RecurrenceCancellation,
  TaskMutationResult,
  TaskService,
  UndoResult,
} from '@/application/task-service';
import type { Task, TaskStatus } from '@/domain/task';
import type { TaskDraft, TaskFieldErrors } from '@/domain/task-draft';
import type { UndoPlan } from '@/domain/task-undo';
import {
  EMPTY_TASK_FILTERS,
  filterTasks,
  getDueSituation,
  sortTasks,
  type DueSituation,
  type TaskFilters,
  type TaskSortKey,
} from '@/domain/task-queries';

export const taskServiceKey: InjectionKey<TaskService> = Symbol('TaskService');

export type SubtaskToggleStoreResult = { ok: true; task: Task } | { ok: false; message: string };

export type StoreMutationResult =
  | { ok: true; task: Task; remindersPending: boolean; undo?: UndoPlan }
  | { ok: false; errors: TaskFieldErrors; message?: string };

export type StoreRemovalResult = { ok: true; undo?: UndoPlan } | { ok: false; message: string };

export type StoreUndoResult =
  | { ok: true; task: Task; remindersPending: boolean }
  | { ok: false; message: string };

const UNDO_FAILURE = 'A ação não foi desfeita.';

/** Motivos de recusa do desfazer, sem sobrescrever dados persistidos. */
const UNDO_REFUSALS: Record<Exclude<UndoResult['status'], 'UNDONE'>, string> = {
  CHANGED: `${UNDO_FAILURE} A tarefa foi alterada depois da ação.`,
  REMOVED: `${UNDO_FAILURE} A tarefa foi removida depois da ação.`,
  GENERATED_CHANGED: `${UNDO_FAILURE} A ocorrência criada pela ação foi alterada ou removida depois dela.`,
  NOT_IN_TRASH: 'A tarefa não pode mais ser restaurada porque não está mais na lixeira.',
  ID_EXISTS: 'A tarefa não foi restaurada porque já existe na listagem.',
};

/** Intervalo para atualizar sinalizações de prazo enquanto a superfície está aberta. */
const CLOCK_REFRESH_MS = 60_000;

function describeFailure(error: unknown, fallback: string): string {
  return error instanceof TaskStorageError ? `${fallback} ${error.message}` : fallback;
}

function requireTaskService(): TaskService {
  const service = inject(taskServiceKey);

  if (!service) {
    throw new Error('TaskService não foi fornecido para a aplicação.');
  }

  return service;
}

/** Estado de apresentação de uma superfície. O repository permanece como fonte persistente. */
export const useTaskStore = defineStore('tasks', () => {
  const service = requireTaskService();

  const tasks = ref<Task[]>([]);
  const loading = ref(false);
  const loaded = ref(false);
  const loadError = ref<string | null>(null);
  const syncError = ref<string | null>(null);
  const filters = ref<TaskFilters>({ ...EMPTY_TASK_FILTERS });
  const sortKey = ref<TaskSortKey>('DUE_DATE');
  const selectedTaskId = ref<string | null>(null);
  const now = ref(new Date());

  let unsubscribe: (() => void) | null = null;
  let clockTimer: ReturnType<typeof setInterval> | null = null;

  const visibleTasks = computed(() =>
    sortTasks(filterTasks(tasks.value, filters.value, now.value), sortKey.value),
  );

  const hasActiveFilters = computed(
    () =>
      filters.value.search.trim() !== '' ||
      filters.value.status !== 'ALL' ||
      filters.value.priority !== 'ALL' ||
      filters.value.dueSituation !== 'ALL',
  );

  const selectedTask = computed(
    () => tasks.value.find((task) => task.id === selectedTaskId.value) ?? null,
  );

  function dueSituationOf(task: Task): DueSituation | undefined {
    return getDueSituation(task, now.value);
  }

  function replaceTasks(next: Task[]): void {
    tasks.value = next;
    now.value = new Date();
    syncError.value = null;
  }

  function upsertTask(task: Task): void {
    const index = tasks.value.findIndex((candidate) => candidate.id === task.id);
    replaceTasks(index === -1 ? [...tasks.value, task] : tasks.value.with(index, task));
  }

  async function load(): Promise<void> {
    loading.value = true;
    loadError.value = null;

    try {
      replaceTasks(await service.list());
      loaded.value = true;
    } catch (error) {
      loadError.value = describeFailure(error, 'Não foi possível carregar as tarefas.');
    } finally {
      loading.value = false;
    }
  }

  /** Inicia a sincronização com o armazenamento. Chamadas repetidas não duplicam inscrições. */
  async function connect(): Promise<void> {
    if (!unsubscribe) {
      unsubscribe = service.subscribe(replaceTasks, (error) => {
        syncError.value = describeFailure(error, 'Não foi possível sincronizar as tarefas.');
      });
      clockTimer = setInterval(() => {
        now.value = new Date();
      }, CLOCK_REFRESH_MS);
    }

    await load();
  }

  function disconnect(): void {
    unsubscribe?.();
    unsubscribe = null;

    if (clockTimer !== null) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  }

  async function mutate(
    operation: () => Promise<TaskMutationResult>,
    failure: string,
  ): Promise<StoreMutationResult> {
    try {
      const result = await operation();

      if (result.ok) {
        upsertTask(result.task);
      }

      return result;
    } catch (error) {
      return { ok: false, errors: {}, message: describeFailure(error, failure) };
    }
  }

  function create(draft: TaskDraft): Promise<StoreMutationResult> {
    return mutate(() => service.create(draft), 'A tarefa não foi salva.');
  }

  function update(
    id: string,
    draft: TaskDraft,
    cancellation?: RecurrenceCancellation,
  ): Promise<StoreMutationResult> {
    return mutate(
      () => (cancellation === undefined ? service.update(id, draft) : service.update(id, draft, cancellation)),
      'As alterações não foram salvas.',
    );
  }

  function changeStatus(
    id: string,
    status: TaskStatus,
    cancellation?: RecurrenceCancellation,
  ): Promise<StoreMutationResult> {
    return mutate(
      () =>
        cancellation === undefined
          ? service.changeStatus(id, status)
          : service.changeStatus(id, status, cancellation),
      'O status não foi alterado.',
    );
  }

  /**
   * Marca ou desmarca uma subtarefa. A lista reflete a versão persistida devolvida, inclusive
   * quando a subtarefa deixou de existir, para que a caixa volte ao estado real.
   */
  async function setSubtaskDone(
    taskId: string,
    subtaskId: string,
    done: boolean,
  ): Promise<SubtaskToggleStoreResult> {
    const failure = 'A alteração da subtarefa não foi salva.';

    try {
      const result = await service.setSubtaskDone(taskId, subtaskId, done);

      if (result.status === 'TASK_NOT_FOUND') {
        replaceTasks(tasks.value.filter((task) => task.id !== taskId));
        return { ok: false, message: `${failure} A tarefa não existe mais.` };
      }

      upsertTask(result.task);

      return result.status === 'SUBTASK_NOT_FOUND'
        ? { ok: false, message: `${failure} A subtarefa não existe mais.` }
        : { ok: true, task: result.task };
    } catch (error) {
      return { ok: false, message: describeFailure(error, failure) };
    }
  }

  async function remove(id: string): Promise<StoreRemovalResult> {
    try {
      const { undo } = await service.remove(id);
      replaceTasks(tasks.value.filter((task) => task.id !== id));

      if (selectedTaskId.value === id) {
        selectedTaskId.value = null;
      }

      return undo === undefined ? { ok: true } : { ok: true, undo };
    } catch (error) {
      return { ok: false, message: describeFailure(error, 'A tarefa não foi excluída.') };
    }
  }

  /** Aplica o plano de desfazer; recusas não gravam nada e são traduzidas em mensagem. */
  async function undo(plan: UndoPlan): Promise<StoreUndoResult> {
    try {
      const result = await service.undo(plan);

      if (result.status !== 'UNDONE') {
        return { ok: false, message: UNDO_REFUSALS[result.status] };
      }

      const { removedTaskId } = result;

      if (removedTaskId !== undefined) {
        replaceTasks(tasks.value.filter((task) => task.id !== removedTaskId));
      }

      upsertTask(result.task);
      return { ok: true, task: result.task, remindersPending: result.remindersPending };
    } catch (error) {
      return { ok: false, message: describeFailure(error, UNDO_FAILURE) };
    }
  }

  function setFilters(changes: Partial<TaskFilters>): void {
    filters.value = { ...filters.value, ...changes };
  }

  function clearFilters(): void {
    filters.value = { ...EMPTY_TASK_FILTERS };
  }

  function setSortKey(key: TaskSortKey): void {
    sortKey.value = key;
  }

  function select(id: string | null): void {
    selectedTaskId.value = id;
  }

  return {
    tasks,
    loading,
    loaded,
    loadError,
    syncError,
    filters,
    sortKey,
    selectedTaskId,
    now,
    visibleTasks,
    hasActiveFilters,
    selectedTask,
    dueSituationOf,
    load,
    connect,
    disconnect,
    create,
    update,
    changeStatus,
    setSubtaskDone,
    remove,
    undo,
    setFilters,
    clearFilters,
    setSortKey,
    select,
  };
});

export type TaskStore = ReturnType<typeof useTaskStore>;

/** Conecta a store ao ciclo de vida do componente raiz da superfície. */
export function useConnectedTaskStore(): TaskStore {
  const store = useTaskStore();

  onMounted(() => {
    void store.connect();
  });
  onBeforeUnmount(() => {
    store.disconnect();
  });

  return store;
}
