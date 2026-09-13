import type { Clock, Task } from '@/domain/task';
import {
  findDeliverableReminder,
  markReminderTriggered,
  planReminders,
  settleElapsedReminders,
} from '@/domain/task-reminders';
import type { ReminderScheduler } from './reminder-scheduler';
import type { TaskRepository } from './task-repository';

export interface ReminderNotification {
  /** Identificador determinístico da ocorrência; reutilizá-lo substitui a notificação anterior. */
  id: string;
  taskTitle: string;
  dueAt: string;
}

export interface ReminderNotifier {
  notify(notification: ReminderNotification): Promise<void>;
}

export interface ReminderAlarm {
  taskId: string;
  reminderId: string;
  /** Epoch em milissegundos registrado no alarme recebido. */
  scheduledTime: number;
}

export type ReminderAlarmOutcome = 'NOTIFIED' | 'DISCARDED';

export interface ReminderServiceDependencies {
  repository: TaskRepository;
  scheduler: ReminderScheduler;
  notifier: ReminderNotifier;
  clock: Clock;
}

/**
 * Operações de lembrete executadas pelo service worker. Os dados persistidos são a fonte de
 * verdade; as operações desta instância são serializadas para que uma reconciliação e um
 * alarme recebidos juntos não processem a mesma ocorrência em paralelo.
 */
export function createReminderService({
  repository,
  scheduler,
  notifier,
  clock,
}: ReminderServiceDependencies) {
  let queue: Promise<unknown> = Promise.resolve();

  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }

  async function reconcileAll(): Promise<void> {
    const now = clock();
    const settledTasks: Task[] = [];

    for (const task of await repository.list()) {
      const settled = settleElapsedReminders(task, now);

      if (settled !== task) {
        await repository.save(settled);
      }

      settledTasks.push(settled);
    }

    await scheduler.reconcileAll(settledTasks.flatMap((task) => planReminders(task, now)));
  }

  async function handleAlarm(alarm: ReminderAlarm): Promise<ReminderAlarmOutcome> {
    const task = await repository.get(alarm.taskId);
    const reminder = findDeliverableReminder(task, alarm.reminderId, alarm.scheduledTime);

    if (!task?.dueAt || !reminder) {
      // Remove o alarme obsoleto e restaura somente o que ainda for válido para a tarefa.
      await scheduler.reconcileTask(alarm.taskId, task ? planReminders(task, clock()) : []);
      return 'DISCARDED';
    }

    await notifier.notify({
      id: `${task.id}:${reminder.id}:${task.dueAt}`,
      taskTitle: task.title,
      dueAt: task.dueAt,
    });
    await repository.save(markReminderTriggered(task, reminder.id));
    return 'NOTIFIED';
  }

  return {
    reconcileAll: () => serialized(reconcileAll),
    handleAlarm: (alarm: ReminderAlarm) => serialized(() => handleAlarm(alarm)),
  };
}

export type ReminderService = ReturnType<typeof createReminderService>;
