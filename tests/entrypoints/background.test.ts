import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import background from '@/entrypoints/background';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { reminderTriggerAt } from '@/domain/task-reminders';
import { buildTask, FIXED_NOW, hoursFrom } from '../support/task-fixtures';

const DUE_AT = hoursFrom(FIXED_NOW, 2);
const ALARM_15 = 'taskflow:reminder:task-1:r15';

function alarm(name: string, scheduledTime: number) {
  return { name, scheduledTime, persistAcrossSessions: false };
}

async function alarmNames(): Promise<string[]> {
  return (await fakeBrowser.alarms.getAll()).map((alarm) => alarm.name).sort();
}

async function seed(...tasks: ReturnType<typeof buildTask>[]): Promise<void> {
  const repository = new ChromeTaskRepository();
  for (const task of tasks) {
    await repository.save(task);
  }
}

describe('background', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    background.main();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe.each([
    [
      'runtime.onInstalled',
      () => fakeBrowser.runtime.onInstalled.trigger({ reason: 'update' } as never),
    ],
    ['runtime.onStartup', () => fakeBrowser.runtime.onStartup.trigger()],
  ])('reconciliação em %s', (_event, trigger) => {
    it('recria alarmes futuros ausentes e marca ocorrências passadas sem notificar', async () => {
      await seed(
        buildTask({
          dueAt: DUE_AT,
          reminders: [
            { id: 'r15', offsetMinutes: 15 },
            { id: 'r1440', offsetMinutes: 1440 },
          ],
        }),
      );
      await fakeBrowser.alarms.create('taskflow:reminder:excluida:r', { when: Date.now() + 1000 });

      await trigger();

      expect(await alarmNames()).toEqual([ALARM_15]);
      expect((await fakeBrowser.alarms.get(ALARM_15))?.scheduledTime).toBe(
        reminderTriggerAt(DUE_AT, 15),
      );
      const [stored] = await new ChromeTaskRepository().list();
      expect(stored?.reminders.find((reminder) => reminder.id === 'r1440')?.lastTriggeredFor).toBe(
        DUE_AT,
      );
      expect(fakeBrowser.notifications.getAllCreateOptions()).toEqual({});
    });
  });

  describe('alarms.onAlarm', () => {
    const scheduledTime = reminderTriggerAt(DUE_AT, 15);

    beforeEach(() => {
      vi.setSystemTime(scheduledTime);
    });

    it('recarrega a tarefa e entrega notificação válida uma única vez', async () => {
      await seed(
        buildTask({
          title: 'Enviar proposta',
          dueAt: DUE_AT,
          reminders: [{ id: 'r15', offsetMinutes: 15 }],
        }),
      );

      await fakeBrowser.alarms.onAlarm.trigger(alarm(ALARM_15, scheduledTime));
      await fakeBrowser.alarms.onAlarm.trigger(alarm(ALARM_15, scheduledTime));

      const notifications = Object.entries(fakeBrowser.notifications.getAllCreateOptions());
      expect(notifications).toHaveLength(1);
      expect(notifications[0]?.[1]).toMatchObject({
        type: 'basic',
        title: 'Enviar proposta',
        message: expect.stringMatching(/^Prazo: /),
        iconUrl: expect.stringContaining('icon/128.png'),
      });
      const [stored] = await new ChromeTaskRepository().list();
      expect(stored?.reminders[0]?.lastTriggeredFor).toBe(DUE_AT);
    });

    it('descarta alarme de tarefa concluída sem notificar e remove o alarme', async () => {
      await seed(
        buildTask({
          status: 'DONE',
          completedAt: FIXED_NOW.toISOString(),
          dueAt: DUE_AT,
          reminders: [{ id: 'r15', offsetMinutes: 15 }],
        }),
      );
      await fakeBrowser.alarms.create(ALARM_15, { when: scheduledTime });

      await fakeBrowser.alarms.onAlarm.trigger(alarm(ALARM_15, scheduledTime));

      expect(fakeBrowser.notifications.getAllCreateOptions()).toEqual({});
      expect(await alarmNames()).toEqual([]);
    });

    it('descarta alarme de tarefa excluída', async () => {
      await fakeBrowser.alarms.onAlarm.trigger(alarm(ALARM_15, scheduledTime));

      expect(fakeBrowser.notifications.getAllCreateOptions()).toEqual({});
    });

    it('ignora alarmes que não pertencem ao TaskFlow', async () => {
      const get = vi.spyOn(fakeBrowser.storage.local, 'get');

      await fakeBrowser.alarms.onAlarm.trigger(alarm('outro-alarme', scheduledTime));

      expect(get).not.toHaveBeenCalled();
    });

    it('registra falha de entrega sem interromper o service worker', async () => {
      await seed(buildTask({ dueAt: DUE_AT, reminders: [{ id: 'r15', offsetMinutes: 15 }] }));
      vi.spyOn(fakeBrowser.notifications, 'create').mockRejectedValueOnce(new Error('bloqueado'));

      await expect(
        fakeBrowser.alarms.onAlarm.trigger(alarm(ALARM_15, scheduledTime)),
      ).resolves.toBeDefined();

      expect(console.error).toHaveBeenCalledWith(
        'TaskFlow: falha ao processar lembrete.',
        expect.any(Error),
      );
      const [stored] = await new ChromeTaskRepository().list();
      expect(stored?.reminders[0]?.lastTriggeredFor).toBeUndefined();
    });
  });
});
