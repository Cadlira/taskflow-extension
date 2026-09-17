import { describe, expect, it } from 'vitest';
import {
  addToTrash,
  pruneTrash,
  sortTrashForDisplay,
  TRASH_MAX_ITEMS,
  TRASH_RETENTION_DAYS,
  type TrashItem,
} from '@/domain/task-trash';
import { buildTask, FIXED_NOW } from '../support/task-fixtures';

const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): string {
  return new Date(FIXED_NOW.getTime() - days * DAY_MS).toISOString();
}

function item(id: string, deletedAt: string): TrashItem {
  return { deletedAt, task: buildTask({ id, title: `Tarefa ${id}` }) };
}

describe('constantes da lixeira', () => {
  it('guarda por 30 dias e no máximo 100 itens', () => {
    expect(TRASH_RETENTION_DAYS).toBe(30);
    expect(TRASH_MAX_ITEMS).toBe(100);
  });
});

describe('pruneTrash', () => {
  it('mantém item com 29 dias e descarta item com 31 dias', () => {
    const recent = item('recente', daysAgo(29));
    const expired = item('vencido', daysAgo(31));

    expect(pruneTrash([recent, expired], FIXED_NOW)).toEqual([recent]);
  });

  it('mantém item com exatamente 30 dias', () => {
    const limit = item('limite', daysAgo(30));

    expect(pruneTrash([limit], FIXED_NOW)).toEqual([limit]);
  });

  it('mantém item com deletedAt no futuro', () => {
    const future = item('futuro', new Date(FIXED_NOW.getTime() + DAY_MS).toISOString());

    expect(pruneTrash([future], FIXED_NOW)).toEqual([future]);
  });

  it('retorna a mesma instância quando nada venceu', () => {
    const items = [item('a', daysAgo(1)), item('b', daysAgo(2))];

    expect(pruneTrash(items, FIXED_NOW)).toBe(items);
  });
});

describe('addToTrash', () => {
  it('insere a tarefa com o instante da exclusão e todos os campos', () => {
    const task = buildTask({
      id: 'nova',
      dueAt: '2026-09-20T10:00:00.000Z',
      reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }],
      subtasks: [{ id: 's', title: 'Passo', done: true }],
      seriesId: 'serie',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
    });

    expect(addToTrash([], task, FIXED_NOW)).toEqual([
      { deletedAt: FIXED_NOW.toISOString(), task },
    ]);
  });

  it('descarta itens vencidos ao inserir', () => {
    const expired = item('vencido', daysAgo(31));
    const result = addToTrash([expired], buildTask({ id: 'nova' }), FIXED_NOW);

    expect(result.map((entry) => entry.task.id)).toEqual(['nova']);
  });

  it('com 100 itens descarta o de exclusão mais antiga', () => {
    const items = Array.from({ length: TRASH_MAX_ITEMS }, (_, index) =>
      item(`t-${index}`, new Date(FIXED_NOW.getTime() - (index + 1) * 60_000).toISOString()),
    );

    const result = addToTrash(items, buildTask({ id: 'nova' }), FIXED_NOW);

    expect(result).toHaveLength(TRASH_MAX_ITEMS);
    expect(result[0]?.task.id).toBe('nova');
    expect(result.map((entry) => entry.task.id)).not.toContain(`t-${TRASH_MAX_ITEMS - 1}`);
    expect(result.map((entry) => entry.task.id)).toContain(`t-${TRASH_MAX_ITEMS - 2}`);
  });

  it('substitui item anterior com o mesmo identificador', () => {
    const previous = item('a', daysAgo(3));
    const result = addToTrash([previous], buildTask({ id: 'a', title: 'Nova versão' }), FIXED_NOW);

    expect(result).toEqual([
      { deletedAt: FIXED_NOW.toISOString(), task: buildTask({ id: 'a', title: 'Nova versão' }) },
    ]);
  });
});

describe('sortTrashForDisplay', () => {
  it('ordena do mais recentemente excluído para o mais antigo sem alterar a entrada', () => {
    const items = [item('antigo', daysAgo(5)), item('recente', daysAgo(1)), item('meio', daysAgo(3))];

    expect(sortTrashForDisplay(items).map((entry) => entry.task.id)).toEqual([
      'recente',
      'meio',
      'antigo',
    ]);
    expect(items.map((entry) => entry.task.id)).toEqual(['antigo', 'recente', 'meio']);
  });
});
