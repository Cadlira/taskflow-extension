import { createPinia, setActivePinia } from 'pinia';
import { createApp } from 'vue';
import { createAiProviderService } from '@/application/ai/ai-provider-service';
import { createBackupService } from '@/application/backup/backup-service';
import { createTaskService } from '@/application/task-service';
import { createTrashService } from '@/application/trash-service';
import { aiProviderServiceKey } from '@/components/ai/ai-service-key';
import { backupServiceKey } from '@/components/backup/backup-service-key';
import { pendingCaptureKey } from '@/components/capture/pending-capture-key';
import { trashServiceKey } from '@/components/trash/trash-service-key';
import type { Task } from '@/domain/task';
import { taskServiceKey } from '@/stores/task-store';
import {
  FakeActivePageReader,
  FakeAiConnectionTester,
  FakeHostPermissions,
  FakePendingCaptureInbox,
  FakeReminderScheduler,
  InMemoryAiProviderConfigRepository,
  InMemoryTaskRepository,
} from './fakes';
import { sequentialIds } from './task-fixtures';

/** Monta serviço com fakes e uma Pinia ativa com o serviço fornecido no nível da aplicação. */
export function createTaskTestContext(tasks: Task[] = []) {
  const repository = new InMemoryTaskRepository(tasks);
  const scheduler = new FakeReminderScheduler();
  const pageReader = new FakeActivePageReader();
  const pendingCapture = new FakePendingCaptureInbox();
  const service = createTaskService({
    repository,
    trash: repository,
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
  const trashService = createTrashService({
    trash: repository,
    tasks: service,
    clock: () => new Date(),
  });
  const aiRepository = new InMemoryAiProviderConfigRepository();
  const aiPermissions = new FakeHostPermissions();
  const aiTester = new FakeAiConnectionTester();
  const aiService = createAiProviderService({
    repository: aiRepository,
    permissions: aiPermissions,
    tester: aiTester,
  });
  const pinia = createPinia();
  const app = createApp({});
  app.provide(taskServiceKey, service);
  app.provide(backupServiceKey, backupService);
  app.provide(trashServiceKey, trashService);
  app.provide(aiProviderServiceKey, aiService);
  app.use(pinia);
  setActivePinia(pinia);

  return {
    repository,
    scheduler,
    service,
    backupService,
    trashService,
    aiRepository,
    aiPermissions,
    aiTester,
    aiService,
    pageReader,
    pendingCapture,
    pinia,
    /** Opções `global` para `mount` do Vue Test Utils. */
    global: {
      plugins: [pinia],
      provide: {
        [taskServiceKey as symbol]: service,
        [backupServiceKey as symbol]: backupService,
        [trashServiceKey as symbol]: trashService,
        [aiProviderServiceKey as symbol]: aiService,
        [pendingCaptureKey as symbol]: pendingCapture,
      },
    },
  };
}
