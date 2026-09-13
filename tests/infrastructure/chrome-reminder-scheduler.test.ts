import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import {
  ChromeReminderScheduler,
  parseReminderAlarmName,
  reminderAlarmName,
} from '@/infrastructure/chrome/chrome-reminder-scheduler';

const T1 = Date.parse('2026-09-20T10:00:00.000Z');
const T2 = Date.parse('2026-09-21T10:00:00.000Z');

async function alarmSnapshot() {
  return (await fakeBrowser.alarms.getAll())
    .map(({ name, scheduledTime }) => ({ name, scheduledTime }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

describe('nomes de alarme', () => {
  it('gera nome determinístico e o interpreta de volta', () => {
    const name = reminderAlarmName({ taskId: 'task-a', reminderId: 'rem-1' });

    expect(name).toBe('taskflow:reminder:task-a:rem-1');
    expect(parseReminderAlarmName(name)).toEqual({ taskId: 'task-a', reminderId: 'rem-1' });
  });

  it.each([
    'outro:alarme',
    'taskflow:reminder:',
    'taskflow:reminder:task',
    'taskflow:reminder:a:b:c',
  ])('ignora nome não gerenciado %s', (name) => {
    expect(parseReminderAlarmName(name)).toBeUndefined();
  });
});

describe('ChromeReminderScheduler', () => {
  let scheduler: ChromeReminderScheduler;

  beforeEach(() => {
    fakeBrowser.reset();
    scheduler = new ChromeReminderScheduler();
  });

  describe('reconcileTask', () => {
    it('cria alarmes nomeados para os instantes planejados', async () => {
      await scheduler.reconcileTask('a', [
        { taskId: 'a', reminderId: 'r1', triggerAt: T1 },
        { taskId: 'a', reminderId: 'r2', triggerAt: T2 },
      ]);

      expect(await alarmSnapshot()).toEqual([
        { name: 'taskflow:reminder:a:r1', scheduledTime: T1 },
        { name: 'taskflow:reminder:a:r2', scheduledTime: T2 },
      ]);
    });

    it('é idempotente e não recria alarmes já corretos', async () => {
      const planned = [{ taskId: 'a', reminderId: 'r1', triggerAt: T1 }];
      await scheduler.reconcileTask('a', planned);
      const create = vi.spyOn(fakeBrowser.alarms, 'create');
      const clear = vi.spyOn(fakeBrowser.alarms, 'clear');

      await scheduler.reconcileTask('a', planned);

      expect(create).not.toHaveBeenCalled();
      expect(clear).not.toHaveBeenCalled();
      expect(await alarmSnapshot()).toHaveLength(1);
    });

    it('reprograma alarme cujo instante mudou e remove lembretes não planejados', async () => {
      await scheduler.reconcileTask('a', [
        { taskId: 'a', reminderId: 'r1', triggerAt: T1 },
        { taskId: 'a', reminderId: 'r2', triggerAt: T1 },
      ]);

      await scheduler.reconcileTask('a', [{ taskId: 'a', reminderId: 'r1', triggerAt: T2 }]);

      expect(await alarmSnapshot()).toEqual([
        { name: 'taskflow:reminder:a:r1', scheduledTime: T2 },
      ]);
    });

    it('remove todos os alarmes da tarefa sem afetar outras tarefas nem alarmes externos', async () => {
      await scheduler.reconcileTask('a', [{ taskId: 'a', reminderId: 'r1', triggerAt: T1 }]);
      await scheduler.reconcileTask('b', [{ taskId: 'b', reminderId: 'r1', triggerAt: T1 }]);
      await fakeBrowser.alarms.create('outro-alarme', { when: T1 });

      await scheduler.reconcileTask('a', []);

      expect((await alarmSnapshot()).map((alarm) => alarm.name)).toEqual([
        'outro-alarme',
        'taskflow:reminder:b:r1',
      ]);
    });

    it('ignora planos de outras tarefas', async () => {
      await scheduler.reconcileTask('a', [{ taskId: 'b', reminderId: 'r1', triggerAt: T1 }]);

      expect(await alarmSnapshot()).toEqual([]);
    });

    it('propaga falha da API de alarmes', async () => {
      vi.spyOn(fakeBrowser.alarms, 'create').mockRejectedValueOnce(new Error('indisponível'));

      await expect(
        scheduler.reconcileTask('a', [{ taskId: 'a', reminderId: 'r1', triggerAt: T1 }]),
      ).rejects.toThrow('indisponível');
    });
  });

  describe('reconcileAll', () => {
    it('recria alarmes ausentes e remove alarmes de tarefas que não existem mais', async () => {
      await scheduler.reconcileTask('removida', [
        { taskId: 'removida', reminderId: 'r1', triggerAt: T1 },
      ]);
      await fakeBrowser.alarms.create('outro-alarme', { when: T1 });

      await scheduler.reconcileAll([
        { taskId: 'a', reminderId: 'r1', triggerAt: T1 },
        { taskId: 'b', reminderId: 'r2', triggerAt: T2 },
      ]);

      expect(await alarmSnapshot()).toEqual([
        { name: 'outro-alarme', scheduledTime: T1 },
        { name: 'taskflow:reminder:a:r1', scheduledTime: T1 },
        { name: 'taskflow:reminder:b:r2', scheduledTime: T2 },
      ]);
    });
  });
});
