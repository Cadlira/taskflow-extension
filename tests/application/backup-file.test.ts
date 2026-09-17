import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BACKUP_MIGRATIONS,
  backupFileName,
  encodeBackupFile,
  readBackupFile,
  type BackupMigration,
} from '@/application/backup/backup-file';
import type { Task } from '@/domain/task';
import { buildTask, FIXED_NOW, hoursFrom } from '../support/task-fixtures';

const EXPORTED_AT = '2026-09-13T18:30:00.000Z';

/** Tarefa como gravada pelas versões do formato anteriores às subtarefas. */
function withoutSubtasks(task: Task): Omit<Task, 'subtasks'> {
  const legacy: Partial<Task> = { ...task };
  delete legacy.subtasks;
  return legacy as Omit<Task, 'subtasks'>;
}

function validFile(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format: 'taskflow-backup',
    formatVersion: 2,
    exportedAt: EXPORTED_AT,
    app: { version: '0.1.0' },
    tasks: [buildTask()],
    ...overrides,
  });
}

describe('encodeBackupFile', () => {
  it('gera a forma exata do arquivo com indentação de 2 espaços', () => {
    const task = buildTask();

    const content = encodeBackupFile([task], { exportedAt: EXPORTED_AT, appVersion: '0.1.0' });

    expect(content).toBe(
      JSON.stringify(
        {
          format: 'taskflow-backup',
          formatVersion: 4,
          exportedAt: EXPORTED_AT,
          app: { version: '0.1.0' },
          tasks: [task],
        },
        null,
        2,
      ),
    );
    expect(content.split('\n')[1]).toBe('  "format": "taskflow-backup",');
    expect(content.split('\n')[2]).toBe('  "formatVersion": 4,');
  });

  it('gera arquivo válido com a lista de tarefas vazia', () => {
    const content = encodeBackupFile([], { exportedAt: EXPORTED_AT, appVersion: '0.1.0' });

    expect(JSON.parse(content)).toEqual({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: EXPORTED_AT,
      app: { version: '0.1.0' },
      tasks: [],
    });
    expect(readBackupFile(content)).toEqual({
      ok: true,
      backup: { formatVersion: 4, exportedAt: EXPORTED_AT, appVersion: '0.1.0', tasks: [] },
    });
  });

  it('preserva identificador de série e regra no arquivo exportado', () => {
    const task = buildTask({
      dueAt: hoursFrom(FIXED_NOW, 48),
      seriesId: 'serie-1',
      recurrence: { frequency: 'WEEKLY', weekdays: [1, 4] },
      reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }],
    });

    const content = encodeBackupFile([task], { exportedAt: EXPORTED_AT, appVersion: '0.1.0' });
    const parsed = JSON.parse(content) as { tasks: Task[] };

    expect(parsed.tasks[0]?.seriesId).toBe('serie-1');
    expect(parsed.tasks[0]?.recurrence).toEqual({ frequency: 'WEEKLY', weekdays: [1, 4] });
    expect(readBackupFile(content)).toEqual({
      ok: true,
      backup: { formatVersion: 4, exportedAt: EXPORTED_AT, appVersion: '0.1.0', tasks: [task] },
    });
  });

  it('inclui as subtarefas na ordem persistida com identificador, título e marcação', () => {
    const subtasks = [
      { id: 's-3', title: 'Revisar números', done: true },
      { id: 's-1', title: 'Reservar sala', done: false },
      { id: 's-2', title: 'Enviar pauta', done: true },
    ];
    const task = buildTask({ subtasks });

    const content = encodeBackupFile([task], { exportedAt: EXPORTED_AT, appVersion: '0.1.0' });
    const parsed = JSON.parse(content) as { formatVersion: number; tasks: Task[] };

    expect(parsed.formatVersion).toBe(4);
    expect(parsed.tasks[0]?.subtasks).toEqual(subtasks);
    expect(readBackupFile(content)).toEqual({
      ok: true,
      backup: { formatVersion: 4, exportedAt: EXPORTED_AT, appVersion: '0.1.0', tasks: [task] },
    });
  });

  it('tem ida e volta fiel para tarefas com lembretes relativos, absolutos e processados', () => {
    const dueAt = hoursFrom(FIXED_NOW, 48);
    const task = buildTask({
      description: 'Descrição',
      requester: 'Ana',
      assignee: 'Bruno',
      dueAt,
      reminders: [
        { id: 'r1', type: 'OFFSET', offsetMinutes: 60 },
        { id: 'r2', type: 'OFFSET', offsetMinutes: 1440, processedFor: hoursFrom(FIXED_NOW, 24) },
        { id: 'r3', type: 'AT', at: hoursFrom(FIXED_NOW, 30), processedFor: hoursFrom(FIXED_NOW, 30) },
      ],
      tags: ['casa'],
      sourceUrl: 'https://example.com',
      status: 'DONE',
      completedAt: '2026-09-13T10:00:00.000Z',
    });

    const result = readBackupFile(
      encodeBackupFile([task], { exportedAt: EXPORTED_AT, appVersion: '0.1.0' }),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.tasks).toEqual([task]);
    }
  });
});

describe('backupFileName', () => {
  it('usa data e hora locais no padrão taskflow-backup-AAAA-MM-DD-HHmm.json', () => {
    expect(backupFileName(new Date(2026, 8, 13, 18, 30))).toBe(
      'taskflow-backup-2026-09-13-1830.json',
    );
  });

  it('preenche mês, dia, hora e minuto com zero à esquerda', () => {
    expect(backupFileName(new Date(2026, 0, 5, 7, 4))).toBe('taskflow-backup-2026-01-05-0704.json');
  });
});

describe('readBackupFile', () => {
  it('aceita a versão atual sem aplicar migração', () => {
    const order: string[] = [];
    const migrations: BackupMigration[] = [
      (file) => {
        order.push('1->2');
        return { ...file, formatVersion: 2 };
      },
    ];
    const text = validFile({ formatVersion: 2 });

    const result = readBackupFile(text, { currentVersion: 2, migrations });

    expect(order).toEqual([]);
    expect(result).toEqual({
      ok: true,
      backup: {
        formatVersion: 2,
        exportedAt: EXPORTED_AT,
        appVersion: '0.1.0',
        tasks: [buildTask()],
      },
    });
  });

  it('converte lembretes da versão 1 com a migração de produção', () => {
    const dueAt = hoursFrom(FIXED_NOW, 48);
    const text = JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 1,
      exportedAt: EXPORTED_AT,
      app: { version: '0.1.0' },
      tasks: [
        {
          ...buildTask({ dueAt }),
          reminders: [
            { id: 'r1', offsetMinutes: 60 },
            { id: 'r2', offsetMinutes: 1440, lastTriggeredFor: dueAt },
          ],
        },
      ],
    });

    const result = readBackupFile(text);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.formatVersion).toBe(4);
      expect(result.backup.tasks[0]?.subtasks).toEqual([]);
      expect(result.backup.tasks[0]?.reminders).toEqual([
        { id: 'r1', type: 'OFFSET', offsetMinutes: 60 },
        {
          id: 'r2',
          type: 'OFFSET',
          offsetMinutes: 1440,
          processedFor: new Date(Date.parse(dueAt) - 1440 * 60_000).toISOString(),
        },
      ]);
    }
  });

  it('recusa conteúdo que não é JSON', () => {
    expect(readBackupFile('{ não é json')).toEqual({ ok: false, reason: 'INVALID_JSON' });
    expect(readBackupFile('')).toEqual({ ok: false, reason: 'INVALID_JSON' });
  });

  it.each([
    ['valor primitivo', '"taskflow"'],
    ['lista sem envelope', '[]'],
    ['objeto sem format', JSON.stringify({ formatVersion: 1 })],
    ['format diferente', validFile({ format: 'outro-backup' })],
  ])('recusa %s', (_label, text) => {
    expect(readBackupFile(text)).toEqual({ ok: false, reason: 'NOT_TASKFLOW_BACKUP' });
  });

  it.each([
    ['formatVersion ausente', validFile({ formatVersion: undefined })],
    ['formatVersion não inteiro', validFile({ formatVersion: 1.5 })],
    ['formatVersion menor que 1', validFile({ formatVersion: 0 })],
    ['formatVersion em texto', validFile({ formatVersion: '1' })],
  ])('recusa %s', (_label, text) => {
    expect(readBackupFile(text)).toEqual({ ok: false, reason: 'INVALID_FORMAT_VERSION' });
  });

  it('recusa versão mais nova que a suportada', () => {
    expect(readBackupFile(validFile({ formatVersion: 5 }))).toEqual({
      ok: false,
      reason: 'NEWER_FORMAT_VERSION',
    });
  });

  it.each([
    ['exportedAt inválido', validFile({ exportedAt: 'ontem' })],
    ['app ausente', validFile({ app: undefined })],
    ['app.version ausente', validFile({ app: {} })],
    ['tasks ausente', validFile({ tasks: undefined })],
    ['tasks que não é lista', validFile({ tasks: { a: 1 } })],
  ])('recusa estrutura inválida: %s', (_label, text) => {
    expect(readBackupFile(text)).toEqual({ ok: false, reason: 'INVALID_STRUCTURE' });
  });

  it('recusa o arquivo inteiro quando uma tarefa é inválida, com os erros posicionados', () => {
    const result = readBackupFile(
      validFile({
        tasks: [
          buildTask({ id: 'ok' }),
          { ...buildTask({ id: 'ruim', title: 'x'.repeat(201) }), priority: 'URGENTE' },
        ],
      }),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INVALID_TASKS');
      expect(result.issues?.map((issue) => [issue.taskIndex, issue.field])).toEqual([
        [1, 'title'],
        [1, 'priority'],
      ]);
    }
  });
});

describe('migrações encadeadas', () => {
  it('aplica a cadeia sintética 1 → 2 → 3 em ordem e valida o resultado final', () => {
    const order: string[] = [];
    const migrations: BackupMigration[] = [
      (file) => {
        order.push('1->2');
        return { ...file, formatVersion: 2 };
      },
      (file) => {
        order.push('2->3');
        return { ...file, formatVersion: 3 };
      },
    ];
    const text = validFile({ formatVersion: 1 });

    const result = readBackupFile(text, { currentVersion: 3, migrations });

    expect(order).toEqual(['1->2', '2->3']);
    expect(result).toEqual({
      ok: true,
      backup: {
        formatVersion: 3,
        exportedAt: EXPORTED_AT,
        appVersion: '0.1.0',
        tasks: [buildTask()],
      },
    });
  });

  it('valida as tarefas depois da última migração', () => {
    const migrations: BackupMigration[] = [
      (file) => ({ ...file, formatVersion: 2, tasks: [{ ...buildTask(), title: '' }] }),
    ];

    const result = readBackupFile(validFile({ formatVersion: 1 }), { currentVersion: 2, migrations });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INVALID_TASKS');
      expect(result.issues?.map((issue) => issue.field)).toContain('title');
    }
  });

  it('recusa quando falta uma migração intermediária', () => {
    const result = readBackupFile(validFile({ formatVersion: 1 }), {
      currentVersion: 2,
      migrations: [],
    });

    expect(result).toEqual({ ok: false, reason: 'INVALID_FORMAT_VERSION' });
  });
});

describe('arquivo de referência da versão 1', () => {
  it('é aceito, migrado e produz exatamente as tarefas esperadas', () => {
    const path = join(__dirname, '..', 'fixtures', 'backups', 'taskflow-backup-v1.json');

    const result = readBackupFile(readFileSync(path, 'utf8'));

    const expected: Task[] = [
      {
        id: '11111111-1111-4111-8111-111111111111',
        title: 'Enviar proposta ao cliente',
        description: 'Revisar valores antes de enviar.',
        requester: 'Ana',
        assignee: 'Bruno',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueAt: '2026-09-20T12:00:00.000Z',
        reminders: [
          { id: 'rem-1', type: 'OFFSET', offsetMinutes: 60 },
          {
            id: 'rem-2',
            type: 'OFFSET',
            offsetMinutes: 1440,
            processedFor: '2026-09-19T12:00:00.000Z',
          },
        ],
        tags: ['Cliente', 'comercial'],
        sourceUrl: 'https://example.com/propostas/42',
        createdAt: '2026-09-10T09:00:00.000Z',
        subtasks: [],
        updatedAt: '2026-09-12T15:30:00.000Z',
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        title: 'Reunião de planejamento',
        status: 'TODO',
        priority: 'MEDIUM',
        reminders: [],
        tags: [],
        createdAt: '2026-09-11T10:00:00.000Z',
        subtasks: [],
        updatedAt: '2026-09-11T10:00:00.000Z',
      },
      {
        id: '33333333-3333-4333-8333-333333333333',
        title: 'Publicar notas da versão',
        status: 'DONE',
        priority: 'LOW',
        reminders: [],
        tags: ['release'],
        createdAt: '2026-09-01T08:00:00.000Z',
        subtasks: [],
        updatedAt: '2026-09-08T17:45:00.000Z',
        completedAt: '2026-09-08T17:45:00.000Z',
      },
      {
        id: '44444444-4444-4444-8444-444444444444',
        title: 'Contratar fornecedor antigo',
        status: 'CANCELLED',
        priority: 'URGENT',
        reminders: [],
        tags: [],
        createdAt: '2026-09-02T11:00:00.000Z',
        subtasks: [],
        updatedAt: '2026-09-05T12:00:00.000Z',
      },
    ];

    expect(result).toEqual({
      ok: true,
      backup: {
        formatVersion: 4,
        exportedAt: '2026-09-13T18:30:00.000Z',
        appVersion: '0.1.0',
        tasks: expected,
      },
    });
  });
});

describe('arquivo de referência da versão 2', () => {
  it('é aceito, migrado para a versão 4 e produz exatamente as tarefas esperadas', () => {
    const path = join(__dirname, '..', 'fixtures', 'backups', 'taskflow-backup-v2.json');

    const result = readBackupFile(readFileSync(path, 'utf8'));

    const expected: Task[] = [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'Preparar apresentação',
        description: 'Montar os slides com os resultados do trimestre.',
        requester: 'Marina',
        assignee: 'Caio',
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        dueAt: '2026-09-20T12:00:00.000Z',
        reminders: [
          { id: 'rem-rel-60', type: 'OFFSET', offsetMinutes: 60 },
          {
            id: 'rem-rel-processed',
            type: 'OFFSET',
            offsetMinutes: 1440,
            processedFor: '2026-09-19T12:00:00.000Z',
          },
          { id: 'rem-abs-pending', type: 'AT', at: '2026-09-18T09:30:00.000Z' },
          {
            id: 'rem-abs-processed',
            type: 'AT',
            at: '2026-09-17T08:00:00.000Z',
            processedFor: '2026-09-17T08:00:00.000Z',
          },
        ],
        tags: ['cliente', 'apresentação'],
        sourceUrl: 'https://example.com/apresentacoes/7',
        createdAt: '2026-09-10T09:00:00.000Z',
        subtasks: [],
        updatedAt: '2026-09-13T16:45:00.000Z',
      },
      {
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        title: 'Reunião de alinhamento',
        status: 'TODO',
        priority: 'MEDIUM',
        reminders: [],
        tags: [],
        createdAt: '2026-09-11T10:00:00.000Z',
        subtasks: [],
        updatedAt: '2026-09-11T10:00:00.000Z',
      },
      {
        id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        title: 'Publicar notas da versão',
        status: 'DONE',
        priority: 'LOW',
        reminders: [],
        tags: ['release'],
        createdAt: '2026-09-01T08:00:00.000Z',
        subtasks: [],
        updatedAt: '2026-09-08T17:45:00.000Z',
        completedAt: '2026-09-08T17:45:00.000Z',
      },
    ];

    expect(result).toEqual({
      ok: true,
      backup: {
        formatVersion: 4,
        exportedAt: '2026-09-14T18:30:00.000Z',
        appVersion: '0.2.0',
        tasks: expected,
      },
    });
  });
});

describe('arquivo de referência da versão 3', () => {
  it('é aceito, migrado para a versão 4 e preserva recorrência e série sem subtarefas', () => {
    const path = join(__dirname, '..', 'fixtures', 'backups', 'taskflow-backup-v3.json');

    const result = readBackupFile(readFileSync(path, 'utf8'));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.backup.formatVersion).toBe(4);
    expect(result.backup.tasks).toHaveLength(3);
    expect(result.backup.tasks.every((task) => task.subtasks.length === 0)).toBe(true);

    const [closed, open, postponed] = result.backup.tasks;

    expect(closed).toMatchObject({
      id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
      status: 'DONE',
      seriesId: 'serie-energia',
    });
    expect(closed?.recurrence).toBeUndefined();

    expect(open).toMatchObject({
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      status: 'TODO',
      seriesId: 'serie-energia',
      dueAt: '2026-10-10T12:00:00.000Z',
      recurrence: { frequency: 'MONTHLY', dayOfMonth: 10 },
    });

    expect(postponed).toMatchObject({
      id: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
      seriesId: 'serie-revisao',
      dueAt: '2026-09-20T12:00:00.000Z',
      recurrence: {
        frequency: 'DAILY',
        intervalDays: 15,
        anchorAt: '2026-09-05T12:00:00.000Z',
        until: '2026-12-31T23:59:00.000Z',
      },
    });
    expect(postponed).not.toHaveProperty('unknownTaskField');
  });
});

describe('arquivo de referência da versão 4', () => {
  it('é aceito sem migração e preserva ordem, títulos e marcações das subtarefas', () => {
    const path = join(__dirname, '..', 'fixtures', 'backups', 'taskflow-backup-v4.json');
    const order: string[] = [];
    const migrations = BACKUP_MIGRATIONS.map<BackupMigration>((migration, index) => (file) => {
      order.push(`${index + 1}->${index + 2}`);
      return migration(file);
    });

    const result = readBackupFile(readFileSync(path, 'utf8'), { migrations });

    expect(order).toEqual([]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.backup.formatVersion).toBe(4);
    expect(result.backup.tasks.map((task) => [task.id, task.subtasks])).toEqual([
      ['12121212-1212-4121-8121-121212121212', []],
      [
        '34343434-3434-4343-8343-343434343434',
        [
          { id: 'sub-sala', title: 'Reservar sala', done: true },
          { id: 'sub-pauta', title: 'Enviar pauta', done: false },
          { id: 'sub-numeros', title: 'Revisar os números', done: true },
        ],
      ],
      [
        '56565656-5656-4565-8565-565656565656',
        [
          { id: 'sub-semana-1', title: 'Atualizar o quadro', done: true },
          { id: 'sub-semana-2', title: 'Arquivar e-mails', done: false },
        ],
      ],
      [
        '78787878-7878-4787-8787-787878787878',
        [
          { id: 'sub-semana-3', title: 'Atualizar o quadro', done: false },
          { id: 'sub-semana-4', title: 'Arquivar e-mails', done: false },
        ],
      ],
    ]);
    expect(result.backup.tasks[3]).toMatchObject({
      seriesId: 'serie-semana',
      recurrence: { frequency: 'WEEKLY', weekdays: [5] },
    });
  });
});

describe('migração de lastTriggeredFor', () => {
  const dueAt = '2026-09-20T12:00:00.000Z';

  function legacyFile(lastTriggeredFor: unknown, offsetMinutes = 60): string {
    return JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 1,
      exportedAt: EXPORTED_AT,
      app: { version: '0.1.0' },
      tasks: [
        {
          ...buildTask({ dueAt }),
          reminders: [{ id: 'r', offsetMinutes, lastTriggeredFor }],
        },
      ],
    });
  }

  it('converte lastTriggeredFor válido no instante efetivo processado', () => {
    const result = readBackupFile(legacyFile(dueAt));

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.backup.tasks[0]?.reminders).toEqual([
        {
          id: 'r',
          type: 'OFFSET',
          offsetMinutes: 60,
          processedFor: '2026-09-20T11:00:00.000Z',
        },
      ]);
    }
  });

  it.each([
    ['texto inválido', 'ontem'],
    ['tipo incorreto', 123],
    ['nulo', null],
  ])('recusa o arquivo quando lastTriggeredFor é %s', (_label, value) => {
    const result = readBackupFile(legacyFile(value));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INVALID_TASKS');
      expect(result.issues?.map((issue) => issue.field)).toContain('reminders');
    }
  });

  it('recusa sem lançar quando o instante convertido sai do intervalo de datas', () => {
    const result = readBackupFile(legacyFile(dueAt, Number.MAX_SAFE_INTEGER));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INVALID_TASKS');
      expect(result.issues?.map((issue) => issue.field)).toContain('reminders');
    }
  });
});

describe('migração de produção', () => {
  it('possui exatamente as conversões da versão 1 para a 2, da 2 para a 3 e da 3 para a 4', () => {
    expect(BACKUP_MIGRATIONS).toHaveLength(3);

    const migratedV2 = BACKUP_MIGRATIONS[0]!({
      format: 'taskflow-backup',
      formatVersion: 1,
      exportedAt: EXPORTED_AT,
      app: { version: '0.1.0' },
      tasks: [buildTask()],
    });
    const migratedV3 = BACKUP_MIGRATIONS[1]!(migratedV2);

    const migratedV4 = BACKUP_MIGRATIONS[2]!(migratedV3);

    expect(migratedV2.formatVersion).toBe(2);
    expect(migratedV3.formatVersion).toBe(3);
    expect(migratedV4.formatVersion).toBe(4);
    expect(migratedV4.tasks).toEqual([buildTask()]);
  });

  it('a migração 3 → 4 atribui subtarefas vazias sem alterar o restante das tarefas', () => {
    const legacy = withoutSubtasks(buildTask({ dueAt: hoursFrom(FIXED_NOW, 48) }));

    const migrated = BACKUP_MIGRATIONS[2]!({
      format: 'taskflow-backup',
      formatVersion: 3,
      exportedAt: EXPORTED_AT,
      app: { version: '0.1.0' },
      tasks: [legacy, 'não é tarefa'],
    });

    expect(migrated).toEqual({
      format: 'taskflow-backup',
      formatVersion: 4,
      exportedAt: EXPORTED_AT,
      app: { version: '0.1.0' },
      tasks: [{ ...legacy, subtasks: [] }, 'não é tarefa'],
    });
  });

  it('aplica a migração de produção da versão 3 atribuindo subtarefas vazias', () => {
    const legacy = withoutSubtasks(buildTask({ id: 'v3' }));

    const result = readBackupFile(validFile({ formatVersion: 3, tasks: [legacy] }));

    expect(result).toEqual({
      ok: true,
      backup: {
        formatVersion: 4,
        exportedAt: EXPORTED_AT,
        appVersion: '0.1.0',
        tasks: [buildTask({ id: 'v3' })],
      },
    });
  });

  it('aplica a migração de produção da versão 2 sem alterar as tarefas', () => {
    const task = buildTask({ dueAt: hoursFrom(FIXED_NOW, 48) });

    const result = readBackupFile(validFile({ formatVersion: 2, tasks: [task] }));

    expect(result).toEqual({
      ok: true,
      backup: { formatVersion: 4, exportedAt: EXPORTED_AT, appVersion: '0.1.0', tasks: [task] },
    });
  });
});
