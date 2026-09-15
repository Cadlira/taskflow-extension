import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CAPTURE_MENU_ITEM_IDS } from '@/application/page-capture';
import background from '@/entrypoints/background';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { PENDING_CAPTURE_STORAGE_KEY } from '@/infrastructure/chrome/chrome-pending-capture-inbox';
import { resolveReminderTriggerAt } from '@/domain/task-reminders';
import { buildTask, FIXED_NOW, hoursFrom } from '../support/task-fixtures';

const DUE_AT = hoursFrom(FIXED_NOW, 2);
const ALARM_15 = 'taskflow:reminder:task-1:r15';

const menuClicks: Array<
  (info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) => unknown
> = [];

function clickMenuItem(
  info: Partial<Browser.contextMenus.OnClickData> = {},
  tab?: Browser.tabs.Tab,
): unknown {
  const listener = menuClicks[0];
  if (!listener) throw new Error('listener de contextMenus.onClicked não registrado');
  return listener({ editable: false, menuItemId: CAPTURE_MENU_ITEM_IDS.page, ...info }, tab);
}

async function storedCapture(): Promise<unknown> {
  const stored = await fakeBrowser.storage.session.get(PENDING_CAPTURE_STORAGE_KEY);
  return stored[PENDING_CAPTURE_STORAGE_KEY];
}

function alarm(name: string, scheduledTime: number) {
  return { name, scheduledTime, persistAcrossSessions: false };
}

async function alarmNames(): Promise<string[]> {
  return (await fakeBrowser.alarms.getAll()).map((alarm) => alarm.name).sort();
}

async function seed(...tasks: ReturnType<typeof buildTask>[]): Promise<void> {
  const repository = new ChromeTaskRepository();
  for (const task of tasks) {
    await repository.save(task);
  }
}

describe('background', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    menuClicks.length = 0;
    vi.spyOn(fakeBrowser.contextMenus, 'removeAll').mockResolvedValue(undefined);
    vi.spyOn(fakeBrowser.contextMenus, 'create').mockReturnValue('taskflow:menu');
    vi.spyOn(fakeBrowser.contextMenus.onClicked, 'addListener').mockImplementation((listener) => {
      menuClicks.push(listener);
    });
    vi.spyOn(fakeBrowser.contextMenus.onClicked, 'removeListener').mockImplementation(
      () => undefined,
    );
    vi.spyOn(fakeBrowser.sidePanel, 'open').mockResolvedValue(undefined);
    background.main();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe.each([
    [
      'runtime.onInstalled',
      () => fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' } as never),
    ],
    ['runtime.onStartup', () => fakeBrowser.runtime.onStartup.trigger()],
  ])('reconciliação em %s', (_event, trigger) => {
    it('recria alarmes futuros ausentes e marca ocorrências passadas sem notificar', async () => {
      await seed(
        buildTask({
          dueAt: DUE_AT,
          reminders: [
            { id: 'r15', type: 'OFFSET', offsetMinutes: 15 },
            { id: 'r1440', type: 'OFFSET', offsetMinutes: 1440 },
          ],
        }),
      );
      await fakeBrowser.alarms.create('taskflow:reminder:excluida:r', { when: Date.now() + 1000 });

      await trigger();

      expect(await alarmNames()).toEqual([ALARM_15]);
      expect((await fakeBrowser.alarms.get(ALARM_15))?.scheduledTime).toBe(
        resolveReminderTriggerAt({ id: 'r15', type: 'OFFSET', offsetMinutes: 15 }, DUE_AT),
      );
      const [stored] = await new ChromeTaskRepository().list();
      expect(stored?.reminders.find((reminder) => reminder.id === 'r1440')?.processedFor).toBe(
        new Date(
          resolveReminderTriggerAt({ id: 'r1440', type: 'OFFSET', offsetMinutes: 1440 }, DUE_AT),
        ).toISOString(),
      );
      expect(fakeBrowser.notifications.getAllCreateOptions()).toEqual({});
    });
  });

  it('converge ao recriar o worker usando somente storage e alarmes persistentes', async () => {
    await seed(
      buildTask({ dueAt: DUE_AT, reminders: [{ id: 'r15', type: 'OFFSET', offsetMinutes: 15 }] }),
    );

    await fakeBrowser.runtime.onStartup.trigger();
    expect(await alarmNames()).toEqual([ALARM_15]);

    // Simula um worker recriado sem estado em memória e um alarme perdido pelo navegador.
    await fakeBrowser.alarms.clear(ALARM_15);
    await fakeBrowser.runtime.onStartup.trigger();

    expect(await alarmNames()).toEqual([ALARM_15]);
    expect((await fakeBrowser.alarms.get(ALARM_15))?.scheduledTime).toBe(
      resolveReminderTriggerAt({ id: 'r15', type: 'OFFSET', offsetMinutes: 15 }, DUE_AT),
    );
  });

  describe('alarms.onAlarm', () => {
    const scheduledTime = resolveReminderTriggerAt(
      { id: 'r15', type: 'OFFSET', offsetMinutes: 15 },
      DUE_AT,
    );

    beforeEach(() => {
      vi.setSystemTime(scheduledTime);
    });

    it('recarrega a tarefa e entrega notificação válida uma única vez', async () => {
      await seed(
        buildTask({
          title: 'Enviar proposta',
          dueAt: DUE_AT,
          reminders: [{ id: 'r15', type: 'OFFSET', offsetMinutes: 15 }],
        }),
      );

      await fakeBrowser.alarms.onAlarm.trigger(alarm(ALARM_15, scheduledTime));
      await fakeBrowser.alarms.onAlarm.trigger(alarm(ALARM_15, scheduledTime));

      const notifications = Object.entries(fakeBrowser.notifications.getAllCreateOptions());
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.[1]).toMatchObject({
        type: 'basic',
        title: 'Enviar proposta',
        message: expect.stringMatching(/^Prazo: /),
        iconUrl: expect.stringContaining('icon/128.png'),
      });
      const [stored] = await new ChromeTaskRepository().list();
      expect(stored?.reminders[0]?.processedFor).toBe(
        new Date(scheduledTime).toISOString(),
      );
    });

    it('descarta alarme de tarefa concluída sem notificar e remove o alarme', async () => {
      await seed(
        buildTask({
          status: 'DONE',
          completedAt: FIXED_NOW.toISOString(),
          dueAt: DUE_AT,
          reminders: [{ id: 'r15', type: 'OFFSET', offsetMinutes: 15 }],
        }),
      );
      await fakeBrowser.alarms.create(ALARM_15, { when: scheduledTime });

      await fakeBrowser.alarms.onAlarm.trigger(alarm(ALARM_15, scheduledTime));

      expect(fakeBrowser.notifications.getAllCreateOptions()).toEqual({});
      expect(await alarmNames()).toEqual([]);
    });

    it('descarta alarme de tarefa excluída', async () => {
      await fakeBrowser.alarms.onAlarm.trigger(alarm(ALARM_15, scheduledTime));

      expect(fakeBrowser.notifications.getAllCreateOptions()).toEqual({});
    });

    it('ignora alarmes que não pertencem ao TaskFlow', async () => {
      const get = vi.spyOn(fakeBrowser.storage.local, 'get');

      await fakeBrowser.alarms.onAlarm.trigger(alarm('outro-alarme', scheduledTime));

      expect(get).not.toHaveBeenCalled();
    });

    it('registra falha de entrega sem interromper o service worker', async () => {
      await seed(
        buildTask({ dueAt: DUE_AT, reminders: [{ id: 'r15', type: 'OFFSET', offsetMinutes: 15 }] }),
      );
      vi.spyOn(fakeBrowser.notifications, 'create').mockRejectedValueOnce(new Error('bloqueado'));

      await expect(
        fakeBrowser.alarms.onAlarm.trigger(alarm(ALARM_15, scheduledTime)),
      ).resolves.toBeDefined();

      expect(console.error).toHaveBeenCalledWith(
        'TaskFlow: falha ao processar lembrete.',
        expect.any(Error),
      );
      const [stored] = await new ChromeTaskRepository().list();
      expect(stored?.reminders[0]?.processedFor).toBe(
        new Date(scheduledTime).toISOString(),
      );
    });
  });

  describe('captura pelo menu de contexto', () => {
    it('registra o menu em install e em update sem duplicar itens', async () => {
      const removeAll = vi.mocked(fakeBrowser.contextMenus.removeAll);
      const create = vi.mocked(fakeBrowser.contextMenus.create);

      await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' } as never);
      await flushPromises();
      await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' } as never);
      await flushPromises();

      expect(removeAll).toHaveBeenCalledTimes(2);
      expect(create).toHaveBeenCalledTimes(4);
      expect(removeAll.mock.invocationCallOrder[0]).toBeLessThan(
        create.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
      );
      expect(removeAll.mock.invocationCallOrder[1]).toBeLessThan(
        create.mock.invocationCallOrder[2] ?? Number.POSITIVE_INFINITY,
      );
    });

    it('não recria o menu em runtime.onStartup', async () => {
      await fakeBrowser.runtime.onStartup.trigger();
      await flushPromises();

      expect(fakeBrowser.contextMenus.removeAll).not.toHaveBeenCalled();
      expect(fakeBrowser.contextMenus.create).not.toHaveBeenCalled();
    });

    it('abre o Side Panel de forma síncrona antes de gravar a captura', async () => {
      const open = vi.mocked(fakeBrowser.sidePanel.open);
      const sessionSet = vi.spyOn(fakeBrowser.storage.session, 'set');

      const pending = clickMenuItem(
        { menuItemId: CAPTURE_MENU_ITEM_IDS.page },
        { title: 'Chamado', url: 'https://exemplo.com/chamado', windowId: 4 } as Browser.tabs.Tab,
      );

      expect(open).toHaveBeenCalledWith({ windowId: 4 });
      expect(open.mock.invocationCallOrder[0]).toBeLessThan(
        sessionSet.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
      );

      await pending;
      expect(sessionSet).toHaveBeenCalled();
    });

    it('grava a captura de página mapeada com a janela do acionamento', async () => {
      await clickMenuItem(
        { menuItemId: CAPTURE_MENU_ITEM_IDS.page },
        { title: 'Chamado 4521', url: 'https://portal.exemplo/4521', windowId: 4 } as Browser.tabs.Tab,
      );

      expect(await storedCapture()).toMatchObject({
        version: 1,
        kind: 'page',
        windowId: 4,
        capturedAt: FIXED_NOW.toISOString(),
        draft: { title: 'Chamado 4521', sourceUrl: 'https://portal.exemplo/4521' },
      });
    });

    it('grava a captura de seleção mapeada', async () => {
      await clickMenuItem(
        {
          menuItemId: CAPTURE_MENU_ITEM_IDS.selection,
          selectionText: '  Revisar\n contrato   de locação ',
          pageUrl: 'https://exemplo.com/contrato',
        },
        { url: 'https://exemplo.com/contrato', windowId: 7 } as Browser.tabs.Tab,
      );

      expect(await storedCapture()).toMatchObject({
        kind: 'selection',
        windowId: 7,
        draft: {
          title: 'Revisar contrato de locação',
          sourceUrl: 'https://exemplo.com/contrato',
        },
      });
    });

    it('grava a captura sem abrir o painel quando a aba não é informada', async () => {
      await clickMenuItem({
        menuItemId: CAPTURE_MENU_ITEM_IDS.page,
        pageUrl: 'https://pagina.exemplo',
      });

      expect(fakeBrowser.sidePanel.open).not.toHaveBeenCalled();
      expect(await storedCapture()).toMatchObject({
        kind: 'page',
        draft: { title: '', sourceUrl: 'https://pagina.exemplo' },
      });
      expect(await storedCapture()).not.toHaveProperty('windowId');
    });

    it('mantém a captura e registra falha sem dados capturados quando o painel não abre', async () => {
      vi.mocked(fakeBrowser.sidePanel.open).mockRejectedValueOnce(new Error('negado'));

      await clickMenuItem(
        {
          menuItemId: CAPTURE_MENU_ITEM_IDS.selection,
          selectionText: 'Texto sigiloso',
          pageUrl: 'https://exemplo.com/sigiloso',
        },
        { title: 'Título sigiloso', url: 'https://exemplo.com/sigiloso', windowId: 2 } as Browser.tabs.Tab,
      );

      expect(await storedCapture()).toMatchObject({ kind: 'selection', windowId: 2 });
      expect(console.error).toHaveBeenCalledTimes(1);

      const [message, detail] = vi.mocked(console.error).mock.calls[0] ?? [];
      expect(message).toBe('TaskFlow: falha ao capturar a página.');
      const logged = JSON.stringify([message, detail]);
      expect(logged).not.toContain('sigiloso');
      expect(logged).not.toContain('exemplo.com');
    });

    it('não grava tarefas em storage.local', async () => {
      const localSet = vi.spyOn(fakeBrowser.storage.local, 'set');

      await clickMenuItem(
        { menuItemId: CAPTURE_MENU_ITEM_IDS.page },
        { title: 'Chamado', url: 'https://exemplo.com', windowId: 1 } as Browser.tabs.Tab,
      );

      expect(localSet).not.toHaveBeenCalled();
    });
  });
});
