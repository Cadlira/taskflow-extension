import { createBackupService, type BackupService } from '@/application/backup/backup-service';
import { ChromeReminderScheduler } from '@/infrastructure/chrome/chrome-reminder-scheduler';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';

/** Composição concreta dos casos de uso de backup para o Side Panel. */
export function createChromeBackupService(): BackupService {
  return createBackupService({
    repository: new ChromeTaskRepository(),
    scheduler: new ChromeReminderScheduler(),
    clock: () => new Date(),
    appVersion: browser.runtime.getManifest().version,
  });
}
