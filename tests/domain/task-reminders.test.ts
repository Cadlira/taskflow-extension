import { describe, expect, it } from 'vitest';
import {
  buildReminders,
  canDeliverReminder,
  claimReminderOccurrence,
  findReminderOccurrence,
  isReminderCollectionValid,
  isReminderPending,
  isRepresentableInstant,
  planReminders,
  REMINDER_DELAY_TOLERANCE_MS,
  resolveReminderTriggerAt,
  settleElapsedReminders,
} from '@/domain/task-reminders';
import { buildTask, FIXED_NOW, hoursFrom, sequentialIds } from '../support/task-fixtures';

const DUE_AT = hoursFrom(FIXED_NOW, 2);
const MINUTE = 60_000;
const UNREPRESENTABLE_OFFSET = Number.MAX_SAFE_INTEGER;

describe('buildReminders', () => {
  it('cria identificadores novos para deslocamentos e horários inéditos', () => {
    const at = hoursFrom(FIXED_NOW, 1);

    expect(
      buildReminders(
        [
          { type: 'OFFSET', offsetMinutes: 15 },
          { type: 'AT', at },
        ],
        [],
        sequentialIds('r'),
      ),
    ).toEqual([
      { id: 'r-1', type: 'OFFSET', offsetMinutes: 15 },
      { id: 'r-2', type: 'AT', at },
    ]);
  });

  it('preserva identidade e ocorrência processada dos lembretes existentes', () => {
    const at = hoursFrom(FIXED_NOW, 1);
    const existing = [
      { id: 'r-15', type: 'OFFSET' as const, offsetMinutes: 15, processedFor: DUE_AT },
      { id: 'r-at', type: 'AT' as const, at },
    ];

    expect(
      buildReminders(
        [
          { id: 'r-15', type: 'OFFSET', offsetMinutes: 15 },
          { id: 'r-at', type: 'AT', at },
          { type: 'OFFSET', offsetMinutes: 60 },
        ],
        existing,
        sequentialIds('novo'),
      ),
    ).toEqual([
      { id: 'r-15', type: 'OFFSET', offsetMinutes: 15, processedFor: DUE_AT },
      { id: 'r-at', type: 'AT', at },
      { id: 'novo-1', type: 'OFFSET', offsetMinutes: 60 },
    ]);
  });

  it('remove a ocorrência processada quando a configuração muda para outro tipo', () => {
    const existing = [{ id: 'r-15', type: 'OFFSET' as const, offsetMinutes: 15 }];

    expect(
      buildReminders([{ id: 'r-15', type: 'AT', at: DUE_AT }], existing, sequentialIds()),
    ).toEqual([{ id: 'r-15', type: 'AT', at: DUE_AT }]);
  });

  it('retorna lista vazia sem configurações', () => {
    expect(
      buildReminders(
        [],
        [{ id: 'x', type: 'OFFSET', offsetMinutes: 15 }],
        sequentialIds(),
      ),
    ).toEqual([]);
  });
});

describe('resolveReminderTriggerAt', () => {
  it.each([0, 15, 90, 1440])(
    'calcula deslocamento arbitrário de %i minutos antes do prazo',
    (offsetMinutes) => {
      expect(
        resolveReminderTriggerAt({ id: 'r', type: 'OFFSET', offsetMinutes }, DUE_AT),
      ).toBe(Date.parse(DUE_AT) - offsetMinutes * MINUTE);
    },
  );

  it('usa o instante absoluto sem relação com o prazo', () => {
    const at = '2026-09-18T09:30:00.000Z';

    expect(resolveReminderTriggerAt({ id: 'r', type: 'AT', at }, DUE_AT)).toBe(Date.parse(at));
  });

  it('trata 1440 minutos como 24 horas exatas mesmo atravessando fuso', () => {
    const beforeDst = '2026-11-01T12:00:00.000Z';

    expect(
      resolveReminderTriggerAt({ id: 'r', type: 'OFFSET', offsetMinutes: 1440 }, beforeDst),
    ).toBe(Date.parse(beforeDst) - 24 * 60 * MINUTE);
  });
});

describe('isReminderPending', () => {
  it('considera pendente enquanto o instante processado difere do efetivo', () => {
    const pending = { id: 'r', type: 'OFFSET' as const, offsetMinutes: 15 };

    expect(isReminderPending(pending, DUE_AT)).toBe(true);
    expect(isReminderPending({ ...pending, processedFor: DUE_AT }, DUE_AT)).toBe(true);
    expect(
      isReminderPending(
        { id: 'r', type: 'OFFSET', offsetMinutes: 15, processedFor: '2026-09-13T13:45:00.000Z' },
        DUE_AT,
      ),
    ).toBe(false);
  });

  it('volta a considerar pendente quando o prazo muda', () => {
    const reminder = {
      id: 'r',
      type: 'OFFSET' as const,
      offsetMinutes: 15,
      processedFor: '2026-09-13T13:45:00.000Z',
    };

    expect(isReminderPending(reminder, DUE_AT)).toBe(false);
    expect(isReminderPending(reminder, hoursFrom(FIXED_NOW, 3))).toBe(true);
  });
});

describe('planReminders', () => {
  it('não planeja lembretes para tarefa sem prazo', () => {
    const task = buildTask({ reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }] });

    expect(planReminders(task, FIXED_NOW)).toEqual([]);
  });

  it('planeja somente ocorrências futuras e pendentes', () => {
    const at = hoursFrom(FIXED_NOW, 1);
    const task = buildTask({
      dueAt: DUE_AT,
      reminders: [
        { id: 'no-prazo', type: 'OFFSET', offsetMinutes: 0 },
        {
          id: '1h',
          type: 'OFFSET',
          offsetMinutes: 60,
          processedFor: new Date(Date.parse(DUE_AT) - 60 * MINUTE).toISOString(),
        },
        { id: '15m', type: 'OFFSET', offsetMinutes: 15 },
        { id: 'abs', type: 'AT', at, processedFor: at },
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
      reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 0 }],
    });

    expect(planReminders(task, FIXED_NOW)).toEqual([]);
  });

  it.each(['DONE', 'CANCELLED'] as const)('não planeja lembretes de tarefa %s', (status) => {
    const task = buildTask({
      status,
      dueAt: DUE_AT,
      reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 0 }],
    });

    expect(planReminders(task, FIXED_NOW)).toEqual([]);
  });
});

describe('settleElapsedReminders', () => {
  it('marca ocorrências vencidas com o instante efetivo e mantém as futuras pendentes', () => {
    const task = buildTask({
      dueAt: DUE_AT,
      reminders: [
        { id: 'futuro', type: 'OFFSET', offsetMinutes: 60 },
        { id: 'vencido', type: 'OFFSET', offsetMinutes: 1440 },
        { id: 'absoluto', type: 'AT', at: hoursFrom(FIXED_NOW, -1) },
      ],
    });

    expect(settleElapsedReminders(task, FIXED_NOW).reminders).toEqual([
      { id: 'futuro', type: 'OFFSET', offsetMinutes: 60 },
      {
        id: 'vencido',
        type: 'OFFSET',
        offsetMinutes: 1440,
        processedFor: new Date(Date.parse(DUE_AT) - 1440 * MINUTE).toISOString(),
      },
      {
        id: 'absoluto',
        type: 'AT',
        at: hoursFrom(FIXED_NOW, -1),
        processedFor: hoursFrom(FIXED_NOW, -1),
      },
    ]);
  });

  it('retorna a mesma instância quando nada está vencido ou já foi processado', () => {
    const future = buildTask({ dueAt: DUE_AT, reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }] });
    const processed = buildTask({
      dueAt: DUE_AT,
      reminders: [
        { id: 'r', type: 'OFFSET', offsetMinutes: 1440, processedFor: '2026-09-12T14:00:00.000Z' },
      ],
    });
    const noDueDate = buildTask();

    expect(settleElapsedReminders(future, FIXED_NOW)).toBe(future);
    expect(settleElapsedReminders(processed, FIXED_NOW)).toBe(processed);
    expect(settleElapsedReminders(noDueDate, FIXED_NOW)).toBe(noDueDate);
  });

  it('liquida a ocorrência limite exatamente no instante atual', () => {
    const task = buildTask({
      dueAt: FIXED_NOW.toISOString(),
      reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 0 }],
    });

    expect(settleElapsedReminders(task, FIXED_NOW).reminders).toEqual([
      { id: 'r', type: 'OFFSET', offsetMinutes: 0, processedFor: FIXED_NOW.toISOString() },
    ]);
  });
});

describe('findReminderOccurrence', () => {
  const reminder = { id: 'r', type: 'OFFSET' as const, offsetMinutes: 15 };
  const task = buildTask({ dueAt: DUE_AT, reminders: [reminder] });
  const scheduledTime = resolveReminderTriggerAt(reminder, DUE_AT);

  it('entrega alarme correspondente a tarefa ativa e ocorrência pendente', () => {
    expect(findReminderOccurrence(task, 'r', scheduledTime)).toEqual({ reminder, triggerAt: scheduledTime });
    expect(findReminderOccurrence(task, 'r', scheduledTime + 30_000)).toEqual({
      reminder,
      triggerAt: scheduledTime,
    });
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
      { ...task, reminders: [{ ...reminder, processedFor: new Date(scheduledTime).toISOString() }] },
      'r',
      scheduledTime,
    ],
  ])('descarta alarme de %s', (_label, candidate, reminderId, time) => {
    expect(findReminderOccurrence(candidate, reminderId, time)).toBeUndefined();
  });
});

describe('canDeliverReminder', () => {
  const triggerAt = Date.parse(DUE_AT);

  it('permite entrega até cinco minutos depois do instante efetivo', () => {
    expect(canDeliverReminder(triggerAt, new Date(triggerAt))).toBe(true);
    expect(canDeliverReminder(triggerAt, new Date(triggerAt + REMINDER_DELAY_TOLERANCE_MS))).toBe(
      true,
    );
  });

  it('recusa entrega além da tolerância', () => {
    expect(
      canDeliverReminder(triggerAt, new Date(triggerAt + REMINDER_DELAY_TOLERANCE_MS + 1)),
    ).toBe(false);
  });
});

describe('isRepresentableInstant', () => {
  it('aceita os limites exatos do intervalo de Date', () => {
    expect(isRepresentableInstant(8_640_000_000_000_000)).toBe(true);
    expect(isRepresentableInstant(-8_640_000_000_000_000)).toBe(true);
  });

  it('recusa instantes além do limite e valores não finitos', () => {
    expect(isRepresentableInstant(8_640_000_000_000_001)).toBe(false);
    expect(isRepresentableInstant(UNREPRESENTABLE_OFFSET * MINUTE)).toBe(false);
    expect(isRepresentableInstant(Number.NaN)).toBe(false);
    expect(isRepresentableInstant(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('isReminderCollectionValid', () => {
  it('aceita coleção vazia sem prazo e coleção válida com prazo', () => {
    expect(isReminderCollectionValid(buildTask())).toBe(true);
    expect(
      isReminderCollectionValid(
        buildTask({
          dueAt: DUE_AT,
          reminders: [
            { id: 'r1', type: 'OFFSET', offsetMinutes: 15 },
            { id: 'r2', type: 'AT', at: hoursFrom(FIXED_NOW, 1) },
          ],
        }),
      ),
    ).toBe(true);
  });

  it.each([
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
    ],
    [
      'lembretes sem prazo',
      buildTask({ reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }] }),
    ],
    [
      'identificador de lembrete repetido',
      buildTask({
        dueAt: DUE_AT,
        reminders: [
          { id: 'r', type: 'OFFSET', offsetMinutes: 15 },
          { id: 'r', type: 'OFFSET', offsetMinutes: 60 },
        ],
      }),
    ],
    [
      'instante efetivo repetido',
      buildTask({
        dueAt: DUE_AT,
        reminders: [
          { id: 'r1', type: 'OFFSET', offsetMinutes: 15 },
          { id: 'r2', type: 'OFFSET', offsetMinutes: 15 },
        ],
      }),
    ],
    [
      'horário absoluto posterior ao prazo',
      buildTask({
        dueAt: DUE_AT,
        reminders: [{ id: 'r', type: 'AT', at: hoursFrom(new Date(DUE_AT), 1) }],
      }),
    ],
    [
      'instante efetivo fora do intervalo de datas',
      buildTask({
        dueAt: DUE_AT,
        reminders: [
          { id: 'r', type: 'OFFSET', offsetMinutes: UNREPRESENTABLE_OFFSET },
        ],
      }),
    ],
  ])('recusa %s', (_label, task) => {
    expect(isReminderCollectionValid(task)).toBe(false);
  });

  it('não formata nem lança para lembrete com instante não representável', () => {
    const reminder = {
      id: 'r',
      type: 'OFFSET' as const,
      offsetMinutes: UNREPRESENTABLE_OFFSET,
    };
    const task = buildTask({ dueAt: DUE_AT, reminders: [reminder] });

    expect(isReminderPending(reminder, DUE_AT)).toBe(false);
    expect(planReminders(task, FIXED_NOW)).toEqual([]);
    expect(settleElapsedReminders(task, FIXED_NOW)).toBe(task);
    expect(findReminderOccurrence(task, 'r', Date.parse(DUE_AT))).toBeUndefined();
    expect(
      claimReminderOccurrence(task, 'r', '2026-09-13T14:00:00.000Z'),
    ).toBeUndefined();
  });
});

describe('claimReminderOccurrence', () => {
  const reminder = { id: 'r', type: 'OFFSET' as const, offsetMinutes: 15 };
  const task = buildTask({ dueAt: DUE_AT, reminders: [reminder] });
  const processedFor = new Date(resolveReminderTriggerAt(reminder, DUE_AT)).toISOString();

  it('registra o instante efetivo quando a ocorrência ainda está pendente', () => {
    const claimed = claimReminderOccurrence(task, 'r', processedFor);

    expect(claimed?.reminders).toEqual([{ ...reminder, processedFor }]);
    expect(task.reminders).toEqual([reminder]);
  });

  it('recusa ocorrência repetida', () => {
    const already = claimReminderOccurrence(task, 'r', processedFor)!;

    expect(claimReminderOccurrence(already, 'r', processedFor)).toBeUndefined();
  });

  it('recusa instante diferente do efetivo atual', () => {
    expect(claimReminderOccurrence(task, 'r', hoursFrom(FIXED_NOW, 3))).toBeUndefined();
  });

  it.each(['DONE', 'CANCELLED'] as const)('recusa tarefa %s', (status) => {
    expect(claimReminderOccurrence({ ...task, status }, 'r', processedFor)).toBeUndefined();
  });

  it('recusa lembrete inexistente e tarefa sem prazo', () => {
    expect(claimReminderOccurrence(task, 'outro', processedFor)).toBeUndefined();
    expect(claimReminderOccurrence(buildTask({ reminders: [reminder] }), 'r', processedFor)).toBeUndefined();
  });
});
