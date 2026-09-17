import { TaskStorageError } from '@/application/task-repository';
import type { TrashItem } from '@/domain/task-trash';
import {
  CURRENT_SCHEMA_VERSION,
  decodeStoredTaskRecords,
  readStoredEnvelope,
} from './stored-task-collection';

export const TRASH_STORAGE_KEY = 'taskflow.trash';

/**
 * Formato persistido da lixeira. Acompanha `schemaVersion` da coleção de tarefas para que as duas
 * chaves sejam migradas pela mesma cadeia.
 */
export interface StoredTrash {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  items: TrashItem[];
}

function incompatibleTrash(cause?: unknown): TaskStorageError {
  return new TaskStorageError(
    'INCOMPATIBLE_DATA',
    'A lixeira não pôde ser lida porque está em um formato incompatível. Nada foi alterado para preservá-la.',
    { cause },
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function decodeTrashItems(value: unknown): TrashItem[] {
  const envelope = readStoredEnvelope(value);

  if (envelope === undefined) {
    return [];
  }

  const { items } = envelope;

  if (!Array.isArray(items)) {
    throw incompatibleTrash();
  }

  const deletedAts = items.map((item: unknown) => {
    if (
      !isRecord(item) ||
      typeof item.deletedAt !== 'string' ||
      Number.isNaN(Date.parse(item.deletedAt))
    ) {
      throw incompatibleTrash();
    }

    return item.deletedAt;
  });

  const tasks = decodeStoredTaskRecords(
    envelope.schemaVersion,
    items.map((item: Record<string, unknown>) => item.task),
  );

  return tasks.map((task, index) => ({ deletedAt: deletedAts[index]!, task }));
}

/**
 * Valida a lixeira lida do armazenamento. Ausência de dados representa lixeira vazia; envelope
 * desconhecido, `deletedAt` inválido ou tarefa inválida recusam a lixeira inteira.
 */
export function decodeStoredTrash(value: unknown): TrashItem[] {
  try {
    return decodeTrashItems(value);
  } catch (error) {
    throw incompatibleTrash(error);
  }
}

export function encodeStoredTrash(items: TrashItem[]): StoredTrash {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, items };
}
