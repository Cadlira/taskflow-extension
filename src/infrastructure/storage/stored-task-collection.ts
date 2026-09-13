import { TaskStorageError } from '@/application/task-repository';
import { isTaskPriority, isTaskStatus, type Task, type TaskReminder } from '@/domain/task';

export const TASKS_STORAGE_KEY = 'taskflow.tasks';
export const CURRENT_SCHEMA_VERSION = 1;

/** Formato persistido da coleção. Novas versões devem ser migradas a partir de `schemaVersion`. */
export interface StoredTaskCollection {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  tasks: Task[];
}

type UnknownRecord = Record<string, unknown>;

class IncompatibleRecordError extends Error {}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(record: UnknownRecord, key: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value === '') {
    throw new IncompatibleRecordError(key);
  }
  return value;
}

function requireInstant(record: UnknownRecord, key: string): string {
  const value = requireString(record, key);
  if (Number.isNaN(Date.parse(value))) {
    throw new IncompatibleRecordError(key);
  }
  return value;
}

function optionalString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new IncompatibleRecordError(key);
  }
  return value;
}

function optionalInstant(record: UnknownRecord, key: string): string | undefined {
  return record[key] === undefined ? undefined : requireInstant(record, key);
}

function optionalArray(record: UnknownRecord, key: string): unknown[] {
  const value = record[key];
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new IncompatibleRecordError(key);
  }
  return value;
}

function decodeReminder(value: unknown): TaskReminder {
  if (!isRecord(value)) {
    throw new IncompatibleRecordError('reminders');
  }

  const offsetMinutes = value.offsetMinutes;
  if (typeof offsetMinutes !== 'number' || !Number.isInteger(offsetMinutes) || offsetMinutes < 0) {
    throw new IncompatibleRecordError('offsetMinutes');
  }

  const lastTriggeredFor = optionalInstant(value, 'lastTriggeredFor');
  return {
    id: requireString(value, 'id'),
    offsetMinutes,
    ...(lastTriggeredFor !== undefined && { lastTriggeredFor }),
  };
}

function decodeTask(value: unknown): Task {
  if (!isRecord(value)) {
    throw new IncompatibleRecordError('task');
  }

  const { status, priority } = value;
  if (!isTaskStatus(status) || !isTaskPriority(priority)) {
    throw new IncompatibleRecordError('status');
  }

  const tags = optionalArray(value, 'tags');
  if (!tags.every((tag): tag is string => typeof tag === 'string')) {
    throw new IncompatibleRecordError('tags');
  }

  const optional = {
    description: optionalString(value, 'description'),
    requester: optionalString(value, 'requester'),
    assignee: optionalString(value, 'assignee'),
    dueAt: optionalInstant(value, 'dueAt'),
    sourceUrl: optionalString(value, 'sourceUrl'),
    completedAt: optionalInstant(value, 'completedAt'),
  };

  const task: Task = {
    id: requireString(value, 'id'),
    title: requireString(value, 'title'),
    status,
    priority,
    reminders: optionalArray(value, 'reminders').map(decodeReminder),
    tags,
    createdAt: requireInstant(value, 'createdAt'),
    updatedAt: requireInstant(value, 'updatedAt'),
  };

  for (const [key, field] of Object.entries(optional)) {
    if (field !== undefined) {
      Object.assign(task, { [key]: field });
    }
  }

  return task;
}

function incompatible(cause?: unknown): TaskStorageError {
  return new TaskStorageError(
    'INCOMPATIBLE_DATA',
    'Os dados salvos estão em um formato incompatível. Nada foi alterado para preservá-los.',
    { cause },
  );
}

/**
 * Valida e normaliza o valor lido do armazenamento. Ausência de dados representa uma coleção
 * vazia; qualquer estrutura desconhecida é rejeitada integralmente para evitar sobrescrita.
 */
export function decodeStoredTaskCollection(value: unknown): Task[] {
  // Remoções chegam sem `newValue` no Chrome e com `null` em algumas implementações.
  if (value === undefined || value === null) {
    return [];
  }

  if (!isRecord(value) || value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw incompatible();
  }

  if (!Array.isArray(value.tasks)) {
    throw incompatible();
  }

  try {
    return value.tasks.map(decodeTask);
  } catch (error) {
    throw incompatible(error);
  }
}

export function encodeStoredTaskCollection(tasks: Task[]): StoredTaskCollection {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, tasks };
}
