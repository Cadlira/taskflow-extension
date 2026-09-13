import {
  isTaskPriority,
  isTaskStatus,
  type Task,
  type TaskPriority,
  type TaskReminder,
  type TaskStatus,
} from './task';
import { isHttpUrl, TASK_LIMITS } from './task-draft';
import { isReminderOffset } from './task-reminders';

/** Campo de uma tarefa persistida apontado por um problema de integridade. */
export type BackupField =
  | 'task'
  | 'id'
  | 'title'
  | 'description'
  | 'requester'
  | 'assignee'
  | 'status'
  | 'priority'
  | 'dueAt'
  | 'reminders'
  | 'tags'
  | 'sourceUrl'
  | 'createdAt'
  | 'updatedAt'
  | 'completedAt';

export interface BackupIssue {
  /** Posição da tarefa no arquivo, começando em zero. */
  taskIndex: number;
  taskTitle?: string;
  field: BackupField;
  message: string;
}

export type PersistedTaskValidation =
  | { ok: true; task: Task }
  | { ok: false; issues: BackupIssue[] };

export type PersistedTaskCollectionValidation =
  | { ok: true; tasks: Task[] }
  | { ok: false; issues: BackupIssue[] };

const INSTANT_MESSAGE = 'Use um instante ISO 8601 UTC válido.';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** O domínio sempre persiste instantes por `toISOString()`; formatos equivalentes são recusados. */
function isCanonicalInstant(value: unknown): value is string {
  if (typeof value !== 'string') {
    return false;
  }

  const timestamp = Date.parse(value);
  return !Number.isNaN(timestamp) && new Date(timestamp).toISOString() === value;
}

/**
 * Valida estritamente uma tarefa persistida, sem normalizar nada: valores com espaços nas
 * extremidades, textos opcionais vazios e instantes fora do formato `toISOString()` são
 * recusados. Propriedades desconhecidas são descartadas. Todos os problemas são coletados.
 */
export function validatePersistedTask(value: unknown, taskIndex: number): PersistedTaskValidation {
  if (!isRecord(value)) {
    return {
      ok: false,
      issues: [{ taskIndex, field: 'task', message: 'A tarefa não é um objeto válido.' }],
    };
  }

  const issues: BackupIssue[] = [];
  const taskTitle =
    typeof value.title === 'string' && value.title !== '' ? value.title : undefined;

  function add(field: BackupField, message: string): void {
    issues.push(
      taskTitle === undefined
        ? { taskIndex, field, message }
        : { taskIndex, taskTitle, field, message },
    );
  }

  let id: string | undefined;
  if (typeof value.id !== 'string' || value.id.trim() === '') {
    add('id', 'A tarefa precisa de um identificador.');
  } else {
    id = value.id;
  }

  let title: string | undefined;
  if (typeof value.title !== 'string' || value.title.trim() === '') {
    add('title', 'Informe um título.');
  } else if (value.title !== value.title.trim()) {
    add('title', 'O título não pode ter espaços no início ou no fim.');
  } else if (value.title.length > TASK_LIMITS.title) {
    add('title', `O título deve ter no máximo ${TASK_LIMITS.title} caracteres.`);
  } else {
    title = value.title;
  }

  function optionalText(
    raw: unknown,
    field: BackupField,
    label: string,
    limit: number,
  ): string | undefined {
    if (raw === undefined) {
      return undefined;
    }
    if (typeof raw !== 'string') {
      add(field, `${label} deve ser um texto.`);
      return undefined;
    }
    if (raw.trim() === '') {
      add(field, `${label} não pode ficar vazio.`);
      return undefined;
    }
    if (raw !== raw.trim()) {
      add(field, `${label} não pode ter espaços no início ou no fim.`);
      return undefined;
    }
    if (raw.length > limit) {
      add(field, `${label} deve ter no máximo ${limit} caracteres.`);
      return undefined;
    }
    return raw;
  }

  const description = optionalText(
    value.description,
    'description',
    'A descrição',
    TASK_LIMITS.description,
  );
  const requester = optionalText(value.requester, 'requester', 'O solicitante', TASK_LIMITS.person);
  const assignee = optionalText(value.assignee, 'assignee', 'O responsável', TASK_LIMITS.person);

  let status: TaskStatus | undefined;
  if (!isTaskStatus(value.status)) {
    add('status', 'Selecione um status válido.');
  } else {
    status = value.status;
  }

  let priority: TaskPriority | undefined;
  if (!isTaskPriority(value.priority)) {
    add('priority', 'Selecione uma prioridade válida.');
  } else {
    priority = value.priority;
  }

  let dueAt: string | undefined;
  if (value.dueAt !== undefined) {
    if (isCanonicalInstant(value.dueAt)) {
      dueAt = value.dueAt;
    } else {
      add('dueAt', INSTANT_MESSAGE);
    }
  }

  let completedAt: string | undefined;
  if (value.completedAt !== undefined) {
    if (isCanonicalInstant(value.completedAt)) {
      completedAt = value.completedAt;
    } else {
      add('completedAt', INSTANT_MESSAGE);
    }
  }

  if (status === 'DONE' && value.completedAt === undefined) {
    add('completedAt', 'Tarefa concluída precisa registrar a data de conclusão.');
  } else if (status !== undefined && status !== 'DONE' && value.completedAt !== undefined) {
    add('completedAt', 'Somente tarefas concluídas podem registrar a conclusão.');
  }

  let createdAt: string | undefined;
  if (isCanonicalInstant(value.createdAt)) {
    createdAt = value.createdAt;
  } else {
    add('createdAt', INSTANT_MESSAGE);
  }

  let updatedAt: string | undefined;
  if (isCanonicalInstant(value.updatedAt)) {
    updatedAt = value.updatedAt;
  } else {
    add('updatedAt', INSTANT_MESSAGE);
  }

  let tags: string[] | undefined;
  if (!Array.isArray(value.tags)) {
    add('tags', 'As tags devem ser uma lista.');
  } else {
    const collected: string[] = [];
    const seenTags = new Set<string>();

    for (const rawTag of value.tags) {
      if (typeof rawTag !== 'string' || rawTag.trim() === '') {
        add('tags', 'Cada tag deve ser um texto não vazio.');
        continue;
      }
      if (rawTag !== rawTag.trim()) {
        add('tags', 'As tags não podem ter espaços no início ou no fim.');
        continue;
      }
      if (rawTag.length > TASK_LIMITS.tag) {
        add('tags', `Cada tag deve ter no máximo ${TASK_LIMITS.tag} caracteres.`);
        continue;
      }

      const key = rawTag.toLocaleLowerCase();
      if (seenTags.has(key)) {
        add('tags', 'As tags não podem se repetir.');
        continue;
      }

      seenTags.add(key);
      collected.push(rawTag);
    }

    if (value.tags.length > TASK_LIMITS.tags) {
      add('tags', `Informe no máximo ${TASK_LIMITS.tags} tags distintas.`);
    } else if (issues.every((issue) => issue.field !== 'tags')) {
      tags = collected;
    }
  }

  let sourceUrl: string | undefined;
  if (value.sourceUrl !== undefined) {
    if (
      typeof value.sourceUrl !== 'string' ||
      value.sourceUrl.trim() === '' ||
      value.sourceUrl !== value.sourceUrl.trim() ||
      !isHttpUrl(value.sourceUrl)
    ) {
      add('sourceUrl', 'Informe uma URL válida iniciada por http:// ou https://.');
    } else {
      sourceUrl = value.sourceUrl;
    }
  }

  let reminders: TaskReminder[] | undefined;
  if (!Array.isArray(value.reminders)) {
    add('reminders', 'Os lembretes devem ser uma lista.');
  } else {
    const collected: TaskReminder[] = [];
    const seenOffsets = new Set<number>();
    const seenReminderIds = new Set<string>();

    value.reminders.forEach((rawReminder) => {
      if (!isRecord(rawReminder)) {
        add('reminders', 'Cada lembrete deve ser um objeto válido.');
        return;
      }

      const offset = rawReminder.offsetMinutes;
      let offsetOk = false;
      if (!isReminderOffset(offset)) {
        add('reminders', 'Selecione somente opções de lembrete válidas.');
      } else if (seenOffsets.has(offset)) {
        add('reminders', 'Os lembretes não podem repetir o mesmo horário.');
      } else {
        seenOffsets.add(offset);
        offsetOk = true;
      }

      const reminderId = rawReminder.id;
      let reminderIdOk = false;
      if (typeof reminderId !== 'string' || reminderId.trim() === '') {
        add('reminders', 'Cada lembrete precisa de um identificador.');
      } else if (seenReminderIds.has(reminderId)) {
        add('reminders', 'Os lembretes não podem repetir o identificador.');
      } else {
        seenReminderIds.add(reminderId);
        reminderIdOk = true;
      }

      let lastTriggeredFor: string | undefined;
      if (rawReminder.lastTriggeredFor !== undefined) {
        if (isCanonicalInstant(rawReminder.lastTriggeredFor)) {
          lastTriggeredFor = rawReminder.lastTriggeredFor;
        } else {
          add('reminders', INSTANT_MESSAGE);
        }
      }

      if (offsetOk && reminderIdOk && typeof reminderId === 'string' && isReminderOffset(offset)) {
        collected.push(
          lastTriggeredFor === undefined
            ? { id: reminderId, offsetMinutes: offset }
            : { id: reminderId, offsetMinutes: offset, lastTriggeredFor },
        );
      }
    });

    if (value.reminders.length > 0 && value.dueAt === undefined) {
      add('reminders', 'Lembretes exigem um prazo.');
    } else if (issues.every((issue) => issue.field !== 'reminders')) {
      reminders = collected;
    }
  }

  if (
    issues.length > 0 ||
    id === undefined ||
    title === undefined ||
    status === undefined ||
    priority === undefined ||
    createdAt === undefined ||
    updatedAt === undefined ||
    tags === undefined ||
    reminders === undefined
  ) {
    return { ok: false, issues };
  }

  return {
    ok: true,
    task: {
      id,
      title,
      status,
      priority,
      reminders,
      tags,
      createdAt,
      updatedAt,
      ...(description !== undefined && { description }),
      ...(requester !== undefined && { requester }),
      ...(assignee !== undefined && { assignee }),
      ...(dueAt !== undefined && { dueAt }),
      ...(sourceUrl !== undefined && { sourceUrl }),
      ...(completedAt !== undefined && { completedAt }),
    },
  };
}

/** Valida a coleção inteira e recusa o arquivo se qualquer tarefa for inválida ou repetir `id`. */
export function validatePersistedTaskCollection(
  values: readonly unknown[],
): PersistedTaskCollectionValidation {
  const issues: BackupIssue[] = [];
  const tasks: Task[] = [];
  const seenIds = new Map<string, number>();

  values.forEach((value, taskIndex) => {
    const result = validatePersistedTask(value, taskIndex);

    if (!result.ok) {
      issues.push(...result.issues);
      return;
    }

    const firstIndex = seenIds.get(result.task.id);
    if (firstIndex !== undefined) {
      issues.push({
        taskIndex,
        taskTitle: result.task.title,
        field: 'id',
        message: `O identificador “${result.task.id}” está repetido no arquivo (tarefa ${firstIndex + 1}).`,
      });
      return;
    }

    seenIds.set(result.task.id, taskIndex);
    tasks.push(result.task);
  });

  return issues.length > 0 ? { ok: false, issues } : { ok: true, tasks };
}
