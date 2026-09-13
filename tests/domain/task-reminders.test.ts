import { describe, expect, it } from 'vitest';
import {
  buildReminders,
  findDeliverableReminder,
  markReminderTriggered,
  planReminders,
  reminderTriggerAt,
  settleElapsedReminders,
} from '@/domain/task-reminders';
import { buildTask, FIXED_NOW, hoursFrom, sequentialIds } from '../support/task-fixtures';

const DUE_AT = hoursFrom(FIXED_NOW, 2);
const MINUTE = 60_000;

describe('buildReminders', () => {
  it('mantém uma única configuração por deslocamento, ordenada', () => {
    expect(buildReminders([1440, 0, 15, 0, 60, 15], [], sequentialIds('r'))).toEqual([
      { id: 'r-1', offsetMinutes: 0 },
      { id: 'r-2', offsetMinutes: 15 },
      { id: 'r-3', offsetMinutes: 60 },
      { id: 'r-4', offsetMinutes: 1440 },
    ]);
  });

  it('retorna lista vazia sem deslocamentos', () => {
    expect(buildReminders([], [{ id: 'x', offsetMinutes: 15 }], sequentialIds())).toEqual([]);
  });
});

describe('reminderTriggerAt', () => {
  it.each([
    [0, 0],
    [15, 15 * MINUTE],
    [60, 60 * MINUTE],
    [1440, 1440 * MINUTE],
  ])('calcula %i minutos antes do prazo', (offset, delta) => {
    expect(reminderTriggerAt(DUE_AT, offset)).toBe(Date.parse(DUE_AT) - delta);
  });
});

describe('planReminders', () => {
  it('não planeja lembretes para tarefa sem prazo', () => {
    const task = buildTask({ reminders: [{ id: 'r', offsetMinutes: 15 }] });

    expect(planReminders(task, FIXED_NOW)).toEqual([]);
  });

  it('planeja somente ocorrências futuras e pendentes', () => {
    const task = buildTask({
      dueAt: DUE_AT,
      reminders: [
        { id: 'no-prazo', offsetMinutes: 0 },
        { id: '1h', offsetMinutes: 60, lastTriggeredFor: DUE_AT },
        { id: '15m', offsetMinutes: 15, lastTriggeredFor: '2026-01-01T00:00:00.000Z' },
        { id: '1d', offsetMinutes: 1440 },
      ],
    });

    expect(planReminders(task, FIXED_NOW)).toEqual([
      { taskId: task.id, reminderId: 'no-prazo', triggerAt: Date.parse(DUE_AT) },
      { taskId: task.id, reminderId: '15m', triggerAt: Date.parse(DUE_AT) - 15 * MINUTE },
    ]);
  });

  it('não planeja ocorrência exatamente no instante atual', () => {
    const task = buildTask({
      dueAt: FIXED_NOW.toISOString(),
      reminders: [{ id: 'r', offsetMinutes: 0 }],
    });

    expect(planReminders(task, FIXED_NOW)).toEqual([]);
  });

  it.each(['DONE', 'CANCELLED'] as const)('não planeja lembretes de tarefa %s', (status) => {
    const task = buildTask({ status, dueAt: DUE_AT, reminders: [{ id: 'r', offsetMinutes: 0 }] });

    expect(planReminders(task, FIXED_NOW)).toEqual([]);
  });
});

describe('settleElapsedReminders', () => {
  it('marca ocorrências vencidas como processadas e mantém as futuras pendentes', () => {
    const task = buildTask({
      dueAt: DUE_AT,
      reminders: [
        { id: 'futuro', offsetMinutes: 60 },
        { id: 'vencido', offsetMinutes: 1440 },
      ],
    });

    expect(settleElapsedReminders(task, FIXED_NOW).reminders).toEqual([
      { id: 'futuro', offsetMinutes: 60 },
      { id: 'vencido', offsetMinutes: 1440, lastTriggeredFor: DUE_AT },
    ]);
  });

  it('retorna a mesma instância quando nada está vencido ou já foi processado', () => {
    const future = buildTask({ dueAt: DUE_AT, reminders: [{ id: 'r', offsetMinutes: 15 }] });
    const processed = buildTask({
      dueAt: DUE_AT,
      reminders: [{ id: 'r', offsetMinutes: 1440, lastTriggeredFor: DUE_AT }],
    });
    const noDueDate = buildTask();

    expect(settleElapsedReminders(future, FIXED_NOW)).toBe(future);
    expect(settleElapsedReminders(processed, FIXED_NOW)).toBe(processed);
    expect(settleElapsedReminders(noDueDate, FIXED_NOW)).toBe(noDueDate);
  });

  it('volta a considerar pendente um lembrete processado para prazo anterior', () => {
    const task = buildTask({
      dueAt: DUE_AT,
      reminders: [{ id: 'r', offsetMinutes: 15, lastTriggeredFor: '2026-09-01T00:00:00.000Z' }],
    });

    expect(settleElapsedReminders(task, FIXED_NOW)).toBe(task);
    expect(planReminders(task, FIXED_NOW)).toHaveLength(1);
  });
});

describe('findDeliverableReminder', () => {
  const reminder = { id: 'r', offsetMinutes: 15 };
  const task = buildTask({ dueAt: DUE_AT, reminders: [reminder] });
  const scheduledTime = reminderTriggerAt(DUE_AT, 15);

  it('entrega alarme correspondente a tarefa ativa e ocorrência pendente', () => {
    expect(findDeliverableReminder(task, 'r', scheduledTime)).toEqual(reminder);
    expect(findDeliverableReminder(task, 'r', scheduledTime + 30_000)).toEqual(reminder);
  });

  it.each([
    ['tarefa inexistente', undefined, 'r', scheduledTime],
    ['tarefa concluída', { ...task, status: 'DONE' as const }, 'r', scheduledTime],
    ['tarefa cancelada', { ...task, status: 'CANCELLED' as const }, 'r', scheduledTime],
    ['lembrete removido', task, 'outro', scheduledTime],
    ['prazo alterado', task, 'r', scheduledTime - 2 * 60 * MINUTE],
    ['prazo removido', buildTask({ reminders: [reminder] }), 'r', scheduledTime],
    [
      'ocorrência já processada',
      { ...task, reminders: [{ ...reminder, lastTriggeredFor: DUE_AT }] },
      'r',
      scheduledTime,
    ],
  ])('descarta alarme de %s', (_label, candidate, reminderId, time) => {
    expect(findDeliverableReminder(candidate, reminderId, time)).toBeUndefined();
  });
});

describe('markReminderTriggered', () => {
  it('registra a ocorrência somente do lembrete informado', () => {
    const task = buildTask({
      dueAt: DUE_AT,
      reminders: [
        { id: 'a', offsetMinutes: 15 },
        { id: 'b', offsetMinutes: 60 },
      ],
    });

    expect(markReminderTriggered(task, 'a').reminders).toEqual([
      { id: 'a', offsetMinutes: 15, lastTriggeredFor: DUE_AT },
      { id: 'b', offsetMinutes: 60 },
    ]);
  });
});
