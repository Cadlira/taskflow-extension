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
          formatVersion: 2,
          exportedAt: EXPORTED_AT,
          app: { version: '0.1.0' },
          tasks: [task],
        },
        null,
        2,
      ),
    );
    expect(content.split('\n')[1]).toBe('  "format": "taskflow-backup",');
    expect(content.split('\n')[2]).toBe('  "formatVersion": 2,');
  });

  it('gera arquivo válido com a lista de tarefas vazia', () => {
    const content = encodeBackupFile([], { exportedAt: EXPORTED_AT, appVersion: '0.1.0' });

    expect(JSON.parse(content)).toEqual({
      format: 'taskflow-backup',
      formatVersion: 2,
      exportedAt: EXPORTED_AT,
      app: { version: '0.1.0' },
      tasks: [],
    });
    expect(readBackupFile(content)).toEqual({
      ok: true,
      backup: { formatVersion: 2, exportedAt: EXPORTED_AT, appVersion: '0.1.0', tasks: [] },
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
      expect(result.backup.formatVersion).toBe(2);
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
    expect(readBackupFile(validFile({ formatVersion: 3 }))).toEqual({
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
        updatedAt: '2026-09-05T12:00:00.000Z',
      },
    ];

    expect(result).toEqual({
      ok: true,
      backup: {
        formatVersion: 2,
        exportedAt: '2026-09-13T18:30:00.000Z',
        appVersion: '0.1.0',
        tasks: expected,
      },
    });
  });
});

describe('arquivo de referência da versão 2', () => {
  it('é aceito sem migração e produz exatamente as tarefas esperadas', () => {
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
        updatedAt: '2026-09-08T17:45:00.000Z',
        completedAt: '2026-09-08T17:45:00.000Z',
      },
    ];

    expect(result).toEqual({
      ok: true,
      backup: {
        formatVersion: 2,
        exportedAt: '2026-09-14T18:30:00.000Z',
        appVersion: '0.2.0',
        tasks: expected,
      },
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
  it('possui exatamente a conversão da versão 1 para a versão 2', () => {
    expect(BACKUP_MIGRATIONS).toHaveLength(1);
  });
});
