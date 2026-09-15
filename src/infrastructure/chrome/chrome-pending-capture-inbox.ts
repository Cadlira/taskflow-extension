import type { PendingCaptureInbox } from '@/application/page-capture';
import {
  isPendingCaptureValid,
  type CapturedDraft,
  type PendingCapture,
} from '@/domain/page-capture';
import { TASK_LIMITS, isHttpUrl } from '@/domain/task-draft';

export const PENDING_CAPTURE_STORAGE_KEY = 'taskflow.pendingCapture';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function decodeDraft(value: unknown): CapturedDraft | null {
  if (!isRecord(value)) return null;
  if (typeof value.title !== 'string') return null;
  if (value.title.length > TASK_LIMITS.title) return null;

  if (value.description !== undefined) {
    if (typeof value.description !== 'string') return null;
    if (value.description.length > TASK_LIMITS.description) return null;
  }

  if (value.sourceUrl !== undefined) {
    if (typeof value.sourceUrl !== 'string') return null;
    if (!isHttpUrl(value.sourceUrl)) return null;
  }

  return {
    title: value.title,
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    ...(typeof value.sourceUrl === 'string' ? { sourceUrl: value.sourceUrl } : {}),
  };
}

/** Valida forma e limites da captura lida de `storage.session`; qualquer desvio devolve null. */
export function decodePendingCapture(value: unknown): PendingCapture | null {
  if (!isRecord(value)) return null;
  if (value.version !== 1) return null;
  if (typeof value.id !== 'string' || value.id.length === 0) return null;
  if (value.kind !== 'page' && value.kind !== 'selection') return null;
  if (value.windowId !== undefined && !Number.isInteger(value.windowId)) return null;
  if (typeof value.capturedAt !== 'string' || Number.isNaN(Date.parse(value.capturedAt))) {
    return null;
  }

  const draft = decodeDraft(value.draft);
  if (!draft) return null;

  return {
    version: 1,
    id: value.id,
    kind: value.kind,
    ...(typeof value.windowId === 'number' ? { windowId: value.windowId } : {}),
    capturedAt: value.capturedAt,
    draft,
  };
}

/** Inbox de captura única sobre `storage.session`, descartada ao apresentar ou expirar. */
export class ChromePendingCaptureInbox implements PendingCaptureInbox {
  async save(capture: PendingCapture): Promise<void> {
    await browser.storage.session.set({ [PENDING_CAPTURE_STORAGE_KEY]: capture });
  }

  async take(windowId: number | undefined): Promise<PendingCapture | null> {
    const stored = (await browser.storage.session.get(PENDING_CAPTURE_STORAGE_KEY))[
      PENDING_CAPTURE_STORAGE_KEY
    ];
    const capture = decodePendingCapture(stored);

    if (!capture || !isPendingCaptureValid(capture, new Date())) {
      await browser.storage.session.remove(PENDING_CAPTURE_STORAGE_KEY);
      return null;
    }

    const destinedToWindow = capture.windowId === undefined || capture.windowId === windowId;

    if (!destinedToWindow) return null;

    await browser.storage.session.remove(PENDING_CAPTURE_STORAGE_KEY);
    return capture;
  }

  subscribe(listener: (capture: PendingCapture) => void): () => void {
    const handler = (changes: Record<string, Browser.storage.StorageChange>): void => {
      if (!(PENDING_CAPTURE_STORAGE_KEY in changes)) return;

      const capture = decodePendingCapture(changes[PENDING_CAPTURE_STORAGE_KEY]?.newValue);

      if (capture && isPendingCaptureValid(capture, new Date())) {
        listener(capture);
      }
    };

    browser.storage.session.onChanged.addListener(handler);

    return () => browser.storage.session.onChanged.removeListener(handler);
  }
}
