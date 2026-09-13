import { createPinia, setActivePinia } from 'pinia';
import { createApp } from 'vue';
import { createTaskService } from '@/application/task-service';
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
  const pinia = createPinia();
  const app = createApp({});
  app.provide(taskServiceKey, service);
  app.use(pinia);
  setActivePinia(pinia);

  return {
    repository,
    scheduler,
    service,
    pinia,
    /** Opções `global` para `mount` do Vue Test Utils. */
    global: {
      plugins: [pinia],
      provide: { [taskServiceKey as symbol]: service },
    },
  };
}
