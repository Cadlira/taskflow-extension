import { TASK_LIMITS, isHttpUrl } from './task-draft';

/** Rascunho de tarefa montado a partir de uma captura da página ou da seleção. */
export interface CapturedDraft {
  title: string;
  description?: string;
  sourceUrl?: string;
}

/** Dados da aba ativa capturados pelo popup. */
export interface PageCapture {
  title: string;
  url?: string | undefined;
}

/** Dados do texto selecionado capturados pelo menu de contexto. */
export interface SelectionCapture {
  selectionText: string;
  pageUrl?: string | undefined;
}

/** Colapsa qualquer sequência de espaços em branco, inclusive quebras de linha, e remove extremos. */
export function normalizeCaptureText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}

/**
 * Corta em `limit - 1` unidades UTF-16 e acrescenta "…", mantendo o resultado com exatamente
 * `limit` unidades. Se o corte cair entre um par substituto, recua uma unidade para não deixar
 * um substituto órfão.
 */
export function truncateWithEllipsis(text: string, limit: number): string {
  if (text.length <= limit) return text;

  let cut = limit - 1;

  if (cut > 0 && isHighSurrogate(text.charCodeAt(cut - 1)) && isLowSurrogate(text.charCodeAt(cut))) {
    cut -= 1;
  }

  return `${text.slice(0, cut)}…`;
}

/** Mapeia o título da página e sua URL para um rascunho de tarefa. */
export function buildPageCaptureDraft(page: PageCapture): CapturedDraft {
  return {
    title: truncateWithEllipsis(normalizeCaptureText(page.title), TASK_LIMITS.title),
    ...(page.url && isHttpUrl(page.url) ? { sourceUrl: page.url } : {}),
  };
}

/**
 * Mapeia o texto selecionado para um rascunho: a seleção normalizada vira título e, quando não
 * couber, a seleção completa sem espaços nas extremidades vira descrição.
 */
export function buildSelectionCaptureDraft(selection: SelectionCapture): CapturedDraft {
  const normalized = normalizeCaptureText(selection.selectionText);
  const title = truncateWithEllipsis(normalized, TASK_LIMITS.title);
  const description = truncateWithEllipsis(selection.selectionText.trim(), TASK_LIMITS.description);

  return {
    title,
    ...(normalized.length > TASK_LIMITS.title && description ? { description } : {}),
    ...(selection.pageUrl && isHttpUrl(selection.pageUrl)
      ? { sourceUrl: selection.pageUrl }
      : {}),
  };
}

export const PENDING_CAPTURE_TTL_MS = 10 * 60 * 1000;
export const PENDING_CAPTURE_FUTURE_TOLERANCE_MS = 60 * 1000;

/** Captura única mantida em `storage.session` até ser apresentada no Side Panel ou expirar. */
export interface PendingCapture {
  version: 1;
  id: string;
  kind: 'page' | 'selection';
  windowId?: number;
  capturedAt: string;
  draft: CapturedDraft;
}

/** Válida por 10 minutos, tolerando até 1 minuto de relógio adiantado. */
export function isPendingCaptureValid(capture: PendingCapture, now: Date): boolean {
  const capturedAt = Date.parse(capture.capturedAt);

  if (Number.isNaN(capturedAt)) return false;

  const elapsed = now.getTime() - capturedAt;

  return elapsed <= PENDING_CAPTURE_TTL_MS && elapsed >= -PENDING_CAPTURE_FUTURE_TOLERANCE_MS;
}
