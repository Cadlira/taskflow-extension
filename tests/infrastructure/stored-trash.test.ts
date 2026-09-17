import { describe, expect, it } from 'vitest';
import { TaskStorageError } from '@/application/task-repository';
import {
  decodeStoredTrash,
  encodeStoredTrash,
} from '@/infrastructure/storage/stored-trash';
import { buildTask } from '../support/task-fixtures';

const DELETED_AT = '2026-09-12T08:00:00.000Z';

function expectIncompatible(value: unknown): void {
  let caught: unknown;

  try {
    decodeStoredTrash(value);
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(TaskStorageError);
  expect((caught as TaskStorageError).reason).toBe('INCOMPATIBLE_DATA');
  expect((caught as TaskStorageError).message).toContain('lixeira');
}

describe('codec da lixeira', () => {
  it('trata chave ausente como lixeira vazia', () => {
    expect(decodeStoredTrash(undefined)).toEqual([]);
    expect(decodeStoredTrash(null)).toEqual([]);
  });

  it('lê envelope válido preservando todos os campos da tarefa', () => {
    const task = buildTask({
      dueAt: '2026-09-20T10:00:00.000Z',
      reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15, processedFor: '2026-09-20T09:45:00.000Z' }],
      subtasks: [{ id: 's', title: 'Passo', done: true }],
      seriesId: 'serie',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
      tags: ['casa'],
    });
    const items = [{ deletedAt: DELETED_AT, task }];

    expect(decodeStoredTrash(encodeStoredTrash(items))).toEqual(items);
    expect(encodeStoredTrash(items)).toEqual({ schemaVersion: 4, items });
  });

  it('migra tarefas de versões anteriores pela mesma cadeia da coleção', () => {
    const legacy = { ...buildTask(), subtasks: undefined };

    expect(
      decodeStoredTrash({ schemaVersion: 3, items: [{ deletedAt: DELETED_AT, task: legacy }] }),
    ).toEqual([{ deletedAt: DELETED_AT, task: buildTask() }]);
  });

  it.each([
    ['versão desconhecida', { schemaVersion: 5, items: [] }],
    ['envelope que não é objeto', 'lixeira'],
    ['itens ausentes', { schemaVersion: 4 }],
    ['item que não é objeto', { schemaVersion: 4, items: ['x'] }],
  ])('recusa %s como INCOMPATIBLE_DATA', (_label, value) => {
    expectIncompatible(value);
  });

  it.each([undefined, '', 'ontem', 42])('recusa deletedAt inválido (%s)', (deletedAt) => {
    expectIncompatible({ schemaVersion: 4, items: [{ deletedAt, task: buildTask() }] });
  });

  it('recusa tarefa inválida', () => {
    expectIncompatible({
      schemaVersion: 4,
      items: [{ deletedAt: DELETED_AT, task: { ...buildTask(), status: 'ARQUIVADA' } }],
    });
  });

  it('recusa identificadores de tarefa repetidos', () => {
    expectIncompatible({
      schemaVersion: 4,
      items: [
        { deletedAt: DELETED_AT, task: buildTask() },
        { deletedAt: DELETED_AT, task: buildTask() },
      ],
    });
  });
});
