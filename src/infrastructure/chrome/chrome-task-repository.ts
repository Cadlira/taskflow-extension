import {
  TaskStorageError,
  type TaskRepository,
  type Unsubscribe,
} from '@/application/task-repository';
import type { Task } from '@/domain/task';
import {
  decodeStoredTaskCollection,
  encodeStoredTaskCollection,
  TASKS_STORAGE_KEY,
} from '@/infrastructure/storage/stored-task-collection';

type StorageChanges = Record<string, { newValue?: unknown }>;

function unavailable(cause: unknown): TaskStorageError {
  return new TaskStorageError('UNAVAILABLE', 'Não foi possível acessar o armazenamento local.', {
    cause,
  });
}

/** Repository sobre `chrome.storage.local`, com uma única chave versionada. */
export class ChromeTaskRepository implements TaskRepository {
  private pendingWrite: Promise<unknown> = Promise.resolve();

  async list(): Promise<Task[]> {
    let stored: Record<string, unknown>;

    try {
      stored = await browser.storage.local.get(TASKS_STORAGE_KEY);
    } catch (error) {
      throw unavailable(error);
    }

    return decodeStoredTaskCollection(stored[TASKS_STORAGE_KEY]);
  }

  async get(id: string): Promise<Task | undefined> {
    return (await this.list()).find((task) => task.id === id);
  }

  save(task: Task): Promise<void> {
    return this.mutate((tasks) => {
      const index = tasks.findIndex((candidate) => candidate.id === task.id);
      return index === -1 ? [...tasks, task] : tasks.with(index, task);
    });
  }

  delete(id: string): Promise<void> {
    return this.mutate((tasks) => tasks.filter((task) => task.id !== id));
  }

  subscribe(
    onChange: (tasks: Task[]) => void,
    onError?: (error: TaskStorageError) => void,
  ): Unsubscribe {
    const listener = (changes: StorageChanges, areaName: string): void => {
      const change = changes[TASKS_STORAGE_KEY];

      if (areaName !== 'local' || change === undefined) {
        return;
      }

      try {
        onChange(decodeStoredTaskCollection(change.newValue));
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
    const operation = this.pendingWrite.then(async () => {
      const next = change(await this.list());

      try {
        await browser.storage.local.set({ [TASKS_STORAGE_KEY]: encodeStoredTaskCollection(next) });
      } catch (error) {
        throw unavailable(error);
      }
    });

    this.pendingWrite = operation.catch(() => undefined);
    return operation;
  }
}
