import {
  TaskStorageError,
  type ReminderOccurrenceClaim,
  type TaskRepository,
  type Unsubscribe,
} from '@/application/task-repository';
import type {
  TaskTrashRepository,
  TrashRestoreResult,
} from '@/application/task-trash-repository';
import type { Task } from '@/domain/task';
import { claimReminderOccurrence } from '@/domain/task-reminders';
import {
  addToTrash,
  pruneTrash,
  sortTrashForDisplay,
  type TrashItem,
} from '@/domain/task-trash';
import {
  decodeStoredTaskCollection,
  encodeStoredTaskCollection,
  TASKS_STORAGE_KEY,
} from '@/infrastructure/storage/stored-task-collection';
import {
  decodeStoredTrash,
  encodeStoredTrash,
  TRASH_STORAGE_KEY,
} from '@/infrastructure/storage/stored-trash';

type StorageChanges = Record<string, { newValue?: unknown }>;

/** Novos valores das duas chaves; chave ausente não é gravada. */
interface StorageChange<T> {
  tasks?: Task[];
  trash?: TrashItem[] | undefined;
  result: T;
}

function unavailable(cause: unknown): TaskStorageError {
  return new TaskStorageError('UNAVAILABLE', 'Não foi possível acessar o armazenamento local.', {
    cause,
  });
}

/**
 * Repository sobre `chrome.storage.local`, com a coleção de tarefas e a lixeira em chaves
 * versionadas. As duas compartilham a fila de escrita da instância.
 */
export class ChromeTaskRepository implements TaskRepository, TaskTrashRepository {
  private pendingWrite: Promise<unknown> = Promise.resolve();

  async list(): Promise<Task[]> {
    const stored = await this.read(TASKS_STORAGE_KEY);
    return decodeStoredTaskCollection(stored[TASKS_STORAGE_KEY]);
  }

  async get(id: string): Promise<Task | undefined> {
    return (await this.list()).find((task) => task.id === id);
  }

  save(task: Task): Promise<void> {
    return this.saveMany([task]);
  }

  saveMany(tasks: Task[]): Promise<void> {
    return this.mutate((current) => {
      let next = current;

      for (const task of tasks) {
        const index = next.findIndex((candidate) => candidate.id === task.id);
        next = index === -1 ? [...next, task] : next.with(index, task);
      }

      return next;
    });
  }

  replaceAll(tasks: Task[]): Promise<void> {
    return this.mutate(() => tasks);
  }

  delete(id: string): Promise<void> {
    return this.mutate((tasks) => tasks.filter((task) => task.id !== id));
  }

  claimReminderOccurrence(claim: ReminderOccurrenceClaim): Promise<boolean> {
    return this.mutateConditional((tasks) => {
      const index = tasks.findIndex((task) => task.id === claim.taskId);

      if (index === -1) {
        return { result: false };
      }

      const claimed = claimReminderOccurrence(
        tasks[index]!,
        claim.reminderId,
        claim.processedFor,
      );

      if (claimed === undefined) {
        return { result: false };
      }

      return { next: tasks.with(index, claimed), result: true };
    });
  }

  updateTaskConditionally(
    id: string,
    change: (task: Task) => Task | undefined,
  ): Promise<Task | undefined> {
    return this.mutateConditional((tasks) => {
      const index = tasks.findIndex((task) => task.id === id);
      const current = tasks[index];

      if (current === undefined) {
        return { result: undefined };
      }

      const updated = change(current);

      if (updated === undefined || updated === current) {
        return { result: undefined };
      }

      return { next: tasks.with(index, updated), result: updated };
    });
  }

  revertConditionally<T>(change: (tasks: Task[]) => { next?: Task[]; result: T }): Promise<T> {
    return this.mutateConditional(change);
  }

  moveToTrash(id: string, deletedAt: Date): Promise<Task | undefined> {
    return this.mutateBoth((tasks, trash) => {
      const task = tasks.find((candidate) => candidate.id === id);

      if (task === undefined) {
        return { result: undefined };
      }

      return {
        tasks: tasks.filter((candidate) => candidate.id !== id),
        trash: addToTrash(trash, task, deletedAt),
        result: task,
      };
    });
  }

  restoreFromTrash(id: string, prepare: (task: Task) => Task): Promise<TrashRestoreResult> {
    return this.mutateBoth<TrashRestoreResult>((tasks, trash) => {
      const item = trash.find((candidate) => candidate.task.id === id);

      if (item === undefined) {
        return { result: { status: 'NOT_IN_TRASH' } };
      }

      if (tasks.some((task) => task.id === id)) {
        return { result: { status: 'ID_EXISTS' } };
      }

      const task = prepare(item.task);

      return {
        tasks: [...tasks, task],
        trash: trash.filter((candidate) => candidate !== item),
        result: { status: 'RESTORED', task },
      };
    });
  }

  listTrash(now: Date): Promise<TrashItem[]> {
    return this.mutateTrash((trash) => {
      const kept = pruneTrash(trash, now);
      return { trash: kept === trash ? undefined : kept, result: sortTrashForDisplay(kept) };
    });
  }

  purgeTrash(now: Date): Promise<void> {
    return this.mutateTrash((trash) => {
      const kept = pruneTrash(trash, now);
      return { trash: kept === trash ? undefined : kept, result: undefined };
    });
  }

  deleteFromTrash(id: string): Promise<void> {
    return this.mutateTrash((trash) => {
      const kept = trash.filter((item) => item.task.id !== id);
      return { trash: kept.length === trash.length ? undefined : kept, result: undefined };
    });
  }

  emptyTrash(): Promise<void> {
    return this.mutateTrash((trash) => ({
      trash: trash.length === 0 ? undefined : [],
      result: undefined,
    }));
  }

  subscribe(
    onChange: (tasks: Task[]) => void,
    onError?: (error: TaskStorageError) => void,
  ): Unsubscribe {
    return this.listen(TASKS_STORAGE_KEY, decodeStoredTaskCollection, onChange, onError);
  }

  subscribeTrash(
    onChange: (items: TrashItem[]) => void,
    onError?: (error: TaskStorageError) => void,
  ): Unsubscribe {
    return this.listen(TRASH_STORAGE_KEY, decodeStoredTrash, onChange, onError);
  }

  private listen<T>(
    key: string,
    decode: (value: unknown) => T,
    onChange: (value: T) => void,
    onError?: (error: TaskStorageError) => void,
  ): Unsubscribe {
    const listener = (changes: StorageChanges, areaName: string): void => {
      const change = changes[key];

      if (areaName !== 'local' || change === undefined) {
        return;
      }

      try {
        onChange(decode(change.newValue));
      } catch (error) {
        if (error instanceof TaskStorageError) {
          onError?.(error);
        } else {
          throw error;
        }
      }
    };

    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }

  /**
   * Serializa leituras e escritas desta instância. A leitura prévia garante que dados
   * incompatíveis nunca sejam sobrescritos.
   */
  private mutate(change: (tasks: Task[]) => Task[]): Promise<void> {
    return this.mutateConditional((tasks) => ({ next: change(tasks), result: undefined }));
  }

  /** Variante condicional: sem `next`, nada é gravado e o resultado é apenas sinalizado. */
  private mutateConditional<T>(
    change: (tasks: Task[]) => { next?: Task[]; result: T },
  ): Promise<T> {
    return this.enqueue(async () => {
      const { next, result } = change(await this.list());

      if (next !== undefined) {
        await this.write({ [TASKS_STORAGE_KEY]: encodeStoredTaskCollection(next) });
      }

      return result;
    });
  }

  /** Opera somente sobre a lixeira; a coleção de tarefas não é lida nem gravada. */
  private mutateTrash<T>(
    change: (trash: TrashItem[]) => { trash?: TrashItem[] | undefined; result: T },
  ): Promise<T> {
    return this.enqueue(async () => {
      const stored = await this.read(TRASH_STORAGE_KEY);
      const { trash, result } = change(decodeStoredTrash(stored[TRASH_STORAGE_KEY]));

      if (trash !== undefined) {
        await this.write({ [TRASH_STORAGE_KEY]: encodeStoredTrash(trash) });
      }

      return result;
    });
  }

  /**
   * Lê as duas chaves e grava as alteradas em um único `storage.local.set`. Qualquer chave
   * incompatível impede a gravação de ambas.
   */
  private mutateBoth<T>(
    change: (tasks: Task[], trash: TrashItem[]) => StorageChange<T>,
  ): Promise<T> {
    return this.enqueue(async () => {
      const stored = await this.read([TASKS_STORAGE_KEY, TRASH_STORAGE_KEY]);
      const { tasks, trash, result } = change(
        decodeStoredTaskCollection(stored[TASKS_STORAGE_KEY]),
        decodeStoredTrash(stored[TRASH_STORAGE_KEY]),
      );
      const values: Record<string, unknown> = {
        ...(tasks !== undefined && { [TASKS_STORAGE_KEY]: encodeStoredTaskCollection(tasks) }),
        ...(trash !== undefined && { [TRASH_STORAGE_KEY]: encodeStoredTrash(trash) }),
      };

      if (Object.keys(values).length > 0) {
        await this.write(values);
      }

      return result;
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const pending = this.pendingWrite.then(operation);
    this.pendingWrite = pending.catch(() => undefined);
    return pending;
  }

  private async read(keys: string | string[]): Promise<Record<string, unknown>> {
    try {
      return await browser.storage.local.get(keys);
    } catch (error) {
      throw unavailable(error);
    }
  }

  private async write(values: Record<string, unknown>): Promise<void> {
    try {
      await browser.storage.local.set(values);
    } catch (error) {
      throw unavailable(error);
    }
  }
}
