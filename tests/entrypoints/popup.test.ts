import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushPromises, mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
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
});
