import { buildMenuCapture } from '@/application/page-capture';
import { createChromeReminderService } from '@/composition/chrome-reminder-service';
import {
  registerCaptureMenu,
  toMenuCaptureClick,
} from '@/infrastructure/chrome/chrome-capture-menu';
import { ChromePendingCaptureInbox } from '@/infrastructure/chrome/chrome-pending-capture-inbox';
import { openSidePanelInWindow } from '@/infrastructure/chrome/chrome-side-panel-window';
import { parseReminderAlarmName } from '@/infrastructure/chrome/chrome-reminder-scheduler';

function logFailure(context: string) {
  return (error: unknown): void => {
    console.error(`TaskFlow: falha ao ${context}.`, error);
  };
}

/** Registra a falha da captura sem incluir título, URL ou texto selecionado. */
function logCaptureFailure(error: unknown): void {
  const description = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('TaskFlow: falha ao capturar a página.', description);
}

export default defineBackground(() => {
  const reminders = createChromeReminderService();
  const inbox = new ChromePendingCaptureInbox();

  // Listeners são registrados de forma síncrona para que eventos reativem o service worker.
  const reconcile = () => reminders.reconcileAll().catch(logFailure('reconciliar lembretes'));
  const installMenu = () => registerCaptureMenu().catch(logFailure('registrar o menu de captura'));

  browser.runtime.onInstalled.addListener(() => {
    installMenu();
    return reconcile();
  });
  browser.runtime.onStartup.addListener(reconcile);

  browser.contextMenus.onClicked.addListener((info, tab) => {
    const capture = buildMenuCapture(toMenuCaptureClick(info, tab), {
      clock: () => new Date(),
      generateId: () => crypto.randomUUID(),
    });

    if (!capture) {
      return undefined;
    }

    // `sidePanel.open` exige o gesto do usuário: precisa ser chamado antes de qualquer await.
    const opening = tab?.windowId !== undefined ? openSidePanelInWindow(tab.windowId) : undefined;

    return Promise.allSettled([...(opening ? [opening] : []), inbox.save(capture)]).then(
      (results) => {
        for (const result of results) {
          if (result.status === 'rejected') {
            logCaptureFailure(result.reason);
          }
        }
      },
    );
  });

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
