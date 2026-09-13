import { createChromeReminderService } from '@/composition/chrome-reminder-service';
import { parseReminderAlarmName } from '@/infrastructure/chrome/chrome-reminder-scheduler';

function logFailure(context: string) {
  return (error: unknown): void => {
    console.error(`TaskFlow: falha ao ${context}.`, error);
  };
}

export default defineBackground(() => {
  const reminders = createChromeReminderService();

  // Listeners são registrados de forma síncrona para que eventos reativem o service worker.
  const reconcile = () => reminders.reconcileAll().catch(logFailure('reconciliar lembretes'));

  browser.runtime.onInstalled.addListener(reconcile);
  browser.runtime.onStartup.addListener(reconcile);

  browser.alarms.onAlarm.addListener((alarm) => {
    const reference = parseReminderAlarmName(alarm.name);

    if (!reference) {
      return undefined;
    }

    return reminders
      .handleAlarm({ ...reference, scheduledTime: alarm.scheduledTime })
      .catch(logFailure('processar lembrete'));
  });
});
