import { CAPTURE_MENU_ITEM_IDS, type CaptureMenuClick } from '@/application/page-capture';

const DOCUMENT_URL_PATTERNS = ['http://*/*', 'https://*/*'];

/** Recria os itens do TaskFlow no menu de contexto de forma idempotente. */
export async function registerCaptureMenu(): Promise<void> {
  await browser.contextMenus.removeAll();

  browser.contextMenus.create({
    id: CAPTURE_MENU_ITEM_IDS.page,
    title: 'Adicionar página ao TaskFlow',
    contexts: ['page'],
    documentUrlPatterns: DOCUMENT_URL_PATTERNS,
  });

  browser.contextMenus.create({
    id: CAPTURE_MENU_ITEM_IDS.selection,
    title: 'Criar tarefa com o texto selecionado',
    contexts: ['selection'],
    documentUrlPatterns: DOCUMENT_URL_PATTERNS,
  });
}

/** Converte os dados do clique no menu para a entrada neutra da aplicação. */
export function toMenuCaptureClick(
  info: Browser.contextMenus.OnClickData,
  tab?: Browser.tabs.Tab,
): CaptureMenuClick {
  return {
    itemId: String(info.menuItemId),
    ...(info.selectionText !== undefined ? { selectionText: info.selectionText } : {}),
    ...(info.pageUrl !== undefined ? { pageUrl: info.pageUrl } : {}),
    ...(tab
      ? {
          tab: {
            ...(tab.title !== undefined ? { title: tab.title } : {}),
            ...(tab.url !== undefined ? { url: tab.url } : {}),
            ...(tab.windowId !== undefined ? { windowId: tab.windowId } : {}),
          },
        }
      : {}),
  };
}
