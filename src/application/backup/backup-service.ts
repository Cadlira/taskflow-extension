import type { Clock, Task, TaskReminder } from '@/domain/task';
import { planReminders, settleElapsedReminders } from '@/domain/task-reminders';
import type { ReminderScheduler } from '../reminder-scheduler';
import { TaskStorageError, type TaskRepository } from '../task-repository';
import type { BackupIssue } from '@/domain/task-integrity';
import {
  backupFileName,
  encodeBackupFile,
  readBackupFile,
  type BackupReadFailure,
} from './backup-file';

/** Limite de leitura do arquivo escolhido pelo usuário: 20 MiB. */
export const BACKUP_MAX_BYTES = 20 * 1024 * 1024;

/** Quantidade de erros de validação apresentados antes do resumo dos restantes. */
export const BACKUP_ISSUES_PREVIEW = 5;

/** Mesma forma de `File` necessária ao caso de uso; permite testes sem DOM. */
export interface BackupSource {
  size: number;
  text(): Promise<string>;
}

/** Valor imutável mantido pela interface entre a leitura do arquivo e a confirmação. */
export interface PreparedRestore {
  tasks: Task[];
  exportedAt: string;
  formatVersion: number;
  appVersion: string;
  fileTaskCount: number;
  localTaskCount: number;
}

export type BackupFailureReason =
  | BackupReadFailure
  | 'FILE_TOO_LARGE'
  | 'LOCAL_DATA_INCOMPATIBLE'
  | 'STORAGE_UNAVAILABLE';

type StorageFailureReason = Extract<
  BackupFailureReason,
  'LOCAL_DATA_INCOMPATIBLE' | 'STORAGE_UNAVAILABLE'
>;

export type ExportBackupResult =
  | { ok: true; fileName: string; content: string; taskCount: number }
  | { ok: false; reason: StorageFailureReason };

export type PrepareRestoreResult =
  | { ok: true; prepared: PreparedRestore }
  | { ok: false; reason: BackupFailureReason; issues?: BackupIssue[]; extraIssueCount?: number };

export type RestoreResult =
  | { ok: true; restoredCount: number; remindersPending: boolean; verified: boolean }
  | { ok: false; reason: StorageFailureReason };

export interface BackupServiceDependencies {
  repository: TaskRepository;
  scheduler: ReminderScheduler;
  clock: Clock;
  /** Versão da extensão, apenas informativa no arquivo. */
  appVersion: string;
}

function storageFailureReason(error: unknown): StorageFailureReason {
  return error instanceof TaskStorageError && error.reason === 'INCOMPATIBLE_DATA'
    ? 'LOCAL_DATA_INCOMPATIBLE'
    : 'STORAGE_UNAVAILABLE';
}

function sameReminder(left: TaskReminder, right: TaskReminder): boolean {
  return (
    left.id === right.id &&
    left.offsetMinutes === right.offsetMinutes &&
    left.lastTriggeredFor === right.lastTriggeredFor
  );
}

function sameReminders(left: readonly TaskReminder[], right: readonly TaskReminder[]): boolean {
  return (
    left.length === right.length &&
    left.every((reminder, index) => {
      const other = right[index];
      return other !== undefined && sameReminder(reminder, other);
    })
  );
}

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
}

function sameTask(left: Task, right: Task): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.description === right.description &&
    left.requester === right.requester &&
    left.assignee === right.assignee &&
    left.status === right.status &&
    left.priority === right.priority &&
    left.dueAt === right.dueAt &&
    left.sourceUrl === right.sourceUrl &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.completedAt === right.completedAt &&
    sameTags(left.tags, right.tags) &&
    sameReminders(left.reminders, right.reminders)
  );
}

function sameTaskList(left: readonly Task[], right: readonly Task[]): boolean {
  return (
    left.length === right.length &&
    left.every((task, index) => {
      const other = right[index];
      return other !== undefined && sameTask(task, other);
    })
  );
}

/**
 * Casos de uso de backup: exportar a coleção para um arquivo versionado, preparar a
 * restauração com validação integral e restaurar substituindo tudo em uma única gravação.
 */
export function createBackupService({
  repository,
  scheduler,
  clock,
  appVersion,
}: BackupServiceDependencies) {
  async function exportBackup(): Promise<ExportBackupResult> {
    let tasks: Task[];

    try {
      tasks = await repository.list();
    } catch (error) {
      return { ok: false, reason: storageFailureReason(error) };
    }

    const now = clock();

    return {
      ok: true,
      fileName: backupFileName(now),
      content: encodeBackupFile(tasks, { exportedAt: now.toISOString(), appVersion }),
      taskCount: tasks.length,
    };
  }

  async function prepareRestore(file: BackupSource): Promise<PrepareRestoreResult> {
    if (file.size > BACKUP_MAX_BYTES) {
      return { ok: false, reason: 'FILE_TOO_LARGE' };
    }

    let localTasks: Task[];

    try {
      localTasks = await repository.list();
    } catch (error) {
      return { ok: false, reason: storageFailureReason(error) };
    }

    let text: string;

    try {
      text = await file.text();
    } catch {
      return { ok: false, reason: 'INVALID_JSON' };
    }

    const read = readBackupFile(text);
    if (!read.ok) {
      if (read.issues === undefined) {
        return { ok: false, reason: read.reason };
      }

      const issues = read.issues.slice(0, BACKUP_ISSUES_PREVIEW);
      const extraIssueCount = read.issues.length - issues.length;

      return {
        ok: false,
        reason: read.reason,
        issues,
        ...(extraIssueCount > 0 && { extraIssueCount }),
      };
    }

    return {
      ok: true,
      prepared: {
        tasks: read.backup.tasks,
        exportedAt: read.backup.exportedAt,
        formatVersion: read.backup.formatVersion,
        appVersion: read.backup.appVersion,
        fileTaskCount: read.backup.tasks.length,
        localTaskCount: localTasks.length,
      },
    };
  }

  async function restore(prepared: PreparedRestore): Promise<RestoreResult> {
    const now = clock();
    const tasks = prepared.tasks.map((task) => settleElapsedReminders(task, now));

    try {
      await repository.replaceAll(tasks);
    } catch (error) {
      return { ok: false, reason: storageFailureReason(error) };
    }

    let verified: boolean;
    try {
      verified = sameTaskList(await repository.list(), tasks);
    } catch {
      verified = false;
    }

    const planned = tasks.flatMap((task) => planReminders(task, now));
    let remindersPending = false;

    try {
      await scheduler.reconcileAll(planned);
    } catch {
      remindersPending = planned.length > 0;
    }

    return { ok: true, restoredCount: tasks.length, remindersPending, verified };
  }

  return { exportBackup, prepareRestore, restore };
}

export type BackupService = ReturnType<typeof createBackupService>;
