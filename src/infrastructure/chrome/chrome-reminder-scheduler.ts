import type { ReminderScheduler } from '@/application/reminder-scheduler';
import type { PlannedReminder } from '@/domain/task-reminders';

const ALARM_PREFIX = 'taskflow:reminder:';

export interface ReminderAlarmReference {
  taskId: string;
  reminderId: string;
}

export function reminderAlarmName({ taskId, reminderId }: ReminderAlarmReference): string {
  return `${ALARM_PREFIX}${taskId}:${reminderId}`;
}

export function parseReminderAlarmName(name: string): ReminderAlarmReference | undefined {
  if (!name.startsWith(ALARM_PREFIX)) {
    return undefined;
  }

  const [taskId, reminderId, ...rest] = name.slice(ALARM_PREFIX.length).split(':');
  return taskId && reminderId && rest.length === 0 ? { taskId, reminderId } : undefined;
}

/** Scheduler idempotente sobre `chrome.alarms`, com um alarme nomeado por lembrete. */
export class ChromeReminderScheduler implements ReminderScheduler {
  reconcileTask(taskId: string, planned: readonly PlannedReminder[]): Promise<void> {
    return this.reconcile(
      (name) => parseReminderAlarmName(name)?.taskId === taskId,
      planned.filter((alarm) => alarm.taskId === taskId),
    );
  }

  reconcileAll(planned: readonly PlannedReminder[]): Promise<void> {
    return this.reconcile((name) => parseReminderAlarmName(name) !== undefined, planned);
  }

  private async reconcile(
    isManaged: (name: string) => boolean,
    planned: readonly PlannedReminder[],
  ): Promise<void> {
    const desired = new Map(planned.map((alarm) => [reminderAlarmName(alarm), alarm.triggerAt]));
    const existing = (await browser.alarms.getAll()).filter((alarm) => isManaged(alarm.name));
    const current = new Map(existing.map((alarm) => [alarm.name, alarm.scheduledTime]));

    await Promise.all(
      existing
        .filter((alarm) => !desired.has(alarm.name))
        .map((alarm) => browser.alarms.clear(alarm.name)),
    );

    // Criar com o mesmo nome substitui o alarme anterior; horários iguais são mantidos.
    await Promise.all(
      [...desired]
        .filter(([name, when]) => current.get(name) !== when)
        .map(([name, when]) => browser.alarms.create(name, { when })),
    );
  }
}
