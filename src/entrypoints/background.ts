import { buildMenuCapture } from '@/application/page-capture';
import { createChromeReminderService } from '@/composition/chrome-reminder-service';
import { createChromeTaskServices } from '@/composition/chrome-task-service';
import {
  registerCaptureMenu,
  toMenuCaptureClick,
} from '@/infrastructure/chrome/chrome-capture-menu';
import { ChromePendingCaptureInbox } from '@/infrastructure/chrome/chrome-pending-capture-inbox';
import { openSidePanelInWindow } from '@/infrastructure/chrome/chrome-side-panel-window';
import { parseReminderAlarmName } from '@/infrastructure/chrome/chrome-reminder-scheduler';

/** Comando declarado no Manifest; o comando reservado de ação não chega por `onCommand`. */
const OPEN_TASK_MANAGER_COMMAND = 'open-task-manager';

function logFailure(context: string) {
  return (error: unknown): void => {
    console.error(`TaskFlow: falha ao ${context}.`, error);
  };
}

/** Mensagem fixa: a falha pode envolver itens da lixeira, cujo conteúdo nunca vai para logs. */
function logTrashPurgeFailure(): void {
  console.error('TaskFlow: falha ao limpar a lixeira.');
}

/** Registra a falha da captura sem incluir título, URL ou texto selecionado. */
function logCaptureFailure(error: unknown): void {
  const description = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('TaskFlow: falha ao capturar a página.', description);
}

/** Registra a falha do comando sem incluir nenhum conteúdo de tarefa. */
function logCommandFailure(error?: unknown): void {
  if (error === undefined) {
    console.error('TaskFlow: falha ao abrir o gerenciamento pelo atalho.');
    return;
  }

  const description = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('TaskFlow: falha ao abrir o gerenciamento pelo atalho.', description);
}

export default defineBackground(() => {
  const reminders = createChromeReminderService();
  const { trash } = createChromeTaskServices();
  const inbox = new ChromePendingCaptureInbox();

  // Listeners são registrados de forma síncrona para que eventos reativem o service worker.
  const reconcile = () => reminders.reconcileAll().catch(logFailure('reconciliar lembretes'));
  const installMenu = () => registerCaptureMenu().catch(logFailure('registrar o menu de captura'));
  // Sem alarme periódico: itens vencidos também são descartados ao excluir e ao abrir a lixeira.
  const purgeTrash = () => trash.purge().catch(logTrashPurgeFailure);

  browser.runtime.onInstalled.addListener(() => {
    installMenu();
    return Promise.all([reconcile(), purgeTrash()]);
  });
  browser.runtime.onStartup.addListener(() => Promise.all([reconcile(), purgeTrash()]));

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

  browser.commands.onCommand.addListener((command, tab) => {
    if (command !== OPEN_TASK_MANAGER_COMMAND) {
      return undefined;
    }

    const windowId = tab?.windowId;

    if (windowId === undefined) {
      logCommandFailure();
      return undefined;
    }

    // `sidePanel.open` exige o gesto do usuário: chamada antes de qualquer await.
    return openSidePanelInWindow(windowId).catch(logCommandFailure);
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
