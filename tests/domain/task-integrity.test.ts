import { describe, expect, it } from 'vitest';
import { createTask, updateTask, type TaskDraft } from '@/domain/task-draft';
import {
  validatePersistedTask,
  validatePersistedTaskCollection,
  type BackupField,
} from '@/domain/task-integrity';
import {
  claimReminderOccurrence,
  markReminderProcessed,
  settleElapsedReminders,
} from '@/domain/task-reminders';
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
        { id: 'r1', type: 'OFFSET', offsetMinutes: 15 },
        { id: 'r2', type: 'OFFSET', offsetMinutes: 60, processedFor: DUE_AT },
        { id: 'r3', type: 'AT', at: hoursFrom(FIXED_NOW, 24) },
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

  it('aceita tarefa recorrente com âncora, limite e lembretes relativos', () => {
    const task = buildTask({
      dueAt: DUE_AT,
      seriesId: 'serie-1',
      recurrence: {
        frequency: 'MONTHLY',
        dayOfMonth: 31,
        anchorAt: '2026-01-31T12:00:00.000Z',
        until: '2026-12-31T12:00:00.000Z',
      },
      reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 1440 }],
    });

    expect(validatePersistedTask(task, 0)).toEqual({ ok: true, task });
  });

  it('aceita ocorrência terminal que preserva a série sem a regra', () => {
    const task = buildTask({ dueAt: DUE_AT, seriesId: 'serie-1' });

    expect(validatePersistedTask(task, 0)).toEqual({ ok: true, task });
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
    ['DONE sem completedAt', buildTask({ status: 'DONE' }), 'completedAt'],
    ['TODO com completedAt', buildTask({ completedAt: '2026-09-10T00:00:00.000Z' }), 'completedAt'],
    [
      'CANCELLED com completedAt',
      buildTask({ status: 'CANCELLED', completedAt: '2026-09-10T00:00:00.000Z' }),
      'completedAt',
    ],
    ['DONE com completedAt inválido', buildTask({ status: 'DONE', completedAt: '10/09/2026' }), 'completedAt'],
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
    ['lembrete sem prazo', buildTask({ reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 15 }] }), 'reminders'],
    [
      'tipo de lembrete desconhecido',
      { ...buildTask({ dueAt: DUE_AT }), reminders: [{ id: 'r1', type: 'EVERY_DAY', offsetMinutes: 15 }] },
      'reminders',
    ],
    [
      'deslocamento fracionário',
      buildTask({ dueAt: DUE_AT, reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 1.5 }] }),
      'reminders',
    ],
    [
      'deslocamento negativo',
      buildTask({ dueAt: DUE_AT, reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: -15 }] }),
      'reminders',
    ],
    [
      'deslocamento repetido',
      buildTask({
        dueAt: DUE_AT,
        reminders: [
          { id: 'r1', type: 'OFFSET', offsetMinutes: 15 },
          { id: 'r2', type: 'OFFSET', offsetMinutes: 15 },
        ],
      }),
      'reminders',
    ],
    [
      'instante efetivo fora do intervalo de datas',
      buildTask({
        dueAt: DUE_AT,
        reminders: [
          { id: 'r1', type: 'OFFSET', offsetMinutes: Number.MAX_SAFE_INTEGER },
        ],
      }),
      'reminders',
    ],
    [
      'colisão entre tipos diferentes',
      buildTask({
        dueAt: DUE_AT,
        reminders: [
          { id: 'r1', type: 'OFFSET', offsetMinutes: 60 },
          { id: 'r2', type: 'AT', at: new Date(Date.parse(DUE_AT) - 60 * 60_000).toISOString() },
        ],
      }),
      'reminders',
    ],
    [
      'horário absoluto posterior ao prazo',
      buildTask({
        dueAt: DUE_AT,
        reminders: [{ id: 'r1', type: 'AT', at: hoursFrom(new Date(DUE_AT), 1) }],
      }),
      'reminders',
    ],
    [
      'horário absoluto fora do formato canônico',
      buildTask({ dueAt: DUE_AT, reminders: [{ id: 'r1', type: 'AT', at: '2026-09-11' }] }),
      'reminders',
    ],
    [
      'mais de dez lembretes',
      buildTask({
        dueAt: DUE_AT,
        reminders: Array.from({ length: 11 }, (_, index) => ({
          id: `r${index}`,
          type: 'OFFSET' as const,
          offsetMinutes: index * 5,
        })),
      }),
      'reminders',
    ],
    [
      'lembrete sem identificador',
      buildTask({ dueAt: DUE_AT, reminders: [{ id: '', type: 'OFFSET', offsetMinutes: 15 }] }),
      'reminders',
    ],
    [
      'identificador de lembrete repetido',
      buildTask({
        dueAt: DUE_AT,
        reminders: [
          { id: 'r1', type: 'OFFSET', offsetMinutes: 15 },
          { id: 'r1', type: 'OFFSET', offsetMinutes: 60 },
        ],
      }),
      'reminders',
    ],
    [
      'processedFor fora do formato canônico',
      buildTask({
        dueAt: DUE_AT,
        reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 15, processedFor: '2026-09-11' }],
      }),
      'reminders',
    ],
    ['seriesId vazio', buildTask({ seriesId: '' }), 'seriesId'],
    ['seriesId em branco', buildTask({ seriesId: '   ' }), 'seriesId'],
    ['seriesId que não é texto', { ...buildTask(), seriesId: 1 }, 'seriesId'],
    [
      'recurrence sem prazo',
      buildTask({ seriesId: 'serie-1', recurrence: { frequency: 'DAILY', intervalDays: 1 } }),
      'recurrence',
    ],
    [
      'recurrence sem série',
      buildTask({ dueAt: DUE_AT, recurrence: { frequency: 'DAILY', intervalDays: 1 } }),
      'recurrence',
    ],
    [
      'recurrence com frequência desconhecida',
      buildTask({
        dueAt: DUE_AT,
        seriesId: 'serie-1',
        recurrence: { frequency: 'YEARLY' } as never,
      }),
      'recurrence',
    ],
    [
      'recurrence com intervalo diário fora do limite',
      buildTask({
        dueAt: DUE_AT,
        seriesId: 'serie-1',
        recurrence: { frequency: 'DAILY', intervalDays: 366 },
      }),
      'recurrence',
    ],
    [
      'recurrence com dias da semana repetidos',
      buildTask({
        dueAt: DUE_AT,
        seriesId: 'serie-1',
        recurrence: { frequency: 'WEEKLY', weekdays: [1, 1] },
      }),
      'recurrence',
    ],
    [
      'recurrence com dia do mês fora do limite',
      buildTask({
        dueAt: DUE_AT,
        seriesId: 'serie-1',
        recurrence: { frequency: 'MONTHLY', dayOfMonth: 32 },
      }),
      'recurrence',
    ],
    [
      'recurrence com âncora não canônica',
      buildTask({
        dueAt: DUE_AT,
        seriesId: 'serie-1',
        recurrence: { frequency: 'DAILY', intervalDays: 1, anchorAt: '2026-09-11' },
      }),
      'recurrence',
    ],
    [
      'recurrence com limite não canônico',
      buildTask({
        dueAt: DUE_AT,
        seriesId: 'serie-1',
        recurrence: { frequency: 'DAILY', intervalDays: 1, until: '2026-09-30' },
      }),
      'recurrence',
    ],
    [
      'recurrence com lembrete absoluto',
      buildTask({
        dueAt: DUE_AT,
        seriesId: 'serie-1',
        reminders: [{ id: 'r1', type: 'AT', at: DUE_AT }],
        recurrence: { frequency: 'DAILY', intervalDays: 1 },
      }),
      'recurrence',
    ],
    ['subtarefas ausentes', { ...buildTask(), subtasks: undefined }, 'subtasks'],
    ['subtarefas que não são lista', { ...buildTask(), subtasks: {} }, 'subtasks'],
    ['subtarefa que não é objeto', { ...buildTask(), subtasks: ['A'] }, 'subtasks'],
    [
      'mais de 20 subtarefas',
      buildTask({
        subtasks: Array.from({ length: 21 }, (_, i) => ({ id: `s${i}`, title: 'Item', done: false })),
      }),
      'subtasks',
    ],
    [
      'subtarefa sem identificador',
      { ...buildTask(), subtasks: [{ title: 'A', done: false }] },
      'subtasks',
    ],
    [
      'subtarefa com identificador em branco',
      buildTask({ subtasks: [{ id: '  ', title: 'A', done: false }] }),
      'subtasks',
    ],
    [
      'identificador de subtarefa repetido na tarefa',
      buildTask({
        subtasks: [
          { id: 's1', title: 'A', done: false },
          { id: 's1', title: 'B', done: true },
        ],
      }),
      'subtasks',
    ],
    [
      'subtarefa com título vazio',
      buildTask({ subtasks: [{ id: 's1', title: '', done: false }] }),
      'subtasks',
    ],
    [
      'subtarefa com título em branco',
      buildTask({ subtasks: [{ id: 's1', title: '   ', done: false }] }),
      'subtasks',
    ],
    [
      'subtarefa com título com espaços nas extremidades',
      buildTask({ subtasks: [{ id: 's1', title: ' A ', done: false }] }),
      'subtasks',
    ],
    [
      'subtarefa com título de 201 caracteres',
      buildTask({ subtasks: [{ id: 's1', title: 'x'.repeat(201), done: false }] }),
      'subtasks',
    ],
    [
      'subtarefa com marcação não booleana',
      { ...buildTask(), subtasks: [{ id: 's1', title: 'A', done: 'true' }] },
      'subtasks',
    ],
    [
      'subtarefa sem marcação',
      { ...buildTask(), subtasks: [{ id: 's1', title: 'A' }] },
      'subtasks',
    ],
  ];

  it('aceita subtarefas válidas no limite e descarta propriedades desconhecidas dos itens', () => {
    const subtasks = Array.from({ length: 20 }, (_, i) => ({
      id: `s${i}`,
      title: i === 0 ? 'x'.repeat(200) : `Item ${i}`,
      done: i % 2 === 0,
    }));
    const task = buildTask({ subtasks });

    expect(
      validatePersistedTask(
        { ...task, subtasks: subtasks.map((subtask) => ({ ...subtask, extra: 'ignorado' })) },
        0,
      ),
    ).toEqual({ ok: true, task });
  });

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

  it('aceita o mesmo identificador de subtarefa em tarefas diferentes', () => {
    const subtasks = [{ id: 's1', title: 'Passo', done: false }];
    const tasks = [buildTask({ id: 'a', subtasks }), buildTask({ id: 'b', subtasks })];

    expect(validatePersistedTaskCollection(tasks)).toEqual({ ok: true, tasks });
  });

  it('aceita duas ocorrências ativas da mesma série com apenas uma regra', () => {
    const rule = buildTask({
      id: 'a',
      dueAt: DUE_AT,
      seriesId: 'serie-1',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
    });
    const sibling = buildTask({ id: 'b', dueAt: hoursFrom(FIXED_NOW, 24), seriesId: 'serie-1' });

    expect(validatePersistedTaskCollection([rule, sibling])).toEqual({
      ok: true,
      tasks: [rule, sibling],
    });
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
    const draft: TaskDraft = {
      title: 'Completa',
      description: 'Descrição',
      requester: 'Ana',
      assignee: 'Bruno',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueAt: DUE_AT,
      reminders: [
        { type: 'OFFSET', offsetMinutes: 0 },
        { type: 'AT', at: hoursFrom(FIXED_NOW, 24) },
      ],
      tags: ['casa'],
      sourceUrl: 'https://example.com',
    };
    const result = createTask(draft, context);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expectValid(result.value);
    }
  });

  it('valida tarefas editadas, concluídas, canceladas e reabertas', () => {
    const created = createTask(
      { title: 'Base', dueAt: DUE_AT, reminders: [{ type: 'OFFSET', offsetMinutes: 15 }] },
      context,
    );
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

  it('valida lembretes liquidados e processados', () => {
    const created = createTask(
      {
        title: 'Lembretes',
        dueAt: DUE_AT,
        reminders: [
          { type: 'OFFSET', offsetMinutes: 0 },
          { type: 'OFFSET', offsetMinutes: 60 },
        ],
      },
      context,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const settled = settleElapsedReminders(created.value, new Date(Date.parse(DUE_AT) + 60_000));
    expectValid(settled);

    const pending = settleElapsedReminders(created.value, FIXED_NOW);
    const claimed = claimReminderOccurrence(
      pending,
      pending.reminders[0]!.id,
      new Date(Date.parse(DUE_AT)).toISOString(),
    );
    expect(claimed).toBeDefined();
    expectValid(claimed!);

    expectValid(markReminderProcessed(pending, pending.reminders[1]!.id, '2026-09-15T08:00:00.000Z'));
  });

  it('valida a ocorrência recorrente e a série encerrada', () => {
    const created = createTask(
      { title: 'Série', dueAt: DUE_AT, recurrence: { frequency: 'WEEKLY', weekdays: [1, 4] } },
      context,
    );
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.value.seriesId).toBeDefined();
    expectValid(created.value);

    const stopped = updateTask(created.value, { title: created.value.title }, context);
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.value.seriesId).toBe(created.value.seriesId);
    expect(stopped.value.recurrence).toBeUndefined();
    expectValid(stopped.value);
  });
});
