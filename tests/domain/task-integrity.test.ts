import { describe, expect, it } from 'vitest';
import { createTask, updateTask } from '@/domain/task-draft';
import {
  validatePersistedTask,
  validatePersistedTaskCollection,
  type BackupField,
} from '@/domain/task-integrity';
import { markReminderTriggered, settleElapsedReminders } from '@/domain/task-reminders';
import { applyStatus } from '@/domain/task-status';
import type { Task } from '@/domain/task';
import { buildTask, FIXED_NOW, hoursFrom, sequentialIds } from '../support/task-fixtures';

const DUE_AT = hoursFrom(FIXED_NOW, 48);

function expectRejected(value: unknown, field: BackupField): void {
  const result = validatePersistedTask(value, 0);

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.issues.map((issue) => issue.field)).toContain(field);
  }
}

describe('validatePersistedTask', () => {
  it('aceita uma tarefa persistida válida preservando todos os campos', () => {
    const task = buildTask({
      description: 'Descrição',
      requester: 'Ana',
      assignee: 'Bruno',
      dueAt: DUE_AT,
      reminders: [
        { id: 'r1', offsetMinutes: 15 },
        { id: 'r2', offsetMinutes: 60, lastTriggeredFor: DUE_AT },
      ],
      tags: ['casa', 'Trabalho'],
      sourceUrl: 'https://example.com/pagina',
    });

    const result = validatePersistedTask(task, 3);

    expect(result).toEqual({ ok: true, task });
  });

  it('descarta propriedades desconhecidas da tarefa', () => {
    const result = validatePersistedTask(
      { ...buildTask(), extra: 'ignorado', legado: { a: 1 } },
      0,
    );

    expect(result).toEqual({ ok: true, task: buildTask() });
  });

  it('recusa um valor que não é objeto', () => {
    expectRejected('tarefa', 'task');
  });

  const rejections: [string, unknown, BackupField][] = [
    ['id ausente', { ...buildTask(), id: undefined }, 'id'],
    ['id vazio', buildTask({ id: '' }), 'id'],
    ['id em branco', buildTask({ id: '   ' }), 'id'],
    ['título ausente', { ...buildTask(), title: undefined }, 'title'],
    ['título vazio', buildTask({ title: '' }), 'title'],
    ['título em branco', buildTask({ title: '   ' }), 'title'],
    ['título com espaços nas extremidades', buildTask({ title: ' Revisar ' }), 'title'],
    ['título com 201 caracteres', buildTask({ title: 'x'.repeat(201) }), 'title'],
    ['descrição com 4.001 caracteres', buildTask({ description: 'x'.repeat(4001) }), 'description'],
    ['descrição vazia', buildTask({ description: '' }), 'description'],
    ['descrição em branco', buildTask({ description: '   ' }), 'description'],
    ['descrição com espaços nas extremidades', buildTask({ description: ' oi ' }), 'description'],
    ['solicitante com 121 caracteres', buildTask({ requester: 'x'.repeat(121) }), 'requester'],
    ['solicitante vazio', buildTask({ requester: '' }), 'requester'],
    ['responsável com 121 caracteres', buildTask({ assignee: 'x'.repeat(121) }), 'assignee'],
    ['responsável com espaços nas extremidades', buildTask({ assignee: ' Ana ' }), 'assignee'],
    ['status desconhecido', { ...buildTask(), status: 'ARCHIVED' }, 'status'],
    ['prioridade desconhecida', { ...buildTask(), priority: 'URGENTE' }, 'priority'],
    ['createdAt sem milissegundos', buildTask({ createdAt: '2026-09-01T10:00:00Z' }), 'createdAt'],
    ['updatedAt inválido', buildTask({ updatedAt: 'ontem' }), 'updatedAt'],
    ['dueAt inválido', buildTask({ dueAt: '2026-13-40' }), 'dueAt'],
    [
      'DONE sem completedAt',
      buildTask({ status: 'DONE' }),
      'completedAt',
    ],
    [
      'TODO com completedAt',
      buildTask({ completedAt: '2026-09-10T00:00:00.000Z' }),
      'completedAt',
    ],
    [
      'CANCELLED com completedAt',
      buildTask({ status: 'CANCELLED', completedAt: '2026-09-10T00:00:00.000Z' }),
      'completedAt',
    ],
    [
      'DONE com completedAt inválido',
      buildTask({ status: 'DONE', completedAt: '10/09/2026' }),
      'completedAt',
    ],
    ['tags que não são lista', { ...buildTask(), tags: 'casa' }, 'tags'],
    ['tag vazia', buildTask({ tags: [''] }), 'tags'],
    ['tag em branco', buildTask({ tags: ['  '] }), 'tags'],
    ['tag com espaços nas extremidades', buildTask({ tags: [' casa '] }), 'tags'],
    ['tag com 31 caracteres', buildTask({ tags: ['x'.repeat(31)] }), 'tags'],
    ['mais de 10 tags', buildTask({ tags: Array.from({ length: 11 }, (_, i) => `t${i}`) }), 'tags'],
    ['tags duplicadas ignorando caixa', buildTask({ tags: ['Casa', 'casa'] }), 'tags'],
    ['URL não http(s)', buildTask({ sourceUrl: 'ftp://example.com' }), 'sourceUrl'],
    ['URL relativa', buildTask({ sourceUrl: '/pagina' }), 'sourceUrl'],
    ['URL vazia', buildTask({ sourceUrl: '' }), 'sourceUrl'],
    ['lembretes que não são lista', { ...buildTask(), reminders: {} }, 'reminders'],
    ['lembrete que não é objeto', { ...buildTask(), reminders: ['r1'] }, 'reminders'],
    [
      'lembrete sem prazo',
      buildTask({ reminders: [{ id: 'r1', offsetMinutes: 15 }] }),
      'reminders',
    ],
    [
      'deslocamento não permitido',
      buildTask({ dueAt: DUE_AT, reminders: [{ id: 'r1', offsetMinutes: 30 }] }),
      'reminders',
    ],
    [
      'deslocamento repetido',
      buildTask({
        dueAt: DUE_AT,
        reminders: [
          { id: 'r1', offsetMinutes: 15 },
          { id: 'r2', offsetMinutes: 15 },
        ],
      }),
      'reminders',
    ],
    [
      'lembrete sem identificador',
      buildTask({ dueAt: DUE_AT, reminders: [{ id: '', offsetMinutes: 15 }] }),
      'reminders',
    ],
    [
      'identificador de lembrete repetido',
      buildTask({
        dueAt: DUE_AT,
        reminders: [
          { id: 'r1', offsetMinutes: 15 },
          { id: 'r1', offsetMinutes: 60 },
        ],
      }),
      'reminders',
    ],
    [
      'lastTriggeredFor fora do formato canônico',
      buildTask({
        dueAt: DUE_AT,
        reminders: [{ id: 'r1', offsetMinutes: 15, lastTriggeredFor: '2026-09-11' }],
      }),
      'reminders',
    ],
  ];

  it.each(rejections)('recusa %s', (_label, value, field) => {
    expectRejected(value, field);
  });

  it('coleta todos os erros com posição, título e campo', () => {
    const title = 'x'.repeat(201);
    const result = validatePersistedTask(
      { ...buildTask({ title }), priority: 'URGENTE', sourceUrl: 'ftp://example.com' },
      2,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.map((issue) => issue.field).sort()).toEqual([
        'priority',
        'sourceUrl',
        'title',
      ]);
      expect(result.issues.every((issue) => issue.taskIndex === 2)).toBe(true);
      expect(result.issues.every((issue) => issue.taskTitle === title)).toBe(true);
    }
  });
});

describe('validatePersistedTaskCollection', () => {
  it('aceita a coleção válida e devolve as tarefas na ordem do arquivo', () => {
    const tasks = [buildTask({ id: 'a' }), buildTask({ id: 'b', title: 'Segunda' })];

    expect(validatePersistedTaskCollection(tasks)).toEqual({ ok: true, tasks });
  });

  it('recusa identificadores duplicados e aponta a posição da repetição', () => {
    const result = validatePersistedTaskCollection([
      buildTask({ id: 'a' }),
      buildTask({ id: 'a', title: 'Duplicada' }),
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toEqual([
        expect.objectContaining({ taskIndex: 1, field: 'id', taskTitle: 'Duplicada' }),
      ]);
      expect(result.issues[0]?.message).toContain('repetido');
    }
  });

  it('agrega os erros de todas as tarefas do arquivo', () => {
    const result = validatePersistedTaskCollection([
      buildTask({ id: 'a', title: 'x'.repeat(201) }),
      { ...buildTask({ id: 'b' }), priority: 'URGENTE' },
      buildTask({ id: 'c', tags: ['casa', 'Casa'] }),
    ]);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(3);
      expect(result.issues.map((issue) => [issue.taskIndex, issue.field])).toEqual([
        [0, 'title'],
        [1, 'priority'],
        [2, 'tags'],
      ]);
    }
  });
});

describe('ida e volta das tarefas do domínio', () => {
  const context = { now: FIXED_NOW, generateId: sequentialIds('id') };

  function expectValid(task: Task): Task {
    const result = validatePersistedTask(JSON.parse(JSON.stringify(task)), 0);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.task).toEqual(task);
    }
    return task;
  }

  it('valida tarefas criadas por createTask com todos os campos', () => {
    const result = createTask(
      {
        title: 'Completa',
        description: 'Descrição',
        requester: 'Ana',
        assignee: 'Bruno',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueAt: DUE_AT,
        reminderOffsets: [0, 60],
        tags: ['casa'],
        sourceUrl: 'https://example.com',
      },
      context,
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expectValid(result.value);
    }
  });

  it('valida tarefas editadas, concluídas, canceladas e reabertas', () => {
    const created = createTask({ title: 'Base', dueAt: DUE_AT, reminderOffsets: [15] }, context);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const updated = updateTask(created.value, { title: 'Editada', tags: ['casa'] }, context);
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expectValid(updated.value);

    expectValid(applyStatus(updated.value, 'DONE', context.now));
    expectValid(applyStatus(updated.value, 'CANCELLED', context.now));
    expectValid(applyStatus(applyStatus(updated.value, 'DONE', context.now), 'TODO', context.now));
  });

  it('valida lembretes liquidados e disparados', () => {
    const created = createTask({ title: 'Lembretes', dueAt: DUE_AT, reminderOffsets: [0, 60] }, context);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const settled = settleElapsedReminders(created.value, new Date(Date.parse(DUE_AT) + 60_000));
    expectValid(settled);

    const pending = settleElapsedReminders(created.value, FIXED_NOW);
    const triggered = markReminderTriggered(pending, pending.reminders[0]!.id);
    expectValid(triggered);
  });
});
