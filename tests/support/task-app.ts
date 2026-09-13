import { createPinia, setActivePinia } from 'pinia';
import { createApp } from 'vue';
import { createBackupService } from '@/application/backup/backup-service';
import { createTaskService } from '@/application/task-service';
import { backupServiceKey } from '@/components/backup/backup-service-key';
import type { Task } from '@/domain/task';
import { taskServiceKey } from '@/stores/task-store';
import { FakeReminderScheduler, InMemoryTaskRepository } from './fakes';
import { sequentialIds } from './task-fixtures';

/** Monta serviço com fakes e uma Pinia ativa com o serviço fornecido no nível da aplicação. */
export function createTaskTestContext(tasks: Task[] = []) {
  const repository = new InMemoryTaskRepository(tasks);
  const scheduler = new FakeReminderScheduler();
  const service = createTaskService({
    repository,
    scheduler,
    clock: () => new Date(),
    generateId: sequentialIds('uuid'),
  });
  const backupService = createBackupService({
    repository,
    scheduler,
    clock: () => new Date(),
    appVersion: '0.1.0',
  });
  const pinia = createPinia();
  const app = createApp({});
  app.provide(taskServiceKey, service);
  app.provide(backupServiceKey, backupService);
  app.use(pinia);
  setActivePinia(pinia);

  return {
    repository,
    scheduler,
    service,
    backupService,
    pinia,
    /** Opções `global` para `mount` do Vue Test Utils. */
    global: {
      plugins: [pinia],
      provide: {
        [taskServiceKey as symbol]: service,
        [backupServiceKey as symbol]: backupService,
      },
    },
  };
}
