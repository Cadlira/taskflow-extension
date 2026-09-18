import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBackupService } from '@/application/backup/backup-service';
import { CAPTURE_MENU_ITEM_IDS } from '@/application/page-capture';
import { createTaskService } from '@/application/task-service';
import { backupServiceKey } from '@/components/backup/backup-service-key';
import { pendingCaptureKey } from '@/components/capture/pending-capture-key';
import TaskManager from '@/components/tasks/TaskManager.vue';
import background from '@/entrypoints/background';
import {
  ChromePendingCaptureInbox,
  PENDING_CAPTURE_STORAGE_KEY,
} from '@/infrastructure/chrome/chrome-pending-capture-inbox';
import { ChromeReminderScheduler } from '@/infrastructure/chrome/chrome-reminder-scheduler';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { taskServiceKey } from '@/stores/task-store';
import { buildTask, FIXED_NOW } from '../support/task-fixtures';

const menuClicks: Array<
  (info: Browser.contextMenus.OnClickData, tab?: Browser.tabs.Tab) => unknown
> = [];

let wrapper: VueWrapper | undefined;

function clickCapture(
  info: Partial<Browser.contextMenus.OnClickData>,
  tab?: Browser.tabs.Tab,
): unknown {
  const listener = menuClicks[0];
  if (!listener) throw new Error('listener de contextMenus.onClicked não registrado');
  return listener({ editable: false, menuItemId: CAPTURE_MENU_ITEM_IDS.page, ...info }, tab);
}

function mountSidePanel(): void {
  const repository = new ChromeTaskRepository();
  const service = createTaskService({
    repository,
    trash: repository,
    scheduler: new ChromeReminderScheduler(),
    clock: () => new Date(),
    generateId: () => crypto.randomUUID(),
  });
  const backupService = createBackupService({
    repository,
    scheduler: new ChromeReminderScheduler(),
    clock: () => new Date(),
    appVersion: '0.1.0',
  });
  const pinia = createPinia();
  setActivePinia(pinia);

  wrapper = mount(TaskManager, {
    attachTo: document.body,
    global: {
      plugins: [pinia],
      provide: {
        [taskServiceKey as symbol]: service,
        [backupServiceKey as symbol]: backupService,
        [pendingCaptureKey as symbol]: new ChromePendingCaptureInbox(),
      },
    },
  });
}

async function storedCapture(): Promise<unknown> {
  const stored = await fakeBrowser.storage.session.get(PENDING_CAPTURE_STORAGE_KEY);
  return stored[PENDING_CAPTURE_STORAGE_KEY];
}

describe('captura pelo menu com armazenamento real (fakeBrowser)', () => {
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
    // `commands.onCommand` não tem implementação no fakeBrowser; a captura não usa o evento.
    vi.spyOn(fakeBrowser.commands.onCommand, 'addListener').mockImplementation(() => undefined);
    background.main();
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('preenche o formulário do Side Panel da mesma janela', async () => {
    const window = await fakeBrowser.windows.create({ focused: true });
    if (!window) throw new Error('janela não criada');

    await clickCapture(
      {
        menuItemId: CAPTURE_MENU_ITEM_IDS.selection,
        selectionText: '  Revisar\n contrato ',
        pageUrl: 'https://exemplo.com/contrato',
      },
      {
        id: 1,
        title: 'Contrato',
        url: 'https://exemplo.com/contrato',
        windowId: window.id,
      } as Browser.tabs.Tab,
    );

    mountSidePanel();
    await flushPromises();

    expect((wrapper!.get('[name="title"]').element as HTMLInputElement).value).toBe(
      'Revisar contrato',
    );
    expect((wrapper!.get('[name="sourceUrl"]').element as HTMLInputElement).value).toBe(
      'https://exemplo.com/contrato',
    );
    expect(wrapper!.text()).toContain('Dados capturados da página. Revise antes de salvar.');
    expect(await storedCapture()).toBeUndefined();
  });

  it('não apresenta a captura em um Side Panel de outra janela', async () => {
    const windowA = await fakeBrowser.windows.create({ focused: true });
    if (!windowA) throw new Error('janela não criada');

    await clickCapture(
      { menuItemId: CAPTURE_MENU_ITEM_IDS.page, pageUrl: 'https://exemplo.com/a' },
      {
        id: 1,
        title: 'Página A',
        url: 'https://exemplo.com/a',
        windowId: windowA.id,
      } as Browser.tabs.Tab,
    );

    const windowB = await fakeBrowser.windows.create({ focused: true });
    if (!windowB) throw new Error('janela não criada');
    expect(windowB.id).not.toBe(windowA.id);

    mountSidePanel();
    await flushPromises();

    expect(wrapper!.find('form').exists()).toBe(false);
    expect(await storedCapture()).toMatchObject({ windowId: windowA.id });
  });

  it('exporta backup com captura pendente contendo somente as tarefas', async () => {
    const window = await fakeBrowser.windows.create({ focused: true });
    if (!window) throw new Error('janela não criada');

    await clickCapture(
      { menuItemId: CAPTURE_MENU_ITEM_IDS.page, pageUrl: 'https://exemplo.com/sigilosa' },
      {
        id: 1,
        title: 'Capturada',
        url: 'https://exemplo.com/sigilosa',
        windowId: window.id,
      } as Browser.tabs.Tab,
    );
    await new ChromeTaskRepository().save(buildTask({ id: 'tarefa-1', title: 'Existente' }));

    const backupService = createBackupService({
      repository: new ChromeTaskRepository(),
      scheduler: new ChromeReminderScheduler(),
      clock: () => FIXED_NOW,
      appVersion: '0.1.0',
    });

    const exported = await backupService.exportBackup();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    expect(exported.content).toContain('Existente');
    expect(exported.content).not.toContain('Capturada');
    expect(exported.content).not.toContain('pendingCapture');
    expect(exported.content).not.toContain('exemplo.com');
  });
});
