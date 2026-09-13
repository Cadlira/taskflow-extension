import type { TaskManagerNavigator } from '@/application/open-task-manager';

export class ChromeSidePanelNavigator implements TaskManagerNavigator {
  async open(): Promise<void> {
    const currentWindow = await browser.windows.getCurrent();

    if (currentWindow.id === undefined) {
      throw new Error('Não foi possível identificar a janela atual do Chrome.');
    }

    await browser.sidePanel.open({ windowId: currentWindow.id });
  }
}
