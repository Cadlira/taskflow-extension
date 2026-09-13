import { createReminderService, type ReminderService } from '@/application/reminder-service';
import { ChromeReminderNotifier } from '@/infrastructure/chrome/chrome-reminder-notifier';
import { ChromeReminderScheduler } from '@/infrastructure/chrome/chrome-reminder-scheduler';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';

/** Composição concreta dos lembretes para o service worker. */
export function createChromeReminderService(): ReminderService {
  return createReminderService({
    repository: new ChromeTaskRepository(),
    scheduler: new ChromeReminderScheduler(),
    notifier: new ChromeReminderNotifier(),
    clock: () => new Date(),
  });
}
