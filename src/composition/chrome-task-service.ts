import { createTaskService, type TaskService } from '@/application/task-service';
import { ChromeReminderScheduler } from '@/infrastructure/chrome/chrome-reminder-scheduler';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';

/** Composição concreta dos casos de uso com as APIs do Chrome. */
export function createChromeTaskService(): TaskService {
  return createTaskService({
    repository: new ChromeTaskRepository(),
    scheduler: new ChromeReminderScheduler(),
    clock: () => new Date(),
    generateId: () => crypto.randomUUID(),
  });
}
