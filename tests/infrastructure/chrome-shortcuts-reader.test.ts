import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  ChromeShortcutsReader,
  SHORTCUTS_CUSTOMIZATION_URL,
} from '@/infrastructure/chrome/chrome-shortcuts-reader';

function mockCommands(commands: Browser.commands.Command[]) {
  return vi
    .spyOn(fakeBrowser.commands, 'getAll')
    .mockImplementation((async () => commands) as never);
}

describe('ChromeShortcutsReader', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('devolve a combinação em vigor de cada comando', async () => {
    const getAll = mockCommands([
      { name: '_execute_action', shortcut: 'Ctrl+Shift+K' },
      { name: 'open-task-manager', shortcut: 'Ctrl+Shift+L', description: 'Abrir' },
    ]);

    await expect(new ChromeShortcutsReader().read()).resolves.toEqual([
      { action: 'QUICK_ADD', combination: 'Ctrl+Shift+K' },
      { action: 'OPEN_TASK_MANAGER', combination: 'Ctrl+Shift+L' },
    ]);
    expect(getAll).toHaveBeenCalledTimes(1);
  });

  it('devolve a combinação personalizada, não a sugerida no pacote', async () => {
    mockCommands([
      { name: '_execute_action', shortcut: 'Ctrl+Shift+K' },
      { name: 'open-task-manager', shortcut: 'Alt+Shift+9' },
    ]);

    await expect(new ChromeShortcutsReader().read()).resolves.toContainEqual({
      action: 'OPEN_TASK_MANAGER',
      combination: 'Alt+Shift+9',
    });
  });

  it('traduz combinação vazia em ausência de atalho', async () => {
    mockCommands([
      { name: '_execute_action', shortcut: 'Ctrl+Shift+K' },
      { name: 'open-task-manager', shortcut: '' },
    ]);

    await expect(new ChromeShortcutsReader().read()).resolves.toEqual([
      { action: 'QUICK_ADD', combination: 'Ctrl+Shift+K' },
      { action: 'OPEN_TASK_MANAGER' },
    ]);
  });

  it('trata comando ausente na resposta como sem atalho', async () => {
    mockCommands([{ name: '_execute_action', shortcut: 'Ctrl+Shift+K' }]);

    await expect(new ChromeShortcutsReader().read()).resolves.toEqual([
      { action: 'QUICK_ADD', combination: 'Ctrl+Shift+K' },
      { action: 'OPEN_TASK_MANAGER' },
    ]);
  });

  it('propaga a rejeição da consulta ao navegador', async () => {
    vi.spyOn(fakeBrowser.commands, 'getAll').mockRejectedValue(new Error('indisponível'));

    await expect(new ChromeShortcutsReader().read()).rejects.toThrow('indisponível');
  });

  it('abre a tela de atalhos do navegador em uma nova aba', async () => {
    const create = vi.spyOn(fakeBrowser.tabs, 'create');
    create.mockImplementation((async () => ({ id: 1 }) as Browser.tabs.Tab) as never);

    await new ChromeShortcutsReader().openCustomization();

    expect(create).toHaveBeenCalledWith({ url: SHORTCUTS_CUSTOMIZATION_URL });
    expect(SHORTCUTS_CUSTOMIZATION_URL).toBe('chrome://extensions/shortcuts');
  });
});
