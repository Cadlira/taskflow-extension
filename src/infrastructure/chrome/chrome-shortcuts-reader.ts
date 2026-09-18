import type {
  ActionShortcut,
  KeyboardShortcutsReader,
  ShortcutAction,
} from '@/application/keyboard-shortcuts';

/** Página de atalhos do navegador; inalcançável por link a partir de uma página de extensão. */
export const SHORTCUTS_CUSTOMIZATION_URL = 'chrome://extensions/shortcuts';

/** Nome do comando no Manifest para cada ação; `_execute_action` é o comando reservado. */
const COMMAND_NAMES: Record<ShortcutAction, string> = {
  QUICK_ADD: '_execute_action',
  OPEN_TASK_MANAGER: 'open-task-manager',
};

/**
 * Lê os atalhos em vigor de `commands.getAll()`. Combinação vazia ou comando ausente
 * viram "sem atalho"; a combinação sugerida no pacote nunca é usada como substituta.
 */
export class ChromeShortcutsReader implements KeyboardShortcutsReader {
  async read(): Promise<ActionShortcut[]> {
    const commands = await browser.commands.getAll();

    return (Object.entries(COMMAND_NAMES) as [ShortcutAction, string][]).map(
      ([action, name]): ActionShortcut => {
        const combination = commands.find((command) => command.name === name)?.shortcut;

        return combination === undefined || combination === ''
          ? { action }
          : { action, combination };
      },
    );
  }

  async openCustomization(): Promise<void> {
    // `tabs.create` não exige a permissão `tabs`: ela só libera propriedades sensíveis.
    await browser.tabs.create({ url: SHORTCUTS_CUSTOMIZATION_URL });
  }
}
