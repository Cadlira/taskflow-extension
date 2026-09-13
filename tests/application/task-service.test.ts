import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskStorageError } from '@/application/task-repository';
import { createTaskService, TaskNotFoundError } from '@/application/task-service';
import { FakeReminderScheduler, InMemoryTaskRepository } from '../support/fakes';
import { buildTask, FIXED_NOW, hoursFrom, sequentialIds } from '../support/task-fixtures';

const DUE_AT = hoursFrom(FIXED_NOW, 48);

function setup(tasks = [buildTask()]) {
  const repository = new InMemoryTaskRepository(tasks);
  const scheduler = new FakeReminderScheduler();
  let now = FIXED_NOW;
  const service = createTaskService({
    repository,
    scheduler,
    clock: () => now,
    generateId: sequentialIds('uuid'),
  });

  return {
    repository,
    scheduler,
    service,
    advanceTo(date: Date) {
      now = date;
    },
  };
}

describe('TaskService', () => {
  let context: ReturnType<typeof setup>;

  beforeEach(() => {
    context = setup();
  });

  it('lista e obtém tarefas do repository', async () => {
    await expect(context.service.list()).resolves.toEqual([buildTask()]);
    await expect(context.service.get('task-1')).resolves.toEqual(buildTask());
    await expect(context.service.get('inexistente')).resolves.toBeUndefined();
  });

  it('expõe a assinatura do repository', () => {
    const unsubscribe = context.service.subscribe(vi.fn());

    expect(context.repository.listeners.size).toBe(1);
    unsubscribe();
    expect(context.repository.listeners.size).toBe(0);
  });

  describe('create', () => {
    it('persiste a tarefa com identidade gerada e relógio injetado', async () => {
      const result = await context.service.create({ title: 'Nova' });

      expect(result).toEqual({
        ok: true,
        remindersPending: false,
        task: expect.objectContaining({
          id: 'uuid-1',
          title: 'Nova',
          createdAt: FIXED_NOW.toISOString(),
        }),
      });
      expect(context.repository.tasks.map((task) => task.id)).toEqual(['task-1', 'uuid-1']);
    });

    it('não persiste quando a validação falha', async () => {
      const result = await context.service.create({ title: ' ' });

      expect(result).toEqual({ ok: false, errors: { title: 'Informe um título.' } });
      expect(context.repository.tasks).toHaveLength(1);
    });

    it('propaga falha de persistência sem agendar lembretes', async () => {
      context.repository.failNext.save = new TaskStorageError('UNAVAILABLE', 'falhou');

      await expect(
        context.service.create({ title: 'x', dueAt: DUE_AT, reminderOffsets: [15] }),
      ).rejects.toBeInstanceOf(TaskStorageError);
      expect(context.scheduler.alarms.size).toBe(0);
    });

    it('agenda os lembretes futuros da nova tarefa', async () => {
      await context.service.create({ title: 'x', dueAt: DUE_AT, reminderOffsets: [0, 60] });

      expect(context.scheduler.alarmsFor('uuid-1').map((alarm) => alarm.triggerAt)).toEqual([
        Date.parse(DUE_AT),
        Date.parse(DUE_AT) - 60 * 60_000,
      ]);
    });

    it('mantém a tarefa salva e sinaliza lembrete pendente quando o agendamento falha', async () => {
      context.scheduler.failNext = true;

      const result = await context.service.create({
        title: 'x',
        dueAt: DUE_AT,
        reminderOffsets: [15],
      });

      expect(result).toMatchObject({ ok: true, remindersPending: true });
      expect(context.repository.tasks.find((task) => task.id === 'uuid-1')?.reminders).toEqual([
        { id: 'uuid-2', offsetMinutes: 15 },
      ]);
    });

    it('não sinaliza pendência quando não há lembretes a agendar', async () => {
      context.scheduler.failNext = true;

      await expect(context.service.create({ title: 'x' })).resolves.toMatchObject({
        remindersPending: false,
      });
    });

    it('marca como processados lembretes cujo instante já passou, sem agendá-los', async () => {
      const dueSoon = hoursFrom(FIXED_NOW, 0.5);

      const result = await context.service.create({
        title: 'x',
        dueAt: dueSoon,
        reminderOffsets: [0, 60],
      });

      expect(result.ok && result.task.reminders).toEqual([
        { id: 'uuid-2', offsetMinutes: 0 },
        { id: 'uuid-3', offsetMinutes: 60, lastTriggeredFor: dueSoon },
      ]);
      expect(context.scheduler.alarmsFor('uuid-1').map((alarm) => alarm.reminderId)).toEqual([
        'uuid-2',
      ]);
    });
  });

  describe('update', () => {
    it('atualiza campos preservando identidade e criação', async () => {
      context.advanceTo(new Date('2026-09-13T15:00:00.000Z'));

      const result = await context.service.update('task-1', { title: 'Editada' });

      expect(result.ok && result.task).toMatchObject({
        id: 'task-1',
        title: 'Editada',
        createdAt: buildTask().createdAt,
        updatedAt: '2026-09-13T15:00:00.000Z',
      });
      expect(context.repository.tasks[0]?.title).toBe('Editada');
    });

    it('não altera a tarefa persistida quando a validação falha', async () => {
      const result = await context.service.update('task-1', { title: '' });

      expect(result.ok).toBe(false);
      expect(context.repository.tasks).toEqual([buildTask()]);
    });

    it('rejeita tarefa inexistente', async () => {
      await expect(context.service.update('nada', { title: 'x' })).rejects.toBeInstanceOf(
        TaskNotFoundError,
      );
    });

    it('substitui alarmes quando o prazo é alterado e remove lembrete desmarcado', async () => {
      await context.service.update('task-1', {
        title: 'x',
        dueAt: DUE_AT,
        reminderOffsets: [15, 60],
      });
      const newDueAt = hoursFrom(FIXED_NOW, 72);

      await context.service.update('task-1', {
        title: 'x',
        dueAt: newDueAt,
        reminderOffsets: [15],
      });

      expect(context.scheduler.alarmsFor('task-1')).toEqual([
        {
          taskId: 'task-1',
          reminderId: 'uuid-1',
          triggerAt: Date.parse(newDueAt) - 15 * 60_000,
        },
      ]);
    });
  });

  describe('changeStatus', () => {
    beforeEach(async () => {
      await context.service.update('task-1', { title: 'x', dueAt: DUE_AT, reminderOffsets: [15] });
    });

    it.each(['DONE', 'CANCELLED'] as const)('remove alarmes ao mudar para %s', async (status) => {
      const result = await context.service.changeStatus('task-1', status);

      expect(result.ok && result.task.status).toBe(status);
      expect(context.scheduler.alarmsFor('task-1')).toEqual([]);
    });

    it('reagenda lembretes futuros ao reabrir uma tarefa terminal', async () => {
      await context.service.changeStatus('task-1', 'DONE');

      const result = await context.service.changeStatus('task-1', 'IN_PROGRESS');

      expect(result.ok && result.task.completedAt).toBeUndefined();
      expect(context.scheduler.alarmsFor('task-1')).toHaveLength(1);
    });

    it('não reagenda lembrete que venceu enquanto a tarefa estava concluída', async () => {
      await context.service.changeStatus('task-1', 'DONE');
      context.advanceTo(new Date(Date.parse(DUE_AT) - 5 * 60_000));

      const result = await context.service.changeStatus('task-1', 'TODO');

      expect(result.ok && result.task.reminders[0]?.lastTriggeredFor).toBe(DUE_AT);
      expect(context.scheduler.alarmsFor('task-1')).toEqual([]);
    });

    it('não persiste quando o status já é o solicitado', async () => {
      const save = vi.spyOn(context.repository, 'save');

      const result = await context.service.changeStatus('task-1', 'TODO');

      expect(result).toMatchObject({ ok: true, remindersPending: false });
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('exclui a tarefa e todos os seus alarmes', async () => {
      await context.service.update('task-1', { title: 'x', dueAt: DUE_AT, reminderOffsets: [15] });

      await context.service.remove('task-1');

      expect(context.repository.tasks).toEqual([]);
      expect(context.scheduler.alarms.size).toBe(0);
    });

    it('conclui a exclusão mesmo se a remoção de alarmes falhar', async () => {
      context.scheduler.failNext = true;

      await expect(context.service.remove('task-1')).resolves.toBeUndefined();
      expect(context.repository.tasks).toEqual([]);
    });

    it('propaga falha de persistência', async () => {
      context.repository.failNext.delete = new TaskStorageError('UNAVAILABLE', 'falhou');

      await expect(context.service.remove('task-1')).rejects.toBeInstanceOf(TaskStorageError);
      expect(context.repository.tasks).toHaveLength(1);
    });
  });
});
