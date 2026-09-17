import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskStorageError } from '@/application/task-repository';
import {
  createTaskService,
  RecurrenceChoiceRequiredError,
  TaskNotFoundError,
} from '@/application/task-service';
import type { Task } from '@/domain/task';
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
        context.service.create({
          title: 'x',
          dueAt: DUE_AT,
          reminders: [{ type: 'OFFSET', offsetMinutes: 15 }],
        }),
      ).rejects.toBeInstanceOf(TaskStorageError);
      expect(context.scheduler.alarms.size).toBe(0);
    });

    it('agenda os lembretes futuros da nova tarefa', async () => {
      await context.service.create({
        title: 'x',
        dueAt: DUE_AT,
        reminders: [
          { type: 'OFFSET', offsetMinutes: 0 },
          { type: 'OFFSET', offsetMinutes: 60 },
        ],
      });

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
        reminders: [{ type: 'OFFSET', offsetMinutes: 15 }],
      });

      expect(result).toMatchObject({ ok: true, remindersPending: true });
      expect(context.repository.tasks.find((task) => task.id === 'uuid-1')?.reminders).toEqual([
        { id: 'uuid-2', type: 'OFFSET', offsetMinutes: 15 },
      ]);
    });

    it('não sinaliza pendência quando não há lembretes a agendar', async () => {
      context.scheduler.failNext = true;

      await expect(context.service.create({ title: 'x' })).resolves.toMatchObject({
        remindersPending: false,
      });
    });

    it('rejeita lembrete novo cujo instante efetivo já passou', async () => {
      const dueSoon = hoursFrom(FIXED_NOW, 0.5);

      const result = await context.service.create({
        title: 'x',
        dueAt: dueSoon,
        reminders: [
          { type: 'OFFSET', offsetMinutes: 0 },
          { type: 'OFFSET', offsetMinutes: 60 },
        ],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.reminderItems).toEqual([
          undefined,
          'O horário do lembrete já passou.',
        ]);
      }
      expect(context.repository.tasks).toHaveLength(1);
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
        reminders: [
          { type: 'OFFSET', offsetMinutes: 15 },
          { type: 'OFFSET', offsetMinutes: 60 },
        ],
      });
      const newDueAt = hoursFrom(FIXED_NOW, 72);

      await context.service.update('task-1', {
        title: 'x',
        dueAt: newDueAt,
        reminders: [{ id: 'uuid-1', type: 'OFFSET', offsetMinutes: 15 }],
      });

      expect(context.scheduler.alarmsFor('task-1')).toEqual([
        {
          taskId: 'task-1',
          reminderId: 'uuid-1',
          triggerAt: Date.parse(newDueAt) - 15 * 60_000,
        },
      ]);
    });

    it('liquida lembrete mantido cujo instante efetivo venceu com o novo prazo', async () => {
      await context.service.update('task-1', {
        title: 'x',
        dueAt: DUE_AT,
        reminders: [{ type: 'OFFSET', offsetMinutes: 60 }],
      });
      const newDueAt = hoursFrom(FIXED_NOW, 0.5);

      const result = await context.service.update('task-1', {
        title: 'x',
        dueAt: newDueAt,
        reminders: [{ id: 'uuid-1', type: 'OFFSET', offsetMinutes: 60 }],
      });

      expect(result.ok && result.task.reminders).toEqual([
        {
          id: 'uuid-1',
          type: 'OFFSET',
          offsetMinutes: 60,
          processedFor: new Date(Date.parse(newDueAt) - 60 * 60_000).toISOString(),
        },
      ]);
      expect(context.scheduler.alarmsFor('task-1')).toEqual([]);
    });

    it('preserva o instante absoluto quando o prazo muda para depois dele', async () => {
      const at = hoursFrom(FIXED_NOW, 24);
      await context.service.update('task-1', {
        title: 'x',
        dueAt: DUE_AT,
        reminders: [{ type: 'AT', at }],
      });

      const newDueAt = hoursFrom(FIXED_NOW, 72);
      const result = await context.service.update('task-1', {
        title: 'x',
        dueAt: newDueAt,
        reminders: [{ id: 'uuid-1', type: 'AT', at }],
      });

      expect(result.ok && result.task.reminders).toEqual([{ id: 'uuid-1', type: 'AT', at }]);
      expect(context.scheduler.alarmsFor('task-1')).toEqual([
        { taskId: 'task-1', reminderId: 'uuid-1', triggerAt: Date.parse(at) },
      ]);
    });

    it('rejeita remover o prazo mantendo lembretes', async () => {
      const result = await context.service.update('task-1', {
        title: 'x',
        reminders: [{ type: 'OFFSET', offsetMinutes: 15 }],
      });

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.reminders).toBe('Lembretes exigem um prazo.');
      }
      expect(context.repository.tasks).toEqual([buildTask()]);
    });
  });

  describe('changeStatus', () => {
    beforeEach(async () => {
      await context.service.update('task-1', {
        title: 'x',
        dueAt: DUE_AT,
        reminders: [{ type: 'OFFSET', offsetMinutes: 15 }],
      });
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

      expect(result.ok && result.task.reminders[0]?.processedFor).toBe(
        new Date(Date.parse(DUE_AT) - 15 * 60_000).toISOString(),
      );
      expect(context.scheduler.alarmsFor('task-1')).toEqual([]);
    });

    it('não persiste quando o status já é o solicitado', async () => {
      const save = vi.spyOn(context.repository, 'save');

      const result = await context.service.changeStatus('task-1', 'TODO');

      expect(result).toMatchObject({ ok: true, remindersPending: false });
      expect(save).not.toHaveBeenCalled();
    });
  });

  describe('setSubtaskDone', () => {
    const subtasks = [
      { id: 's-1', title: 'Reservar sala', done: false },
      { id: 's-2', title: 'Enviar pauta', done: true },
    ];

    function setupWithSubtasks(overrides: Partial<Task> = {}) {
      const subtaskContext = setup([
        buildTask({
          status: 'IN_PROGRESS',
          dueAt: DUE_AT,
          reminders: [{ id: 'r-60', type: 'OFFSET', offsetMinutes: 60 }],
          subtasks,
          ...overrides,
        }),
      ]);
      subtaskContext.advanceTo(new Date(FIXED_NOW.getTime() + 60_000));
      return subtaskContext;
    }

    it('grava somente a marcação e updatedAt sem alterar status nem reconciliar alarmes', async () => {
      const subtaskContext = setupWithSubtasks();
      const before = subtaskContext.repository.tasks[0]!;
      const reconcile = vi.spyOn(subtaskContext.scheduler, 'reconcileTask');

      const result = await subtaskContext.service.setSubtaskDone('task-1', 's-1', true);

      const expected = {
        ...before,
        subtasks: [{ ...subtasks[0]!, done: true }, subtasks[1]!],
        updatedAt: new Date(FIXED_NOW.getTime() + 60_000).toISOString(),
      };
      expect(result).toEqual({ status: 'SAVED', task: expected });
      expect(subtaskContext.repository.tasks).toEqual([expected]);
      expect(expected.status).toBe('IN_PROGRESS');
      expect(expected.completedAt).toBeUndefined();
      expect(reconcile).not.toHaveBeenCalled();
    });

    it('marcar a última subtarefa não conclui a tarefa', async () => {
      const subtaskContext = setupWithSubtasks();

      const result = await subtaskContext.service.setSubtaskDone('task-1', 's-1', true);

      expect(result.status).toBe('SAVED');
      expect(subtaskContext.repository.tasks[0]).toMatchObject({ status: 'IN_PROGRESS' });
      expect(subtaskContext.repository.tasks[0]?.completedAt).toBeUndefined();
    });

    it('permite marcar em tarefa cancelada mantendo o status', async () => {
      const subtaskContext = setupWithSubtasks({ status: 'CANCELLED' });

      await expect(
        subtaskContext.service.setSubtaskDone('task-1', 's-1', true),
      ).resolves.toMatchObject({ status: 'SAVED', task: { status: 'CANCELLED' } });
    });

    it('não grava quando a marcação já é a solicitada', async () => {
      const subtaskContext = setupWithSubtasks();
      const update = vi.spyOn(subtaskContext.repository, 'updateTaskConditionally');
      const before = structuredClone(subtaskContext.repository.tasks);
      const listener = vi.fn();
      subtaskContext.repository.subscribe(listener);

      const result = await subtaskContext.service.setSubtaskDone('task-1', 's-2', true);

      expect(result).toEqual({ status: 'UNCHANGED', task: before[0] });
      expect(update).toHaveBeenCalledTimes(1);
      expect(listener).not.toHaveBeenCalled();
      expect(subtaskContext.repository.tasks).toEqual(before);
    });

    it('informa tarefa inexistente', async () => {
      const subtaskContext = setupWithSubtasks();

      await expect(
        subtaskContext.service.setSubtaskDone('inexistente', 's-1', true),
      ).resolves.toEqual({ status: 'TASK_NOT_FOUND' });
    });

    it('informa subtarefa inexistente sem recriá-la nem alterar as demais', async () => {
      const subtaskContext = setupWithSubtasks();
      const before = structuredClone(subtaskContext.repository.tasks);

      const result = await subtaskContext.service.setSubtaskDone('task-1', 'removida', true);

      expect(result).toEqual({ status: 'SUBTASK_NOT_FOUND', task: before[0] });
      expect(subtaskContext.repository.tasks).toEqual(before);
    });

    it('aplica a marcação sobre a versão mais recente sem desfazer alteração concorrente', async () => {
      const subtaskContext = setupWithSubtasks();
      subtaskContext.repository.replaceExternally([
        { ...subtaskContext.repository.tasks[0]!, title: 'Título alterado em outra superfície' },
      ]);

      await subtaskContext.service.setSubtaskDone('task-1', 's-1', true);

      expect(subtaskContext.repository.tasks[0]).toMatchObject({
        title: 'Título alterado em outra superfície',
        subtasks: [{ id: 's-1', done: true }, { id: 's-2', done: true }],
      });
    });

    it('propaga falha de persistência', async () => {
      const subtaskContext = setupWithSubtasks();
      subtaskContext.repository.failNext.updateTaskConditionally = new TaskStorageError(
        'UNAVAILABLE',
        'falhou',
      );

      await expect(
        subtaskContext.service.setSubtaskDone('task-1', 's-1', true),
      ).rejects.toBeInstanceOf(TaskStorageError);
      expect(subtaskContext.repository.tasks[0]?.subtasks).toEqual(subtasks);
    });
  });

  describe('remove', () => {
    it('exclui a tarefa e todos os seus alarmes', async () => {
      await context.service.update('task-1', {
        title: 'x',
        dueAt: DUE_AT,
        reminders: [{ type: 'OFFSET', offsetMinutes: 15 }],
      });

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

  describe('geração de ocorrências da série', () => {
    const MONDAY = new Date(2026, 8, 14, 9);
    const NEXT_MONDAY = new Date(2026, 8, 21, 9);

    function setupSeries(overrides: Partial<Task> = {}) {
      const series = buildTask({
        id: 'serie',
        title: 'Enviar relatório',
        dueAt: MONDAY.toISOString(),
        seriesId: 'serie-1',
        recurrence: { frequency: 'WEEKLY', weekdays: [1] },
        reminders: [{ id: 'r-60', type: 'OFFSET', offsetMinutes: 60 }],
        ...overrides,
      });
      const seriesContext = setup([series]);
      seriesContext.advanceTo(new Date(MONDAY));
      return seriesContext;
    }

    function nextOf(context: ReturnType<typeof setupSeries>): Task {
      return context.repository.tasks.find((task) => task.id !== 'serie')!;
    }

    it('conclui a ocorrência e cria a seguinte em uma única gravação', async () => {
      const seriesContext = setupSeries();
      const saveMany = vi.spyOn(seriesContext.repository, 'saveMany');

      const result = await seriesContext.service.changeStatus('serie', 'DONE');

      expect(result.ok).toBe(true);
      expect(saveMany).toHaveBeenCalledTimes(1);
      expect(seriesContext.repository.tasks).toHaveLength(2);

      const closed = seriesContext.repository.tasks.find((task) => task.id === 'serie')!;
      expect(closed).toMatchObject({
        status: 'DONE',
        completedAt: MONDAY.toISOString(),
        seriesId: 'serie-1',
      });
      expect(closed.recurrence).toBeUndefined();

      const next = nextOf(seriesContext);
      expect(next).toMatchObject({
        id: 'uuid-1',
        title: 'Enviar relatório',
        status: 'TODO',
        dueAt: NEXT_MONDAY.toISOString(),
        seriesId: 'serie-1',
        recurrence: { frequency: 'WEEKLY', weekdays: [1] },
        reminders: [{ id: 'uuid-2', type: 'OFFSET', offsetMinutes: 60 }],
      });
      expect(next.completedAt).toBeUndefined();
    });

    it('concluir com subtarefas marcadas grava a fechada marcada e a seguinte desmarcada juntas', async () => {
      const seriesContext = setupSeries({
        subtasks: [
          { id: 'sub-a', title: 'A', done: true },
          { id: 'sub-b', title: 'B', done: false },
        ],
      });
      const saveMany = vi.spyOn(seriesContext.repository, 'saveMany');

      await seriesContext.service.changeStatus('serie', 'DONE');

      expect(saveMany).toHaveBeenCalledTimes(1);
      const [written] = saveMany.mock.calls[0]!;
      expect(written.map((task) => [task.id, task.subtasks])).toEqual([
        [
          'serie',
          [
            { id: 'sub-a', title: 'A', done: true },
            { id: 'sub-b', title: 'B', done: false },
          ],
        ],
        [
          'uuid-1',
          [
            { id: 'uuid-3', title: 'A', done: false },
            { id: 'uuid-4', title: 'B', done: false },
          ],
        ],
      ]);
      expect(seriesContext.repository.tasks.map((task) => task.subtasks)).toEqual(
        written.map((task) => task.subtasks),
      );
    });

    it('não cria a próxima quando o limite da série foi atingido', async () => {
      const seriesContext = setupSeries({
        recurrence: { frequency: 'WEEKLY', weekdays: [1], until: MONDAY.toISOString() },
      });

      await seriesContext.service.changeStatus('serie', 'DONE');

      expect(seriesContext.repository.tasks).toHaveLength(1);
      expect(seriesContext.repository.tasks[0]).toMatchObject({
        status: 'DONE',
        seriesId: 'serie-1',
      });
      expect(seriesContext.repository.tasks[0]?.recurrence).toBeUndefined();
    });

    it('pular cancela a ocorrência e gera a seguinte', async () => {
      const seriesContext = setupSeries();

      const result = await seriesContext.service.changeStatus('serie', 'CANCELLED', 'SKIP');

      expect(result.ok && result.task.status).toBe('CANCELLED');
      const cancelled = seriesContext.repository.tasks.find((task) => task.id === 'serie')!;
      expect(cancelled.completedAt).toBeUndefined();
      expect(cancelled.recurrence).toBeUndefined();
      expect(nextOf(seriesContext)).toMatchObject({
        status: 'TODO',
        dueAt: NEXT_MONDAY.toISOString(),
      });
    });

    it('encerrar cancela a ocorrência sem gerar a próxima', async () => {
      const seriesContext = setupSeries();

      await seriesContext.service.changeStatus('serie', 'CANCELLED', 'END');

      expect(seriesContext.repository.tasks).toHaveLength(1);
      expect(seriesContext.repository.tasks[0]).toMatchObject({
        status: 'CANCELLED',
        seriesId: 'serie-1',
      });
      expect(seriesContext.repository.tasks[0]?.recurrence).toBeUndefined();
    });

    it('exige escolha ao cancelar e não persiste nada sem ela', async () => {
      const seriesContext = setupSeries();
      const before = structuredClone(seriesContext.repository.tasks);

      await expect(seriesContext.service.changeStatus('serie', 'CANCELLED')).rejects.toBeInstanceOf(
        RecurrenceChoiceRequiredError,
      );

      expect(seriesContext.repository.tasks).toEqual(before);
    });

    it('reabrir a ocorrência terminal não devolve a regra nem gera nova', async () => {
      const seriesContext = setupSeries();
      await seriesContext.service.changeStatus('serie', 'DONE');
      const next = nextOf(seriesContext);

      const result = await seriesContext.service.changeStatus('serie', 'TODO');

      expect(result.ok && result.task.recurrence).toBeUndefined();
      expect(seriesContext.repository.tasks).toHaveLength(2);
      expect(nextOf(seriesContext)).toEqual(next);
    });

    it('planeja os alarmes da nova ocorrência e remove os da fechada', async () => {
      const seriesContext = setupSeries();

      await seriesContext.service.changeStatus('serie', 'DONE');
      const next = nextOf(seriesContext);

      expect(seriesContext.scheduler.alarmsFor('serie')).toEqual([]);
      expect(seriesContext.scheduler.alarmsFor(next.id)).toEqual([
        {
          taskId: next.id,
          reminderId: next.reminders[0]!.id,
          triggerAt: NEXT_MONDAY.getTime() - 60 * 60_000,
        },
      ]);
    });

    it('liquida lembrete copiado cujo instante já passou sem notificação retroativa', async () => {
      const seriesContext = setupSeries({
        reminders: [{ id: 'r-1440', type: 'OFFSET', offsetMinutes: 1440 }],
        recurrence: { frequency: 'DAILY', intervalDays: 1 },
      });
      seriesContext.advanceTo(new Date(2026, 8, 14, 23));

      await seriesContext.service.changeStatus('serie', 'DONE');

      const next = nextOf(seriesContext);
      expect(next.dueAt).toBe(new Date(2026, 8, 15, 9).toISOString());
      expect(next.reminders[0]?.processedFor).toBe(new Date(2026, 8, 14, 9).toISOString());
      expect(seriesContext.scheduler.alarmsFor(next.id)).toEqual([]);
    });

    it('não persiste o fechamento nem a nova ocorrência quando a gravação falha', async () => {
      const seriesContext = setupSeries();
      const before = structuredClone(seriesContext.repository.tasks);
      seriesContext.repository.failNext.saveMany = new TaskStorageError('UNAVAILABLE', 'falhou');

      await expect(seriesContext.service.changeStatus('serie', 'DONE')).rejects.toBeInstanceOf(
        TaskStorageError,
      );

      expect(seriesContext.repository.tasks).toEqual(before);
    });

    it('concluir pelo formulário gera a próxima ocorrência', async () => {
      const seriesContext = setupSeries();
      const task = seriesContext.repository.tasks[0]!;

      const result = await seriesContext.service.update('serie', {
        title: task.title,
        dueAt: task.dueAt,
        reminders: [{ id: 'r-60', type: 'OFFSET', offsetMinutes: 60 }],
        recurrence: { frequency: 'WEEKLY', weekdays: [1] },
        status: 'DONE',
      });

      expect(result.ok).toBe(true);
      expect(seriesContext.repository.tasks).toHaveLength(2);
      expect(seriesContext.repository.tasks.find((t) => t.id === 'serie')?.status).toBe('DONE');
      expect(nextOf(seriesContext)).toMatchObject({ dueAt: NEXT_MONDAY.toISOString() });
    });

    it('cancelar pelo formulário encerra a série quando escolhido', async () => {
      const seriesContext = setupSeries();
      const task = seriesContext.repository.tasks[0]!;

      const result = await seriesContext.service.update(
        'serie',
        {
          title: task.title,
          dueAt: task.dueAt,
          reminders: [{ id: 'r-60', type: 'OFFSET', offsetMinutes: 60 }],
          recurrence: { frequency: 'WEEKLY', weekdays: [1] },
          status: 'CANCELLED',
        },
        'END',
      );

      expect(result.ok).toBe(true);
      expect(seriesContext.repository.tasks).toHaveLength(1);
      expect(seriesContext.repository.tasks[0]).toMatchObject({
        status: 'CANCELLED',
        seriesId: 'serie-1',
      });
      expect(seriesContext.repository.tasks[0]?.recurrence).toBeUndefined();
    });
  });
});
