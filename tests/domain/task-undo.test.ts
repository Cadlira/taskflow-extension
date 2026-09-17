import { describe, expect, it } from 'vitest';
import type { Task } from '@/domain/task';
import { revertTasks, type RevertPlan } from '@/domain/task-undo';
import { buildTask, FIXED_NOW, hoursFrom } from '../support/task-fixtures';

const ACTION_AT = '2026-09-13T11:00:00.000Z';
const NOW_ISO = FIXED_NOW.toISOString();

const previous = buildTask({
  id: 'a',
  status: 'IN_PROGRESS',
  title: 'Antes',
  updatedAt: '2026-09-10T10:00:00.000Z',
});
const afterAction: Task = {
  ...previous,
  status: 'DONE',
  completedAt: ACTION_AT,
  updatedAt: ACTION_AT,
};
const other = buildTask({ id: 'b', title: 'Outra' });

function plan(overrides: Partial<RevertPlan> = {}): RevertPlan {
  return { kind: 'REVERT', previous, expectedUpdatedAt: ACTION_AT, ...overrides };
}

describe('revertTasks', () => {
  it('devolve a versão anterior com novo updatedAt sem alterar as demais tarefas', () => {
    const tasks = [other, afterAction];

    const outcome = revertTasks(tasks, plan(), FIXED_NOW);

    expect(outcome).toEqual({
      ok: true,
      tasks: [other, { ...previous, updatedAt: NOW_ISO }],
      reverted: { ...previous, updatedAt: NOW_ISO },
    });
    expect(tasks).toEqual([other, afterAction]);
  });

  it('remove a ocorrência gerada pela ação na mesma coleção', () => {
    const generated = buildTask({ id: 'gerada', updatedAt: ACTION_AT });
    const outcome = revertTasks(
      [afterAction, other, generated],
      plan({ generated: { id: 'gerada', updatedAt: ACTION_AT } }),
      FIXED_NOW,
    );

    expect(outcome.ok && outcome.tasks.map((task) => task.id)).toEqual(['a', 'b']);
  });

  it('recusa com CHANGED quando a tarefa tem outro updatedAt', () => {
    const edited = { ...afterAction, title: 'Editada', updatedAt: '2026-09-13T11:30:00.000Z' };
    const tasks = [edited];

    expect(revertTasks(tasks, plan(), FIXED_NOW)).toEqual({ ok: false, reason: 'CHANGED' });
    expect(tasks).toEqual([edited]);
  });

  it('recusa com REMOVED quando a tarefa não existe mais', () => {
    expect(revertTasks([other], plan(), FIXED_NOW)).toEqual({ ok: false, reason: 'REMOVED' });
  });

  it('recusa com GENERATED_CHANGED quando a ocorrência gerada foi alterada', () => {
    const generated = buildTask({ id: 'gerada', updatedAt: '2026-09-13T11:45:00.000Z' });
    const tasks = [afterAction, generated];

    expect(
      revertTasks(tasks, plan({ generated: { id: 'gerada', updatedAt: ACTION_AT } }), FIXED_NOW),
    ).toEqual({ ok: false, reason: 'GENERATED_CHANGED' });
    expect(tasks).toEqual([afterAction, generated]);
  });

  it('recusa com GENERATED_CHANGED quando a ocorrência gerada foi removida', () => {
    expect(
      revertTasks(
        [afterAction],
        plan({ generated: { id: 'gerada', updatedAt: ACTION_AT } }),
        FIXED_NOW,
      ),
    ).toEqual({ ok: false, reason: 'GENERATED_CHANGED' });
  });

  it('não é bloqueado por processedFor registrado sem alterar updatedAt', () => {
    const due = hoursFrom(FIXED_NOW, 2);
    const withReminder = { ...previous, dueAt: due, reminders: [] };
    const processed: Task = {
      ...afterAction,
      dueAt: due,
      reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 60, processedFor: hoursFrom(FIXED_NOW, 1) }],
    };

    const outcome = revertTasks([processed], plan({ previous: withReminder }), FIXED_NOW);

    expect(outcome.ok).toBe(true);
  });

  it('marca como processado o lembrete vencido entre a ação e o desfazer e mantém o futuro pendente', () => {
    const due = hoursFrom(FIXED_NOW, 1);
    const before: Task = {
      ...previous,
      dueAt: due,
      reminders: [
        { id: 'vencido', type: 'OFFSET', offsetMinutes: 90 },
        { id: 'futuro', type: 'OFFSET', offsetMinutes: 30 },
      ],
    };
    const current: Task = { ...afterAction, dueAt: due, reminders: before.reminders };

    const outcome = revertTasks([current], plan({ previous: before }), FIXED_NOW);

    expect(outcome.ok && outcome.reverted.reminders).toEqual([
      {
        id: 'vencido',
        type: 'OFFSET',
        offsetMinutes: 90,
        processedFor: hoursFrom(FIXED_NOW, -0.5),
      },
      { id: 'futuro', type: 'OFFSET', offsetMinutes: 30 },
    ]);
  });
});
