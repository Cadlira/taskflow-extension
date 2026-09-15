import {
  TaskStorageError,
  type ReminderOccurrenceClaim,
  type TaskRepository,
  type Unsubscribe,
} from '@/application/task-repository';
import type { Task } from '@/domain/task';
import { claimReminderOccurrence } from '@/domain/task-reminders';
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
    return this.mutateConditional((tasks) => ({ next: change(tasks), result: undefined }));
  }

  /** Variante condicional: sem `next`, nada é gravado e o resultado é apenas sinalizado. */
  private mutateConditional<T>(
    change: (tasks: Task[]) => { next?: Task[]; result: T },
  ): Promise<T> {
    const operation = this.pendingWrite.then(async () => {
      const { next, result } = change(await this.list());

      if (next === undefined) {
        return result;
      }

      try {
        await browser.storage.local.set({ [TASKS_STORAGE_KEY]: encodeStoredTaskCollection(next) });
      } catch (error) {
        throw unavailable(error);
      }

      return result;
    });

    this.pendingWrite = operation.catch(() => undefined);
    return operation;
  }
}
