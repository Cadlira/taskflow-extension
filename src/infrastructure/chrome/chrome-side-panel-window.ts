/** Abre o Side Panel preso a uma janela, sem consultar a janela atual antes do gesto. */
export function openSidePanelInWindow(windowId: number): Promise<void> {
  return browser.sidePanel.open({ windowId });
}
