import type { Task } from './task';

/** Tarefa excluída guardada na lixeira com o instante da exclusão. */
export interface TrashItem {
  /** Instante ISO 8601 UTC da exclusão. */
  deletedAt: string;
  task: Task;
}

export const TRASH_RETENTION_DAYS = 30;
export const TRASH_MAX_ITEMS = 100;

const DAY_MS = 24 * 60 * 60 * 1000;

function deletedAtMs(item: TrashItem): number {
  return Date.parse(item.deletedAt);
}

/** Ordem de exibição: do mais recentemente excluído para o mais antigo. */
export function sortTrashForDisplay(items: readonly TrashItem[]): TrashItem[] {
  return [...items].sort((a, b) => deletedAtMs(b) - deletedAtMs(a));
}

/**
 * Descarta os itens excluídos antes de `now - 30 dias`. Itens com `deletedAt` no futuro, por
 * ajuste de relógio, são mantidos. Retorna a mesma instância quando nada venceu.
 */
export function pruneTrash(items: TrashItem[], now: Date): TrashItem[] {
  const limit = now.getTime() - TRASH_RETENTION_DAYS * DAY_MS;
  const kept = items.filter((item) => deletedAtMs(item) >= limit);

  return kept.length === items.length ? items : kept;
}

/**
 * Aplica a retenção, insere a tarefa excluída em `now` e descarta os itens de exclusão mais antiga
 * até respeitar o limite. Um item anterior com o mesmo identificador é substituído, para que cada
 * tarefa ocupe no máximo uma posição da lixeira.
 */
export function addToTrash(items: TrashItem[], task: Task, now: Date): TrashItem[] {
  const remaining = pruneTrash(items, now).filter((item) => item.task.id !== task.id);

  return sortTrashForDisplay([{ deletedAt: now.toISOString(), task }, ...remaining]).slice(
    0,
    TRASH_MAX_ITEMS,
  );
}
