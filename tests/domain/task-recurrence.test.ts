import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildNextOccurrence,
  isRecurrence,
  resolveNextScheduledAt,
  stepRecurrence,
  type Recurrence,
} from '@/domain/task-recurrence';
import { buildTask, sequentialIds } from '../support/task-fixtures';

const daily = (intervalDays: number, extra: Partial<Recurrence> = {}): Recurrence =>
  ({ frequency: 'DAILY', intervalDays, ...extra }) as Recurrence;

const weekly = (weekdays: number[], extra: Partial<Recurrence> = {}): Recurrence =>
  ({ frequency: 'WEEKLY', weekdays, ...extra }) as Recurrence;

const monthly = (dayOfMonth: number, extra: Partial<Recurrence> = {}): Recurrence =>
  ({ frequency: 'MONTHLY', dayOfMonth, ...extra }) as Recurrence;

const localInstant = (
  year: number,
  month: number,
  day: number,
  hours = 9,
  minutes = 0,
): string => new Date(year, month - 1, day, hours, minutes).toISOString();

describe('isRecurrence', () => {
  it('aceita regras dentro dos limites de cada frequência', () => {
    expect(isRecurrence(daily(1))).toBe(true);
    expect(isRecurrence(daily(365))).toBe(true);
    expect(isRecurrence(weekly([1]))).toBe(true);
    expect(isRecurrence(weekly([0, 1, 2, 3, 4, 5, 6]))).toBe(true);
    expect(isRecurrence(monthly(1))).toBe(true);
    expect(isRecurrence(monthly(31))).toBe(true);
    expect(isRecurrence(daily(1, { anchorAt: '2026-09-13T12:00:00.000Z' }))).toBe(true);
    expect(isRecurrence(daily(1, { until: '2026-12-31T23:59:00.000Z' }))).toBe(true);
  });

  it('recusa frequências desconhecidas', () => {
    expect(isRecurrence({ frequency: 'YEARLY', intervalDays: 1 })).toBe(false);
    expect(isRecurrence({ frequency: 'daily', intervalDays: 1 })).toBe(false);
    expect(isRecurrence({ intervalDays: 1 })).toBe(false);
    expect(isRecurrence(null)).toBe(false);
    expect(isRecurrence([])).toBe(false);
  });

  it.each<[unknown]>([[0], [-1], [1.5], [366], [Number.MAX_SAFE_INTEGER + 1], ['3'], [Number.NaN]])(
    'recusa intervalo diário %s',
    (intervalDays) => {
      expect(isRecurrence({ frequency: 'DAILY', intervalDays })).toBe(false);
    },
  );

  it('recusa conjunto semanal vazio, fora do intervalo, com repetição ou tipo inválido', () => {
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [] })).toBe(false);
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [0, 1, 2, 3, 4, 5, 6, 7] })).toBe(false);
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [7] })).toBe(false);
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [-1] })).toBe(false);
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [1, 1] })).toBe(false);
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: [1.5] })).toBe(false);
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: ['1'] })).toBe(false);
    expect(isRecurrence({ frequency: 'WEEKLY', weekdays: 1 })).toBe(false);
  });

  it.each<[unknown]>([[0], [-1], [1.5], [32], [Number.MAX_SAFE_INTEGER + 1], ['10'], [Number.NaN]])(
    'recusa dia do mês %s',
    (dayOfMonth) => {
      expect(isRecurrence({ frequency: 'MONTHLY', dayOfMonth })).toBe(false);
    },
  );

  it('recusa instantes delimitadores inválidos ou não representáveis', () => {
    expect(isRecurrence(daily(1, { anchorAt: 'ontem' }))).toBe(false);
    expect(isRecurrence(daily(1, { until: '2026-13-01T00:00:00.000Z' }))).toBe(false);
    expect(isRecurrence(daily(1, { until: '+275761-09-13T00:00:00.000Z' }))).toBe(false);
    expect(isRecurrence({ frequency: 'DAILY', intervalDays: 1, anchorAt: 123 })).toBe(false);
  });
});

describe('stepRecurrence', () => {
  it('avança o intervalo diário preservando a hora local', () => {
    const stepped = stepRecurrence(daily(1), new Date(2026, 0, 31, 9, 30));

    expect(stepped.getFullYear()).toBe(2026);
    expect(stepped.getMonth()).toBe(1);
    expect(stepped.getDate()).toBe(1);
    expect(stepped.getHours()).toBe(9);
    expect(stepped.getMinutes()).toBe(30);
  });

  it('preserva a fase do intervalo diário maior que um', () => {
    let instant = new Date(2026, 0, 1, 9);

    instant = stepRecurrence(daily(3), instant);
    expect(instant.getDate()).toBe(4);

    instant = stepRecurrence(daily(3), instant);
    expect(instant.getDate()).toBe(7);

    instant = stepRecurrence(daily(3), instant);
    expect(instant.getDate()).toBe(10);
  });

  it('vai para o próximo dia da semana presente na regra', () => {
    const monday = new Date(2026, 8, 14, 9);
    const stepped = stepRecurrence(weekly([1, 4]), monday);

    expect(stepped.getDay()).toBe(4);
    expect(stepped.getDate()).toBe(17);
    expect(stepped.getHours()).toBe(9);
  });

  it('com um único dia da semana avança uma semana', () => {
    const friday = new Date(2026, 8, 18, 9);
    const stepped = stepRecurrence(weekly([5]), friday);

    expect(stepped.getDay()).toBe(5);
    expect(stepped.getDate()).toBe(25);
    expect(stepped.getHours()).toBe(9);
  });

  it('ajusta o dia do mês inexistente para o último dia do mês', () => {
    const stepped = stepRecurrence(monthly(31), new Date(2026, 0, 31, 9));

    expect(stepped.getMonth()).toBe(1);
    expect(stepped.getDate()).toBe(28);
    expect(stepped.getHours()).toBe(9);
  });

  it('não torna permanente o ajuste do dia do mês', () => {
    const stepped = stepRecurrence(monthly(31), new Date(2026, 1, 28, 9));

    expect(stepped.getMonth()).toBe(2);
    expect(stepped.getDate()).toBe(31);
    expect(stepped.getHours()).toBe(9);
  });
});

describe('resolveNextScheduledAt', () => {
  it('avança um dia na recorrência diária', () => {
    const dueAt = localInstant(2026, 9, 15);
    const now = new Date(dueAt);

    expect(resolveNextScheduledAt(daily(1), dueAt, now)).toBe(localInstant(2026, 9, 16));
  });

  it('preserva a fase em ocorrências calculadas em sequência', () => {
    let dueAt = localInstant(2026, 9, 1);

    for (const day of [4, 7, 10]) {
      const next = resolveNextScheduledAt(daily(3), dueAt, new Date(dueAt));
      expect(next).toBe(localInstant(2026, 9, day));
      dueAt = next!;
    }
  });

  it('vai para o próximo dia do conjunto semanal', () => {
    const monday = localInstant(2026, 9, 14);

    expect(resolveNextScheduledAt(weekly([1, 4]), monday, new Date(monday))).toBe(
      localInstant(2026, 9, 17),
    );
  });

  it('fechar atrasado não desloca a série', () => {
    const monday = localInstant(2026, 9, 14);
    const wednesday = new Date(localInstant(2026, 9, 16));

    expect(resolveNextScheduledAt(weekly([1]), monday, wednesday)).toBe(
      localInstant(2026, 9, 21),
    );
  });

  it('pula as ocorrências perdidas e devolve o primeiro instante futuro', () => {
    const dueAt = localInstant(2026, 9, 5);
    const now = new Date(localInstant(2026, 9, 15));

    const next = resolveNextScheduledAt(daily(1), dueAt, now);

    expect(next).toBe(localInstant(2026, 9, 16));
  });

  it('encerra quando o próximo instante ultrapassa o limite', () => {
    const until = localInstant(2026, 9, 15);

    expect(resolveNextScheduledAt(daily(1, { until }), localInstant(2026, 9, 14), new Date(localInstant(2026, 9, 14)))).toBe(
      until,
    );
    expect(
      resolveNextScheduledAt(
        daily(1, { until: localInstant(2026, 9, 14) }),
        localInstant(2026, 9, 14),
        new Date(localInstant(2026, 9, 14)),
      ),
    ).toBeUndefined();
  });

  it('ancora em anchorAt quando o prazo desta ocorrência foi adiado', () => {
    const anchorAt = localInstant(2026, 9, 14);
    const dueAt = localInstant(2026, 9, 16);

    expect(resolveNextScheduledAt(weekly([1], { anchorAt }), dueAt, new Date(dueAt))).toBe(
      localInstant(2026, 9, 21),
    );
  });

  it('devolve undefined para prazo irreversível', () => {
    expect(resolveNextScheduledAt(daily(1), 'data-invalida', new Date())).toBeUndefined();
  });
});

describe('horário de verão', () => {
  const originalTimezone = process.env.TZ;

  beforeAll(() => {
    process.env.TZ = 'America/New_York';
  });

  afterAll(() => {
    if (originalTimezone === undefined) {
      delete process.env.TZ;
    } else {
      process.env.TZ = originalTimezone;
    }
  });

  it('preserva a hora local entre ocorrências', () => {
    const beforeDst = new Date(2026, 2, 7, 9);
    const next = resolveNextScheduledAt(daily(1), beforeDst.toISOString(), beforeDst);

    expect(next).toBe('2026-03-08T13:00:00.000Z');

    const nextDate = new Date(next!);
    expect(nextDate.getHours()).toBe(9);
    expect(nextDate.getTime() - beforeDst.getTime()).toBe(23 * 60 * 60 * 1000);
  });

  it('não descarta a ocorrência quando a hora local não existe', () => {
    const beforeDst = new Date(2026, 2, 7, 2, 30);
    const next = resolveNextScheduledAt(daily(1), beforeDst.toISOString(), beforeDst);

    expect(next).toBe('2026-03-08T07:30:00.000Z');
    expect(new Date(next!).getHours()).toBe(3);
    expect(resolveNextScheduledAt(daily(1), beforeDst.toISOString(), beforeDst)).toBe(next);
  });

  it('resolve a hora local ambígua uma única vez', () => {
    const beforeDst = new Date(2026, 9, 31, 1, 30);
    const next = resolveNextScheduledAt(daily(1), beforeDst.toISOString(), beforeDst);

    expect(next).toBe('2026-11-01T05:30:00.000Z');
    expect(new Date(next!).getHours()).toBe(1);
  });
});

describe('buildNextOccurrence', () => {
  const context = { now: new Date('2026-09-17T12:00:00.000Z'), generateId: sequentialIds('nova') };

  function closedOccurrence() {
    return buildTask({
      id: 'task-1',
      title: 'Enviar relatório',
      description: 'Consolidado semanal',
      requester: 'Ana',
      assignee: 'Bruno',
      status: 'DONE',
      priority: 'HIGH',
      dueAt: localInstant(2026, 9, 14),
      reminders: [
        { id: 'r-1', type: 'OFFSET', offsetMinutes: 60, processedFor: localInstant(2026, 9, 14) },
        { id: 'r-2', type: 'OFFSET', offsetMinutes: 1440 },
      ],
      tags: ['financeiro'],
      sourceUrl: 'https://example.com/relatorio',
      seriesId: 'serie-1',
      recurrence: weekly([1], { anchorAt: localInstant(2026, 9, 14) }),
      createdAt: '2026-09-01T10:00:00.000Z',
      updatedAt: '2026-09-16T10:00:00.000Z',
      completedAt: '2026-09-16T10:00:00.000Z',
    });
  }

  it('cria a próxima ocorrência a partir da fechada', () => {
    const closed = closedOccurrence();
    const scheduledAt = localInstant(2026, 9, 21);
    const next = buildNextOccurrence(closed, closed.recurrence!, scheduledAt, context);

    expect(next).toEqual({
      id: 'nova-1',
      title: 'Enviar relatório',
      description: 'Consolidado semanal',
      requester: 'Ana',
      assignee: 'Bruno',
      status: 'TODO',
      priority: 'HIGH',
      dueAt: scheduledAt,
      reminders: [
        { id: 'nova-2', type: 'OFFSET', offsetMinutes: 60 },
        { id: 'nova-3', type: 'OFFSET', offsetMinutes: 1440 },
      ],
      recurrence: { frequency: 'WEEKLY', weekdays: [1] },
      seriesId: 'serie-1',
      tags: ['financeiro'],
      sourceUrl: 'https://example.com/relatorio',
      createdAt: '2026-09-17T12:00:00.000Z',
      updatedAt: '2026-09-17T12:00:00.000Z',
    });
    expect(next.completedAt).toBeUndefined();
    expect(closed.reminders[0]!.processedFor).toBe(localInstant(2026, 9, 14));
  });

  it('preserva o limite da série sem transportar a ancoragem antiga', () => {
    const closed = closedOccurrence();
    const recurrence = daily(1, {
      anchorAt: localInstant(2026, 9, 14),
      until: localInstant(2026, 10, 1),
    });
    const next = buildNextOccurrence(closed, recurrence, localInstant(2026, 9, 21), context);

    expect(next.recurrence).toEqual({ frequency: 'DAILY', intervalDays: 1, until: localInstant(2026, 10, 1) });
  });

  it('recusa gerar sem identificador de série', () => {
    const closed = buildTask({ recurrence: daily(1) });

    expect(() => buildNextOccurrence(closed, daily(1), localInstant(2026, 9, 21), context)).toThrow(
      'A série precisa de um identificador para gerar a próxima ocorrência.',
    );
  });
});
