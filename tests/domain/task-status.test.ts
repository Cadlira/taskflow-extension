import { describe, expect, it } from 'vitest';
import { applyStatus, cancelTask, completeTask, reopenTask } from '@/domain/task-status';
import { buildTask, FIXED_NOW } from '../support/task-fixtures';

const NOW = FIXED_NOW.toISOString();

describe('transições de status', () => {
  it.each(['TODO', 'IN_PROGRESS'] as const)('conclui uma tarefa %s', (status) => {
    const result = completeTask(buildTask({ status }), FIXED_NOW);

    expect(result).toMatchObject({ status: 'DONE', completedAt: NOW, updatedAt: NOW });
  });

  it.each(['TODO', 'IN_PROGRESS'] as const)('reabre uma tarefa concluída para %s', (status) => {
    const done = buildTask({ status: 'DONE', completedAt: '2026-09-10T00:00:00.000Z' });

    const result = applyStatus(done, status, FIXED_NOW);

    expect(result.status).toBe(status);
    expect(result.updatedAt).toBe(NOW);
    expect('completedAt' in result).toBe(false);
  });

  it('reabre para TODO pela ação rápida', () => {
    const done = buildTask({ status: 'DONE', completedAt: '2026-09-10T00:00:00.000Z' });

    expect(reopenTask(done, FIXED_NOW)).toMatchObject({ status: 'TODO', updatedAt: NOW });
  });

  it.each([
    buildTask({ status: 'TODO' }),
    buildTask({ status: 'IN_PROGRESS' }),
    buildTask({ status: 'DONE', completedAt: '2026-09-10T00:00:00.000Z' }),
  ])('cancela a partir de $status mantendo completedAt vazio', (task) => {
    const result = cancelTask(task, FIXED_NOW);

    expect(result.status).toBe('CANCELLED');
    expect(result.updatedAt).toBe(NOW);
    expect('completedAt' in result).toBe(false);
  });

  it('não altera a tarefa quando o status já é o solicitado', () => {
    const done = buildTask({ status: 'DONE', completedAt: '2026-09-10T00:00:00.000Z' });

    expect(completeTask(done, FIXED_NOW)).toBe(done);
  });

  it('não modifica a instância original', () => {
    const task = buildTask();

    completeTask(task, FIXED_NOW);

    expect(task).toEqual(buildTask());
  });
});
