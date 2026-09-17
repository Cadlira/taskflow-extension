import { createTaskService, type TaskService } from '@/application/task-service';
import { createTrashService, type TrashService } from '@/application/trash-service';
import { ChromeReminderScheduler } from '@/infrastructure/chrome/chrome-reminder-scheduler';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';

export interface ChromeTaskServices {
  tasks: TaskService;
  trash: TrashService;
}

/** Composição concreta dos casos de uso com as APIs do Chrome. */
export function createChromeTaskService(
  repository: ChromeTaskRepository = new ChromeTaskRepository(),
): TaskService {
  return createTaskService({
    repository,
    trash: repository,
    scheduler: new ChromeReminderScheduler(),
    clock: () => new Date(),
    generateId: () => crypto.randomUUID(),
  });
}

/**
 * Tarefas e lixeira sobre a mesma instância do repository, para que as escritas das duas chaves
 * compartilhem a fila da superfície.
 */
export function createChromeTaskServices(): ChromeTaskServices {
  const repository = new ChromeTaskRepository();
  const tasks = createChromeTaskService(repository);

  return {
    tasks,
    trash: createTrashService({ trash: repository, tasks, clock: () => new Date() }),
  };
}
