import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import PopupApp from '@/entrypoints/popup/App.vue';
import { createTaskTestContext } from '../support/task-app';

const root = join(__dirname, '..', '..');

function sourceOf(...segments: string[]): string {
  return readFileSync(join(root, ...segments), 'utf8');
}

describe('popup', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('não oferece exportação nem restauração de backup', async () => {
    const context = createTaskTestContext();
    const wrapper = mount(PopupApp, { global: context.global, attachTo: document.body });
    await flushPromises();

    const text = wrapper.text().toLowerCase();
    expect(text).not.toContain('backup');
    expect(text).not.toContain('restaurar');
    expect(text).not.toContain('exportar');
    wrapper.unmount();
  });

  it('não fornece o serviço de backup no entrypoint do popup', () => {
    const popupMain = sourceOf('src', 'entrypoints', 'popup', 'main.ts');
    expect(popupMain).not.toContain('backupServiceKey');
    expect(popupMain).not.toContain('createChromeBackupService');

    const sidepanelMain = sourceOf('src', 'entrypoints', 'sidepanel', 'main.ts');
    expect(sidepanelMain).toContain('backupServiceKey');
    expect(sidepanelMain).toContain('createChromeBackupService');
  });

  it('não lê a aba ativa nem a captura pendente ao abrir o popup', async () => {
    const tabsQuery = vi.spyOn(fakeBrowser.tabs, 'query');
    const sessionGet = vi.spyOn(fakeBrowser.storage.session, 'get');
    const context = createTaskTestContext();
    const wrapper = mount(PopupApp, { global: context.global, attachTo: document.body });
    await flushPromises();

    expect(tabsQuery).not.toHaveBeenCalled();
    expect(sessionGet).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('não referencia storage.session nem o inbox de capturas no entrypoint do popup', () => {
    for (const file of ['main.ts', 'App.vue']) {
      const content = sourceOf('src', 'entrypoints', 'popup', file);
      expect(content, file).not.toContain('storage.session');
      expect(content, file).not.toContain('PendingCaptureInbox');
      expect(content, file).not.toContain('pending-capture');
      expect(content, file).not.toContain('pendingCapture');
    }
  });
});
