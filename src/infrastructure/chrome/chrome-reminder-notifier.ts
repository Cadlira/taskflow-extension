import type { ReminderNotification, ReminderNotifier } from '@/application/reminder-service';

const dueDateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

/** Entrega lembretes com `chrome.notifications`. */
export class ChromeReminderNotifier implements ReminderNotifier {
  async notify({ id, taskTitle, dueAt }: ReminderNotification): Promise<void> {
    await browser.notifications.create(`taskflow:${id}`, {
      type: 'basic',
      iconUrl: browser.runtime.getURL('/reminder-icon.png'),
      title: taskTitle,
      message: `Prazo: ${dueDateFormat.format(new Date(dueAt))}`,
      contextMessage: 'Lembrete do TaskFlow',
    });
  }
}
