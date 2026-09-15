import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { PendingCapture } from '@/domain/page-capture';
import {
  ChromePendingCaptureInbox,
  PENDING_CAPTURE_STORAGE_KEY,
} from '@/infrastructure/chrome/chrome-pending-capture-inbox';
import { FIXED_NOW } from '../support/task-fixtures';

function capture(overrides: Partial<PendingCapture> = {}): PendingCapture {
  return {
    version: 1,
    id: 'capture-1',
    kind: 'page',
    capturedAt: FIXED_NOW.toISOString(),
    draft: { title: 'Chamado', sourceUrl: 'https://exemplo.com' },
    ...overrides,
  };
}

async function storedCapture(): Promise<unknown> {
  const stored = await fakeBrowser.storage.session.get(PENDING_CAPTURE_STORAGE_KEY);
  return stored[PENDING_CAPTURE_STORAGE_KEY];
}

describe('ChromePendingCaptureInbox', () => {
  const inbox = new ChromePendingCaptureInbox();

  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('save substitui a captura anterior', async () => {
    await inbox.save(capture({ id: 'antiga' }));
    await inbox.save(capture({ id: 'nova', draft: { title: 'Segunda captura' } }));

    expect(await storedCapture()).toMatchObject({
      id: 'nova',
      draft: { title: 'Segunda captura' },
    });
  });

  it('take da mesma janela devolve a captura e remove a chave', async () => {
    await inbox.save(capture({ windowId: 5 }));

    await expect(inbox.take(5)).resolves.toEqual(capture({ windowId: 5 }));
    await expect(storedCapture()).resolves.toBeUndefined();
  });

  it('take consome captura sem windowId em qualquer janela', async () => {
    await inbox.save(capture());

    await expect(inbox.take(9)).resolves.toEqual(capture());
    await expect(storedCapture()).resolves.toBeUndefined();
  });

  it('take de outra janela preserva a chave', async () => {
    await inbox.save(capture({ windowId: 5 }));

    await expect(inbox.take(9)).resolves.toBeNull();
    await expect(storedCapture()).resolves.toEqual(capture({ windowId: 5 }));
  });

  it('take com janela desconhecida preserva captura destinada a outra janela', async () => {
    await inbox.save(capture({ windowId: 5 }));

    await expect(inbox.take(undefined)).resolves.toBeNull();
    await expect(storedCapture()).resolves.toEqual(capture({ windowId: 5 }));
  });

  it('remove a captura expirada e devolve null', async () => {
    const expired = capture({
      capturedAt: new Date(FIXED_NOW.getTime() - 11 * 60 * 1000).toISOString(),
    });
    await fakeBrowser.storage.session.set({ [PENDING_CAPTURE_STORAGE_KEY]: expired });

    await expect(inbox.take(undefined)).resolves.toBeNull();
    await expect(storedCapture()).resolves.toBeUndefined();
  });

  it('remove a captura malformada e devolve null', async () => {
    await fakeBrowser.storage.session.set({
      [PENDING_CAPTURE_STORAGE_KEY]: { version: 2, id: 'malformada', draft: {} },
    });

    await expect(inbox.take(undefined)).resolves.toBeNull();
    await expect(storedCapture()).resolves.toBeUndefined();
  });

  it('subscribe notifica a nova captura e o cancelamento interrompe as notificações', async () => {
    const listener = vi.fn();
    const unsubscribe = inbox.subscribe(listener);

    await inbox.save(capture({ id: 'primeira' }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(capture({ id: 'primeira' }));

    unsubscribe();
    await inbox.save(capture({ id: 'segunda' }));

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('subscribe não notifica captura expirada', async () => {
    const listener = vi.fn();
    inbox.subscribe(listener);

    await inbox.save(
      capture({ capturedAt: new Date(FIXED_NOW.getTime() - 11 * 60 * 1000).toISOString() }),
    );

    expect(listener).not.toHaveBeenCalled();
  });

  it('não escreve nem lê em storage.local', async () => {
    const localSet = vi.spyOn(fakeBrowser.storage.local, 'set');
    const localGet = vi.spyOn(fakeBrowser.storage.local, 'get');

    await inbox.save(capture());
    await inbox.take(undefined);

    expect(localSet).not.toHaveBeenCalled();
    expect(localGet).not.toHaveBeenCalled();
  });
});
