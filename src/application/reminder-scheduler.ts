import type { PlannedReminder } from '@/domain/task-reminders';

/** Materializa lembretes planejados em um mecanismo de alarmes persistente do navegador. */
export interface ReminderScheduler {
  /** Garante que existam somente os alarmes planejados para a tarefa informada. */
  reconcileTask(taskId: string, planned: readonly PlannedReminder[]): Promise<void>;
  /** Garante que existam somente os alarmes planejados para todas as tarefas. */
  reconcileAll(planned: readonly PlannedReminder[]): Promise<void>;
}
