import {
  buildPageCaptureDraft,
  buildSelectionCaptureDraft,
  normalizeCaptureText,
  type CapturedDraft,
  type PendingCapture,
} from '@/domain/page-capture';
import type { Clock, IdGenerator } from '@/domain/task';
import { isHttpUrl } from '@/domain/task-draft';

/** Leitura do título e da URL da aba ativa; deve rejeitar quando não for possível ler. */
export interface ActivePageReader {
  read(): Promise<{ title?: string; url?: string }>;
}

export type ActivePageCaptureResult =
  | { status: 'captured'; draft: CapturedDraft }
  | { status: 'unsupported' }
  | { status: 'unavailable' };

/** Converte a leitura da aba em um rascunho, sem persistir nada. */
export async function captureActivePage(
  reader: ActivePageReader,
): Promise<ActivePageCaptureResult> {
  let page: { title?: string; url?: string };

  try {
    page = await reader.read();
  } catch {
    return { status: 'unavailable' };
  }

  if (page.title === undefined) return { status: 'unavailable' };
  if (!page.url) return { status: 'unavailable' };
  if (!isHttpUrl(page.url)) return { status: 'unsupported' };

  return {
    status: 'captured',
    draft: buildPageCaptureDraft({ title: page.title, url: page.url }),
  };
}

/** Inbox de no máximo uma captura pendente, entregue ao Side Panel e descartada ao apresentar. */
export interface PendingCaptureInbox {
  save(capture: PendingCapture): Promise<void>;
  take(windowId: number | undefined): Promise<PendingCapture | null>;
  subscribe(listener: (capture: PendingCapture) => void): () => void;
}

export const CAPTURE_MENU_ITEM_IDS = {
  page: 'taskflow:capture:page',
  selection: 'taskflow:capture:selection',
} as const;

/** Dados da aba informada pelo clique no menu de contexto. */
export interface CaptureMenuTab {
  title?: string | undefined;
  url?: string | undefined;
  windowId?: number | undefined;
}

/** Entrada neutra do clique no menu de contexto, montada pelo adapter Chrome. */
export interface CaptureMenuClick {
  itemId: string;
  selectionText?: string | undefined;
  pageUrl?: string | undefined;
  tab?: CaptureMenuTab | undefined;
}

export interface CaptureMenuContext {
  clock: Clock;
  generateId: IdGenerator;
}

/**
 * Monta a captura pendente a partir do item de menu acionado. Uma seleção vazia é tratada como
 * captura de página; um identificador de item desconhecido não produz captura.
 */
export function buildMenuCapture(
  click: CaptureMenuClick,
  context: CaptureMenuContext,
): PendingCapture | null {
  const kind =
    click.itemId === CAPTURE_MENU_ITEM_IDS.page
      ? 'page'
      : click.itemId === CAPTURE_MENU_ITEM_IDS.selection
        ? 'selection'
        : null;

  if (!kind) return null;

  const tab = click.tab;
  const pageUrl = tab?.url ?? click.pageUrl;
  const selectionText = click.selectionText ?? '';
  const capturedAsPage = kind === 'page' || normalizeCaptureText(selectionText).length === 0;

  const draft = capturedAsPage
    ? buildPageCaptureDraft({ title: tab?.title ?? '', url: pageUrl })
    : buildSelectionCaptureDraft({ selectionText, pageUrl });

  return {
    version: 1,
    id: context.generateId(),
    kind: capturedAsPage ? 'page' : 'selection',
    ...(tab?.windowId !== undefined ? { windowId: tab.windowId } : {}),
    capturedAt: context.clock().toISOString(),
    draft,
  };
}
