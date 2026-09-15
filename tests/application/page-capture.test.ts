import { describe, expect, it, vi } from 'vitest';
import {
  buildMenuCapture,
  captureActivePage,
  CAPTURE_MENU_ITEM_IDS,
  type ActivePageReader,
} from '@/application/page-capture';
import { FIXED_NOW, sequentialIds } from '../support/task-fixtures';

function readerOf(page: { title?: string; url?: string }): ActivePageReader {
  return { read: vi.fn().mockResolvedValue(page) };
}

describe('captureActivePage', () => {
  it('devolve o rascunho capturado a partir do título e da URL da aba', async () => {
    const result = await captureActivePage(
      readerOf({ title: 'Chamado 4521 – Portal', url: 'https://portal.exemplo/chamado/4521' }),
    );

    expect(result).toEqual({
      status: 'captured',
      draft: {
        title: 'Chamado 4521 – Portal',
        sourceUrl: 'https://portal.exemplo/chamado/4521',
      },
    });
  });

  it('captura página sem título mantendo a URL de origem', async () => {
    const result = await captureActivePage(readerOf({ title: '', url: 'https://exemplo.com' }));

    expect(result).toEqual({
      status: 'captured',
      draft: { title: '', sourceUrl: 'https://exemplo.com' },
    });
  });

  it('devolve unavailable quando a aba não informa título', async () => {
    await expect(captureActivePage(readerOf({ url: 'https://exemplo.com' }))).resolves.toEqual({
      status: 'unavailable',
    });
  });

  it('devolve unsupported para URL que não usa http ou https', async () => {
    const result = await captureActivePage(readerOf({ title: 'Extensões', url: 'chrome://extensions' }));

    expect(result).toEqual({ status: 'unsupported' });
  });

  it('devolve unavailable quando a leitura rejeita', async () => {
    const reader: ActivePageReader = { read: vi.fn().mockRejectedValue(new Error('sem acesso')) };

    await expect(captureActivePage(reader)).resolves.toEqual({ status: 'unavailable' });
  });

  it('devolve unavailable quando a aba não informa URL', async () => {
    await expect(captureActivePage(readerOf({ title: 'Sem URL' }))).resolves.toEqual({
      status: 'unavailable',
    });
  });
});

describe('buildMenuCapture', () => {
  const context = { clock: () => FIXED_NOW, generateId: sequentialIds('capture') };

  it('captura a página com título, URL e janela da aba', () => {
    const capture = buildMenuCapture(
      {
        itemId: CAPTURE_MENU_ITEM_IDS.page,
        tab: { title: 'Chamado 4521', url: 'https://portal.exemplo/4521', windowId: 3 },
      },
      context,
    );

    expect(capture).toEqual({
      version: 1,
      id: 'capture-1',
      kind: 'page',
      windowId: 3,
      capturedAt: FIXED_NOW.toISOString(),
      draft: { title: 'Chamado 4521', sourceUrl: 'https://portal.exemplo/4521' },
    });
  });

  it('captura a seleção com o texto recebido e a URL da página', () => {
    const capture = buildMenuCapture(
      {
        itemId: CAPTURE_MENU_ITEM_IDS.selection,
        selectionText: '  Revisar\n contrato   de locação ',
        pageUrl: 'https://exemplo.com/contrato',
        tab: { url: 'https://exemplo.com/contrato', windowId: 7 },
      },
      context,
    );

    expect(capture).toMatchObject({
      kind: 'selection',
      windowId: 7,
      draft: {
        title: 'Revisar contrato de locação',
        sourceUrl: 'https://exemplo.com/contrato',
      },
    });
  });

  it('usa a URL informada pelo menu e título vazio quando a aba não é informada', () => {
    const capture = buildMenuCapture(
      { itemId: CAPTURE_MENU_ITEM_IDS.page, pageUrl: 'https://pagina.exemplo' },
      context,
    );

    expect(capture).toEqual({
      version: 1,
      id: expect.any(String),
      kind: 'page',
      capturedAt: FIXED_NOW.toISOString(),
      draft: { title: '', sourceUrl: 'https://pagina.exemplo' },
    });
    expect(capture).not.toHaveProperty('windowId');
  });

  it('trata a seleção vazia como captura de página', () => {
    const capture = buildMenuCapture(
      {
        itemId: CAPTURE_MENU_ITEM_IDS.selection,
        selectionText: '   ',
        tab: { title: 'Página inteira', url: 'https://exemplo.com', windowId: 1 },
      },
      context,
    );

    expect(capture?.kind).toBe('page');
    expect(capture?.draft).toEqual({ title: 'Página inteira', sourceUrl: 'https://exemplo.com' });
  });

  it('usa pageUrl como fallback da seleção quando a aba não informa URL', () => {
    const capture = buildMenuCapture(
      {
        itemId: CAPTURE_MENU_ITEM_IDS.selection,
        selectionText: 'Trecho selecionado',
        pageUrl: 'https://pagina.exemplo',
      },
      context,
    );

    expect(capture?.draft).toEqual({
      title: 'Trecho selecionado',
      sourceUrl: 'https://pagina.exemplo',
    });
  });

  it('devolve null para identificador de item desconhecido', () => {
    expect(
      buildMenuCapture({ itemId: 'taskflow:capture:desconhecido', tab: { title: 'X' } }, context),
    ).toBeNull();
  });
});
