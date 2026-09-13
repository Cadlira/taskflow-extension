import { describe, expect, it, vi } from 'vitest';
import {
  createReminderService,
  type ReminderNotification,
  type ReminderNotifier,
} from '@/application/reminder-service';
import type { Task } from '@/domain/task';
import { reminderTriggerAt } from '@/domain/task-reminders';
import { FakeReminderScheduler, InMemoryTaskRepository } from '../support/fakes';
import { buildTask, FIXED_NOW, hoursFrom } from '../support/task-fixtures';

class RecordingNotifier implements ReminderNotifier {
  readonly delivered: ReminderNotification[] = [];

  async notify(notification: ReminderNotification): Promise<void> {
    this.delivered.push(notification);
  }
}

function setup(tasks: Task[], now = FIXED_NOW) {
  const repository = new InMemoryTaskRepository(tasks);
  const scheduler = new FakeReminderScheduler();
  const notifier = new RecordingNotifier();
  const service = createReminderService({ repository, scheduler, notifier, clock: () => now });
  return { repository, scheduler, notifier, service };
}

const DUE_AT = hoursFrom(FIXED_NOW, 2);

describe('ReminderService.reconcileAll', () => {
  it('recria alarmes futuros ausentes e remove alarmes sem lembrete persistido', async () => {
    const task = buildTask({
      id: 'a',
      dueAt: DUE_AT,
      reminders: [
        { id: 'r15', offsetMinutes: 15 },
        { id: 'r60', offsetMinutes: 60 },
      ],
    });
    const { scheduler, service, notifier } = setup([task]);
    scheduler.alarms.set('removida:r', { taskId: 'removida', reminderId: 'r', triggerAt: 1 });

    await service.reconcileAll();

    expect([...scheduler.alarms.values()]).toEqual([
      { taskId: 'a', reminderId: 'r15', triggerAt: reminderTriggerAt(DUE_AT, 15) },
      { taskId: 'a', reminderId: 'r60', triggerAt: reminderTriggerAt(DUE_AT, 60) },
    ]);
    expect(notifier.delivered).toEqual([]);
  });

  it('marca ocorrências passadas como processadas sem notificar', async () => {
    const task = buildTask({
      id: 'a',
      dueAt: DUE_AT,
      reminders: [
        { id: 'passado', offsetMinutes: 1440 },
        { id: 'futuro', offsetMinutes: 15 },
      ],
    });
    const { repository, scheduler, notifier, service } = setup([task]);

    await service.reconcileAll();

    expect(repository.tasks[0]?.reminders).toEqual([
      { id: 'passado', offsetMinutes: 1440, lastTriggeredFor: DUE_AT },
      { id: 'futuro', offsetMinutes: 15 },
    ]);
    expect(scheduler.alarmsFor('a').map((alarm) => alarm.reminderId)).toEqual(['futuro']);
    expect(notifier.delivered).toEqual([]);
  });

  it('não regrava tarefas sem ocorrências vencidas', async () => {
    const { repository, service } = setup([buildTask({ dueAt: DUE_AT })]);
    const save = vi.spyOn(repository, 'save');

    await service.reconcileAll();

    expect(save).not.toHaveBeenCalled();
  });

  it('não agenda lembretes de tarefas terminais', async () => {
    const { scheduler, service } = setup([
      buildTask({ status: 'DONE', dueAt: DUE_AT, reminders: [{ id: 'r', offsetMinutes: 15 }] }),
    ]);

    await service.reconcileAll();

    expect(scheduler.alarms.size).toBe(0);
  });
});

describe('ReminderService.handleAlarm', () => {
  const reminder = { id: 'r15', offsetMinutes: 15 };
  const task = buildTask({
    id: 'a',
    title: 'Enviar proposta',
    dueAt: DUE_AT,
    reminders: [reminder],
  });
  const scheduledTime = reminderTriggerAt(DUE_AT, 15);
  const alarmTime = new Date(scheduledTime);

  it('notifica alarme válido e registra a ocorrência processada', async () => {
    const { repository, notifier, service } = setup([task], alarmTime);

    const outcome = await service.handleAlarm({ taskId: 'a', reminderId: 'r15', scheduledTime });

    expect(outcome).toBe('NOTIFIED');
    expect(notifier.delivered).toEqual([
      { id: `a:r15:${DUE_AT}`, taskTitle: 'Enviar proposta', dueAt: DUE_AT },
    ]);
    expect(repository.tasks[0]?.reminders).toEqual([{ ...reminder, lastTriggeredFor: DUE_AT }]);
  });

  it('não notifica novamente a mesma ocorrência', async () => {
    const { notifier, service } = setup([task], alarmTime);
    const alarm = { taskId: 'a', reminderId: 'r15', scheduledTime };

    await service.handleAlarm(alarm);
    const second = await service.handleAlarm(alarm);

    expect(second).toBe('DISCARDED');
    expect(notifier.delivered).toHaveLength(1);
  });

  it('processa eventos simultâneos em sequência sem duplicar a notificação', async () => {
    const { notifier, service } = setup([task], alarmTime);
    const alarm = { taskId: 'a', reminderId: 'r15', scheduledTime };

    await Promise.all([service.handleAlarm(alarm), service.handleAlarm(alarm)]);

    expect(notifier.delivered).toHaveLength(1);
  });

  it.each([
    ['tarefa inexistente', [] as Task[]],
    ['tarefa concluída', [{ ...task, status: 'DONE' as const }]],
    ['tarefa cancelada', [{ ...task, status: 'CANCELLED' as const }]],
    ['lembrete removido', [{ ...task, reminders: [] }]],
    ['prazo alterado', [{ ...task, dueAt: hoursFrom(FIXED_NOW, 30) }]],
  ])('descarta alarme obsoleto de %s e remove o alarme', async (_label, tasks) => {
    const { scheduler, notifier, service } = setup(tasks, alarmTime);
    scheduler.alarms.set('a:r15', { taskId: 'a', reminderId: 'r15', triggerAt: scheduledTime });

    const outcome = await service.handleAlarm({ taskId: 'a', reminderId: 'r15', scheduledTime });

    expect(outcome).toBe('DISCARDED');
    expect(notifier.delivered).toEqual([]);
    expect(scheduler.alarmsFor('a').filter((alarm) => alarm.triggerAt === scheduledTime)).toEqual(
      [],
    );
  });

  it('reprograma o alarme correto quando o disparo recebido corresponde a um prazo antigo', async () => {
    const newDueAt = hoursFrom(FIXED_NOW, 30);
    const { scheduler, service } = setup([{ ...task, dueAt: newDueAt }], alarmTime);

    await service.handleAlarm({ taskId: 'a', reminderId: 'r15', scheduledTime });

    expect(scheduler.alarmsFor('a')).toEqual([
      { taskId: 'a', reminderId: 'r15', triggerAt: reminderTriggerAt(newDueAt, 15) },
    ]);
  });

  it('não registra processamento quando a notificação falha', async () => {
    const { repository, notifier, service } = setup([task], alarmTime);
    vi.spyOn(notifier, 'notify').mockRejectedValueOnce(new Error('bloqueado'));

    await expect(
      service.handleAlarm({ taskId: 'a', reminderId: 'r15', scheduledTime }),
    ).rejects.toThrow('bloqueado');

    expect(repository.tasks[0]?.reminders).toEqual([reminder]);
  });
});
