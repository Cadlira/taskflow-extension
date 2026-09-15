import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { ChromeActivePageReader } from '@/infrastructure/chrome/chrome-active-page-reader';

describe('ChromeActivePageReader', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('consulta a aba ativa da janela atual e devolve título e URL', async () => {
    const query = vi.spyOn(fakeBrowser.tabs, 'query');
    query.mockImplementation(
      (async () => [
        {
          id: 1,
          title: 'Chamado 4521',
          url: 'https://portal.exemplo/4521',
          windowId: 2,
        } as Browser.tabs.Tab,
      ]) as never,
    );

    await expect(new ChromeActivePageReader().read()).resolves.toEqual({
      title: 'Chamado 4521',
      url: 'https://portal.exemplo/4521',
    });
    expect(query).toHaveBeenCalledWith({ active: true, currentWindow: true });
  });

  it('omite título e URL ausentes na aba', async () => {
    const query = vi.spyOn(fakeBrowser.tabs, 'query');
    query.mockImplementation((async () => [{ id: 1 } as Browser.tabs.Tab]) as never);

    await expect(new ChromeActivePageReader().read()).resolves.toEqual({});
  });

  it('propaga a rejeição da consulta', async () => {
    vi.spyOn(fakeBrowser.tabs, 'query').mockRejectedValue(new Error('sem acesso'));

    await expect(new ChromeActivePageReader().read()).rejects.toThrow('sem acesso');
  });
});
