import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { defineComponent, h } from 'vue';
import type { PendingCaptureInbox } from '@/application/page-capture';
import { usePendingCapture } from '@/components/capture/use-pending-capture';
import type { PendingCapture } from '@/domain/page-capture';
import { FIXED_NOW } from '../../support/task-fixtures';

class FakeInbox implements PendingCaptureInbox {
  takeResult: PendingCapture | null = null;
  private readonly listeners = new Set<(capture: PendingCapture) => void>();

  async save(): Promise<void> {
    return undefined;
  }

  async take(): Promise<PendingCapture | null> {
    const result = this.takeResult;
    this.takeResult = null;
    return result;
  }

  subscribe(listener: (capture: PendingCapture) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(capture: PendingCapture): void {
    this.takeResult = capture;
    this.listeners.forEach((listener) => listener(capture));
  }

  get listenerCount(): number {
    return this.listeners.size;
  }
}

function capture(overrides: Partial<PendingCapture> = {}): PendingCapture {
  return {
    version: 1,
    id: 'capture-1',
    kind: 'page',
    capturedAt: FIXED_NOW.toISOString(),
    draft: { title: 'Chamado' },
    ...overrides,
  };
}

function mountHost(inbox: PendingCaptureInbox): VueWrapper {
  const Host = defineComponent({
    setup() {
      const { heldCapture, review, discard } = usePendingCapture(inbox);

      return () =>
        h('div', [
          h('span', { 'data-testid': 'held' }, heldCapture.value?.id ?? ''),
          h('button', { 'data-testid': 'review', onClick: () => review() }, 'Revisar'),
          h('button', { 'data-testid': 'discard', onClick: () => discard() }, 'Descartar'),
        ]);
    },
  });

  return mount(Host, { attachTo: document.body });
}

describe('usePendingCapture', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('apresenta a captura existente ao montar', async () => {
    const inbox = new FakeInbox();
    inbox.takeResult = capture({ id: 'existente' });

    const wrapper = mountHost(inbox);
    await flushPromises();

    expect(wrapper.get('[data-testid="held"]').text()).toBe('existente');
    wrapper.unmount();
  });

  it('apresenta a captura recebida por assinatura', async () => {
    const inbox = new FakeInbox();
    const wrapper = mountHost(inbox);
    await flushPromises();
    expect(wrapper.get('[data-testid="held"]').text()).toBe('');

    inbox.emit(capture({ id: 'nova' }));
    await flushPromises();

    expect(wrapper.get('[data-testid="held"]').text()).toBe('nova');
    wrapper.unmount();
  });

  it('substitui a captura anterior pela mais recente', async () => {
    const inbox = new FakeInbox();
    inbox.takeResult = capture({ id: 'primeira' });
    const wrapper = mountHost(inbox);
    await flushPromises();

    inbox.emit(capture({ id: 'segunda' }));
    await flushPromises();

    expect(wrapper.get('[data-testid="held"]').text()).toBe('segunda');
    wrapper.unmount();
  });

  it('review entrega a captura e deixa de mantê-la', async () => {
    const inbox = new FakeInbox();
    inbox.takeResult = capture({ id: 'revisar' });
    const wrapper = mountHost(inbox);
    await flushPromises();

    await wrapper.get('[data-testid="review"]').trigger('click');

    expect(wrapper.get('[data-testid="held"]').text()).toBe('');
    wrapper.unmount();
  });

  it('discard remove a captura mantida sem notificações', async () => {
    const inbox = new FakeInbox();
    inbox.takeResult = capture({ id: 'descartar' });
    const wrapper = mountHost(inbox);
    await flushPromises();

    await wrapper.get('[data-testid="discard"]').trigger('click');
    await flushPromises();

    expect(wrapper.get('[data-testid="held"]').text()).toBe('');
    wrapper.unmount();
  });

  it('cancela a assinatura ao desmontar', async () => {
    const inbox = new FakeInbox();
    const wrapper = mountHost(inbox);
    await flushPromises();
    expect(inbox.listenerCount).toBe(1);

    wrapper.unmount();

    expect(inbox.listenerCount).toBe(0);
  });

  it('não apresenta captura destinada a outra janela', async () => {
    const currentWindow = await fakeBrowser.windows.create({ focused: true });
    if (!currentWindow) throw new Error('janela não criada');
    expect((await fakeBrowser.windows.getCurrent())?.id).toBe(currentWindow.id);
    const inbox = new FakeInbox();
    inbox.takeResult = capture({ id: 'outra', windowId: (currentWindow.id ?? 0) + 1 });
    const wrapper = mountHost(inbox);
    await flushPromises();

    expect(wrapper.get('[data-testid="held"]').text()).toBe('');

    inbox.emit(capture({ id: 'outra-recente', windowId: (currentWindow.id ?? 0) + 1 }));
    await flushPromises();

    expect(wrapper.get('[data-testid="held"]').text()).toBe('');
    wrapper.unmount();
  });

  it('não apresenta captura com janela quando a própria janela é desconhecida', async () => {
    expect(await fakeBrowser.windows.getCurrent()).toBeUndefined();
    const inbox = new FakeInbox();
    inbox.takeResult = capture({ id: 'outra', windowId: 5 });
    const wrapper = mountHost(inbox);
    await flushPromises();

    expect(wrapper.get('[data-testid="held"]').text()).toBe('');

    inbox.emit(capture({ id: 'outra-recente', windowId: 5 }));
    await flushPromises();

    expect(wrapper.get('[data-testid="held"]').text()).toBe('');
    wrapper.unmount();
  });
});
