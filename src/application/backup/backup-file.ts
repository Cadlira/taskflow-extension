import type { Task } from '@/domain/task';
import { validatePersistedTaskCollection, type BackupIssue } from '@/domain/task-integrity';

export const BACKUP_FORMAT = 'taskflow-backup';
export const CURRENT_BACKUP_FORMAT_VERSION = 1;

/** Arquivo em versão intermediária dentro da cadeia de migrações. */
export interface RawBackupFile {
  [key: string]: unknown;
  format?: unknown;
  formatVersion?: unknown;
  exportedAt?: unknown;
  app?: unknown;
  tasks?: unknown;
}

/** Converte a versão `i + 1` do formato na versão `i + 2`. */
export type BackupMigration = (file: RawBackupFile) => RawBackupFile;

/** Lista ordenada de migrações; na versão 1 não há versões anteriores para converter. */
export const BACKUP_MIGRATIONS: readonly BackupMigration[] = [];

/** Conteúdo já validado de um arquivo de backup. */
export interface BackupFile {
  formatVersion: number;
  exportedAt: string;
  appVersion: string;
  tasks: Task[];
}

export type BackupReadFailure =
  | 'INVALID_JSON'
  | 'NOT_TASKFLOW_BACKUP'
  | 'INVALID_FORMAT_VERSION'
  | 'NEWER_FORMAT_VERSION'
  | 'INVALID_STRUCTURE'
  | 'INVALID_TASKS';

export type BackupReadResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; reason: BackupReadFailure; issues?: BackupIssue[] };

export interface EncodeBackupOptions {
  /** Instante ISO 8601 UTC da exportação. */
  exportedAt: string;
  /** Versão da extensão que gerou o arquivo; apenas informativa. */
  appVersion: string;
}

export interface ReadBackupOptions {
  /** Versão de formato suportada pelo leitor; padrão: versão atual. */
  currentVersion?: number;
  /** Migrações disponíveis; padrão: as migrações de produção. */
  migrations?: readonly BackupMigration[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Nome do arquivo em hora local, no padrão `taskflow-backup-AAAA-MM-DD-HHmm.json`. */
export function backupFileName(now: Date): string {
  return `taskflow-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(
    now.getHours(),
  )}${pad(now.getMinutes())}.json`;
}

/** Serializa o arquivo com propriedades explícitas e indentação de 2 espaços. */
export function encodeBackupFile(tasks: Task[], options: EncodeBackupOptions): string {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      formatVersion: CURRENT_BACKUP_FORMAT_VERSION,
      exportedAt: options.exportedAt,
      app: { version: options.appVersion },
      tasks,
    },
    null,
    2,
  );
}

/**
 * Lê o texto de um arquivo de backup, aplica as migrações necessárias e valida integralmente
 * as tarefas. Nenhuma estrutura desconhecida é aceita sem validação do domínio.
 */
export function readBackupFile(text: string, options: ReadBackupOptions = {}): BackupReadResult {
  const currentVersion = options.currentVersion ?? CURRENT_BACKUP_FORMAT_VERSION;
  const migrations = options.migrations ?? BACKUP_MIGRATIONS;

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'INVALID_JSON' };
  }

  if (!isRecord(parsed) || parsed.format !== BACKUP_FORMAT) {
    return { ok: false, reason: 'NOT_TASKFLOW_BACKUP' };
  }

  const version = parsed.formatVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    return { ok: false, reason: 'INVALID_FORMAT_VERSION' };
  }

  if (version > currentVersion) {
    return { ok: false, reason: 'NEWER_FORMAT_VERSION' };
  }

  let file: RawBackupFile = parsed;
  for (let from = version; from < currentVersion; from += 1) {
    const migration = migrations[from - 1];

    if (!migration) {
      return { ok: false, reason: 'INVALID_FORMAT_VERSION' };
    }

    file = migration(file);
  }

  if (!isCanonicalInstant(file.exportedAt)) {
    return { ok: false, reason: 'INVALID_STRUCTURE' };
  }

  if (!isRecord(file.app) || typeof file.app.version !== 'string' || file.app.version === '') {
    return { ok: false, reason: 'INVALID_STRUCTURE' };
  }

  if (!Array.isArray(file.tasks)) {
    return { ok: false, reason: 'INVALID_STRUCTURE' };
  }

  const validation = validatePersistedTaskCollection(file.tasks);
  if (!validation.ok) {
    return { ok: false, reason: 'INVALID_TASKS', issues: validation.issues };
  }

  return {
    ok: true,
    backup: {
      formatVersion: currentVersion,
      exportedAt: file.exportedAt,
      appVersion: file.app.version,
      tasks: validation.tasks,
    },
  };
}
