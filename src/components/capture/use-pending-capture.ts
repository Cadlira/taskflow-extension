import { onMounted, onUnmounted, ref, type Ref } from 'vue';
import type { PendingCaptureInbox } from '@/application/page-capture';
import type { PendingCapture } from '@/domain/page-capture';

export interface PendingCaptureController {
  heldCapture: Ref<PendingCapture | null>;
  review(): PendingCapture | null;
  discard(): void;
}

function acceptsWindow(capture: PendingCapture, windowId: number | undefined): boolean {
  return capture.windowId === undefined || capture.windowId === windowId;
}

/** Mantém a captura destinada ao Side Panel desta janela até ser revisada ou descartada. */
export function usePendingCapture(inbox: PendingCaptureInbox | null): PendingCaptureController {
  const heldCapture = ref<PendingCapture | null>(null);
  let unsubscribe: (() => void) | undefined;
  let disposed = false;

  onMounted(async () => {
    if (!inbox) return;

    const currentWindow = await browser.windows.getCurrent();
    const windowId = currentWindow?.id;

    if (disposed) return;

    // Consumir sempre por `take` remove a chave ao apresentar e filtra pela janela.
    const consume = async (): Promise<void> => {
      const pending = await inbox.take(windowId);
      if (!disposed && pending && acceptsWindow(pending, windowId)) heldCapture.value = pending;
    };

    unsubscribe = inbox.subscribe(() => {
      void consume();
    });

    await consume();
  });

  onUnmounted(() => {
    disposed = true;
    unsubscribe?.();
  });

  function review(): PendingCapture | null {
    const capture = heldCapture.value;
    heldCapture.value = null;
    return capture;
  }

  function discard(): void {
    heldCapture.value = null;
  }

  return { heldCapture, review, discard };
}
