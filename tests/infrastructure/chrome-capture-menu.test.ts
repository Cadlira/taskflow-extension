import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CAPTURE_MENU_ITEM_IDS } from '@/application/page-capture';
import {
  registerCaptureMenu,
  toMenuCaptureClick,
} from '@/infrastructure/chrome/chrome-capture-menu';
import { openSidePanelInWindow } from '@/infrastructure/chrome/chrome-side-panel-window';

describe('registerCaptureMenu', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('remove os itens anteriores antes de recriar os dois itens do TaskFlow', async () => {
    const removeAll = vi.spyOn(fakeBrowser.contextMenus, 'removeAll').mockResolvedValue();
    const create = vi
      .spyOn(fakeBrowser.contextMenus, 'create')
      .mockImplementation(() => CAPTURE_MENU_ITEM_IDS.page);

    await registerCaptureMenu();

    expect(removeAll).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, {
      id: CAPTURE_MENU_ITEM_IDS.page,
      title: 'Adicionar página ao TaskFlow',
      contexts: ['page'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
    expect(create).toHaveBeenNthCalledWith(2, {
      id: CAPTURE_MENU_ITEM_IDS.selection,
      title: 'Criar tarefa com o texto selecionado',
      contexts: ['selection'],
      documentUrlPatterns: ['http://*/*', 'https://*/*'],
    });
    expect(removeAll.mock.invocationCallOrder[0]).toBeLessThan(
      create.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });
});

describe('toMenuCaptureClick', () => {
  it('converte os dados do clique com a aba informada', () => {
    expect(
      toMenuCaptureClick(
        {
          menuItemId: CAPTURE_MENU_ITEM_IDS.selection,
          selectionText: 'Texto selecionado',
          pageUrl: 'https://exemplo.com/pagina',
          editable: false,
        },
        { id: 1, title: 'Página', url: 'https://exemplo.com/pagina', windowId: 4 } as Browser.tabs.Tab,
      ),
    ).toEqual({
      itemId: CAPTURE_MENU_ITEM_IDS.selection,
      selectionText: 'Texto selecionado',
      pageUrl: 'https://exemplo.com/pagina',
      tab: { title: 'Página', url: 'https://exemplo.com/pagina', windowId: 4 },
    });
  });

  it('converte o clique sem aba e sem seleção', () => {
    expect(
      toMenuCaptureClick({
        menuItemId: CAPTURE_MENU_ITEM_IDS.page,
        pageUrl: 'https://exemplo.com',
        editable: false,
      }),
    ).toEqual({
      itemId: CAPTURE_MENU_ITEM_IDS.page,
      pageUrl: 'https://exemplo.com',
    });
  });

  it('normaliza identificador numérico de item para texto', () => {
    expect(toMenuCaptureClick({ menuItemId: 42, editable: false }).itemId).toBe('42');
  });
});

describe('openSidePanelInWindow', () => {
  it('abre o Side Panel com a janela informada', async () => {
    const open = vi.spyOn(fakeBrowser.sidePanel, 'open').mockResolvedValue();

    await openSidePanelInWindow(7);

    expect(open).toHaveBeenCalledWith({ windowId: 7 });
  });
});
