import { TaskStorageError } from '@/application/task-repository';
import { isTaskPriority, isTaskStatus, type Task, type TaskReminder } from '@/domain/task';
import { isRecurrence, type Recurrence } from '@/domain/task-recurrence';
import { isReminderCollectionValid } from '@/domain/task-reminders';
import { MAX_SUBTASKS, type Subtask } from '@/domain/task-subtasks';

export const TASKS_STORAGE_KEY = 'taskflow.tasks';
export const CURRENT_SCHEMA_VERSION = 4;

const LEGACY_SCHEMA_VERSION = 1;
const REMINDER_TYPES_SCHEMA_VERSION = 2;
const RECURRENCE_SCHEMA_VERSION = 3;
const MINUTE_MS = 60_000;

/** Formato persistido da coleção. Novas versões devem ser migradas a partir de `schemaVersion`. */
export interface StoredTaskCollection {
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  tasks: Task[];
}

export type UnknownRecord = Record<string, unknown>;

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

function optionalNonEmptyString(record: UnknownRecord, key: string): string | undefined {
  const value = optionalString(record, key);

  if (value === '') {
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

function decodeReminderV2(value: unknown): TaskReminder {
  if (!isRecord(value)) {
    throw new IncompatibleRecordError('reminders');
  }

  const id = requireString(value, 'id');
  const processedFor = optionalInstant(value, 'processedFor');
  const identity = processedFor === undefined ? { id } : { id, processedFor };

  if (value.type === 'OFFSET') {
    const offsetMinutes = value.offsetMinutes;
    if (
      typeof offsetMinutes !== 'number' ||
      !Number.isSafeInteger(offsetMinutes) ||
      offsetMinutes < 0
    ) {
      throw new IncompatibleRecordError('offsetMinutes');
    }

    return { ...identity, type: 'OFFSET', offsetMinutes };
  }

  if (value.type === 'AT') {
    return { ...identity, type: 'AT', at: requireInstant(value, 'at') };
  }

  throw new IncompatibleRecordError('type');
}

/**
 * Migra um lembrete da versão 1. Qualquer inteiro não negativo aceito pelo decoder anterior é
 * preservado; `lastTriggeredFor` é convertido no instante efetivo já processado.
 */
function migrateReminderV1(value: unknown): TaskReminder {
  if (!isRecord(value)) {
    throw new IncompatibleRecordError('reminders');
  }

  const offsetMinutes = value.offsetMinutes;
  if (typeof offsetMinutes !== 'number' || !Number.isInteger(offsetMinutes) || offsetMinutes < 0) {
    throw new IncompatibleRecordError('offsetMinutes');
  }

  const id = requireString(value, 'id');
  const lastTriggeredFor = optionalInstant(value, 'lastTriggeredFor');

  if (lastTriggeredFor === undefined) {
    return { id, type: 'OFFSET', offsetMinutes };
  }

  const processedFor = new Date(Date.parse(lastTriggeredFor) - offsetMinutes * MINUTE_MS).toISOString();
  return { id, type: 'OFFSET', offsetMinutes, processedFor };
}

type ReminderDecoder = (value: unknown) => TaskReminder;

type TaskDecoder = (value: unknown) => Task;

/** Campos introduzidos por versões posteriores à 2; ausentes nas versões que não os conheciam. */
interface TaskDecodingFeatures {
  recurrence: boolean;
  subtasks: boolean;
}

function decodeSubtask(value: unknown): Subtask {
  if (!isRecord(value) || typeof value.done !== 'boolean') {
    throw new IncompatibleRecordError('subtasks');
  }

  return { id: requireString(value, 'id'), title: requireString(value, 'title'), done: value.done };
}

function decodeSubtasks(record: UnknownRecord): Subtask[] {
  if (!Array.isArray(record.subtasks)) {
    throw new IncompatibleRecordError('subtasks');
  }

  return record.subtasks.map(decodeSubtask);
}

function decodeRecurrence(value: unknown): Recurrence {
  if (!isRecurrence(value)) {
    throw new IncompatibleRecordError('recurrence');
  }

  return value;
}

function decodeTask(
  value: unknown,
  decodeReminder: ReminderDecoder,
  features: TaskDecodingFeatures,
): Task {
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
    seriesId: features.recurrence ? optionalNonEmptyString(value, 'seriesId') : undefined,
    recurrence:
      features.recurrence && value.recurrence !== undefined
        ? decodeRecurrence(value.recurrence)
        : undefined,
  };

  const task: Task = {
    id: requireString(value, 'id'),
    title: requireString(value, 'title'),
    status,
    priority,
    reminders: optionalArray(value, 'reminders').map(decodeReminder),
    subtasks: features.subtasks ? decodeSubtasks(value) : [],
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

/** Erro de dados incompatíveis compartilhado pelos codecs das chaves do TaskFlow. */
export function incompatibleStoredData(cause?: unknown): TaskStorageError {
  return new TaskStorageError(
    'INCOMPATIBLE_DATA',
    'Os dados salvos estão em um formato incompatível. Nada foi alterado para preservá-los.',
    { cause },
  );
}

/** Uma regra persistida exige prazo, identificador de série e nenhum lembrete de instante fixo. */
function isRecurrenceInvariantSatisfied(task: Task): boolean {
  if (task.recurrence === undefined) {
    return true;
  }

  return (
    task.dueAt !== undefined &&
    task.seriesId !== undefined &&
    task.reminders.every((reminder) => reminder.type === 'OFFSET')
  );
}

/** Subtarefas persistidas respeitam o limite de itens e não repetem identificador na tarefa. */
function isSubtaskInvariantSatisfied(task: Task): boolean {
  return (
    task.subtasks.length <= MAX_SUBTASKS &&
    new Set(task.subtasks.map((subtask) => subtask.id)).size === task.subtasks.length
  );
}

function decodeRecords(values: unknown, decode: TaskDecoder): Task[] {
  if (!Array.isArray(values)) {
    throw incompatibleStoredData();
  }

  try {
    const tasks = values.map(decode);
    const seenTaskIds = new Set<string>();

    for (const task of tasks) {
      if (seenTaskIds.has(task.id)) {
        throw new IncompatibleRecordError('id');
      }

      seenTaskIds.add(task.id);

      if (!isReminderCollectionValid(task)) {
        throw new IncompatibleRecordError('reminders');
      }

      if (!isRecurrenceInvariantSatisfied(task)) {
        throw new IncompatibleRecordError('recurrence');
      }

      if (!isSubtaskInvariantSatisfied(task)) {
        throw new IncompatibleRecordError('subtasks');
      }
    }

    return tasks;
  } catch (error) {
    throw incompatibleStoredData(error);
  }
}

function taskDecoderFor(schemaVersion: unknown): TaskDecoder {
  if (schemaVersion === LEGACY_SCHEMA_VERSION) {
    return (task) => decodeTask(task, migrateReminderV1, { recurrence: false, subtasks: false });
  }

  if (schemaVersion === REMINDER_TYPES_SCHEMA_VERSION) {
    return (task) => decodeTask(task, decodeReminderV2, { recurrence: false, subtasks: false });
  }

  if (schemaVersion === RECURRENCE_SCHEMA_VERSION) {
    return (task) => decodeTask(task, decodeReminderV2, { recurrence: true, subtasks: false });
  }

  if (schemaVersion === CURRENT_SCHEMA_VERSION) {
    return (task) => decodeTask(task, decodeReminderV2, { recurrence: true, subtasks: true });
  }

  throw incompatibleStoredData();
}

/**
 * Decodifica registros de tarefa gravados na `schemaVersion` informada, com as mesmas migrações e
 * invariantes da coleção, inclusive identificadores únicos. Qualquer problema gera
 * `INCOMPATIBLE_DATA`. Compartilhado por outras chaves que guardam tarefas.
 */
export function decodeStoredTaskRecords(schemaVersion: unknown, values: unknown): Task[] {
  return decodeRecords(values, taskDecoderFor(schemaVersion));
}

/** Envelope `{ schemaVersion, ... }` reconhecido; `undefined` quando a chave não tem dados. */
export function readStoredEnvelope(value: unknown): UnknownRecord | undefined {
  // Remoções chegam sem `newValue` no Chrome e com `null` em algumas implementações.
  if (value === undefined || value === null) {
    return undefined;
  }

  if (!isRecord(value)) {
    throw incompatibleStoredData();
  }

  return value;
}

/**
 * Valida e normaliza o valor lido do armazenamento, migrando coleções das versões 1 a 3. Ausência
 * de dados representa uma coleção vazia; qualquer estrutura desconhecida é rejeitada integralmente
 * para evitar sobrescrita.
 */
export function decodeStoredTaskCollection(value: unknown): Task[] {
  const envelope = readStoredEnvelope(value);

  return envelope === undefined
    ? []
    : decodeStoredTaskRecords(envelope.schemaVersion, envelope.tasks);
}

export function encodeStoredTaskCollection(tasks: Task[]): StoredTaskCollection {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, tasks };
}
