import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskStorageError } from '@/application/task-repository';
import {
  createTaskService,
  RecurrenceChoiceRequiredError,
  TaskNotFoundError,
  type TaskMutationResult,
} from '@/application/task-service';
import type { UndoPlan } from '@/domain/task-undo';
import type { Task } from '@/domain/task';
import { FakeReminderScheduler, InMemoryTaskRepository } from '../support/fakes';
import { buildTask, FIXED_NOW, hoursFrom, sequentialIds } from '../support/task-fixtures';

const DUE_AT = hoursFrom(FIXED_NOW, 48);

function undoPlanOf(result: TaskMutationResult): UndoPlan {
  if (!result.ok || result.undo === undefined) {
    throw new Error('a mutação não devolveu plano de desfazer');
  }

  return result.undo;
}

function setup(tasks = [buildTask()]) {
  const repository = new InMemoryTaskRepository(tasks);
  const scheduler = new FakeReminderScheduler();
  let now = FIXED_NOW;
  const service = createTaskService({
    repository,
    trash: repository,
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
    it('move a tarefa para a lixeira com o instante do relógio e remove seus alarmes', async () => {
      await context.service.update('task-1', {
        title: 'x',
        dueAt: DUE_AT,
        reminders: [{ type: 'OFFSET', offsetMinutes: 15 }],
      });
      const task = context.repository.tasks[0]!;

      const result = await context.service.remove('task-1');

      expect(result).toEqual({ undo: { kind: 'RESTORE_FROM_TRASH', taskId: 'task-1' } });
      expect(context.repository.tasks).toEqual([]);
      expect(context.repository.trash).toEqual([{ deletedAt: FIXED_NOW.toISOString(), task }]);
      expect(context.scheduler.alarms.size).toBe(0);
    });

    it('não oferece desfazer quando a tarefa já não existia', async () => {
      await expect(context.service.remove('inexistente')).resolves.toEqual({});
      expect(context.repository.trash).toEqual([]);
    });

    it('conclui a exclusão mesmo se a remoção de alarmes falhar', async () => {
      context.scheduler.failNext = true;

      await expect(context.service.remove('task-1')).resolves.toMatchObject({
        undo: { kind: 'RESTORE_FROM_TRASH' },
      });
      expect(context.repository.tasks).toEqual([]);
    });

    it('propaga falha de persistência sem reconciliar alarmes', async () => {
      await context.service.update('task-1', {
        title: 'x',
        dueAt: DUE_AT,
        reminders: [{ type: 'OFFSET', offsetMinutes: 15 }],
      });
      const reconcile = vi.spyOn(context.scheduler, 'reconcileTask');
      context.repository.failNext.moveToTrash = new TaskStorageError('UNAVAILABLE', 'falhou');

      await expect(context.service.remove('task-1')).rejects.toBeInstanceOf(TaskStorageError);
      expect(context.repository.tasks).toHaveLength(1);
      expect(context.repository.trash).toEqual([]);
      expect(reconcile).not.toHaveBeenCalled();
      expect(context.scheduler.alarmsFor('task-1')).toHaveLength(1);
    });
  });

  describe('restoreFromTrash', () => {
    const DELETED_AT = hoursFrom(FIXED_NOW, -3);

    function setupTrash(task: Task) {
      const trashContext = setup([]);
      trashContext.repository.trash = [{ deletedAt: DELETED_AT, task }];
      return trashContext;
    }

    it('devolve a tarefa preservando campos e timestamps e agenda lembrete futuro', async () => {
      const task = buildTask({
        dueAt: DUE_AT,
        reminders: [{ id: 'r-15', type: 'OFFSET', offsetMinutes: 15 }],
        subtasks: [{ id: 's', title: 'Passo', done: true }],
      });
      const trashContext = setupTrash(task);

      const result = await trashContext.service.restoreFromTrash('task-1');

      expect(result).toEqual({ status: 'RESTORED', task, remindersPending: false });
      expect(trashContext.repository.tasks).toEqual([task]);
      expect(trashContext.repository.trash).toEqual([]);
      expect(trashContext.scheduler.alarmsFor('task-1')).toEqual([
        { taskId: 'task-1', reminderId: 'r-15', triggerAt: Date.parse(DUE_AT) - 15 * 60_000 },
      ]);
    });

    it('marca como processado o lembrete vencido na lixeira sem agendá-lo', async () => {
      const due = hoursFrom(FIXED_NOW, 1);
      const trashContext = setupTrash(
        buildTask({ dueAt: due, reminders: [{ id: 'r-120', type: 'OFFSET', offsetMinutes: 120 }] }),
      );

      const result = await trashContext.service.restoreFromTrash('task-1');

      expect(result.status === 'RESTORED' && result.task.reminders).toEqual([
        { id: 'r-120', type: 'OFFSET', offsetMinutes: 120, processedFor: hoursFrom(FIXED_NOW, -1) },
      ]);
      expect(result.status === 'RESTORED' && result.task.updatedAt).toBe(buildTask().updatedAt);
      expect(trashContext.scheduler.alarmsFor('task-1')).toEqual([]);
    });

    it('recusa quando o item não está na lixeira', async () => {
      await expect(context.service.restoreFromTrash('task-1')).resolves.toEqual({
        status: 'NOT_IN_TRASH',
      });
    });

    it('recusa quando o identificador já existe e mantém o item na lixeira', async () => {
      const existing = buildTask({ title: 'Restaurada pelo backup' });
      const conflictContext = setup([existing]);
      conflictContext.repository.trash = [{ deletedAt: DELETED_AT, task: buildTask() }];

      await expect(conflictContext.service.restoreFromTrash('task-1')).resolves.toEqual({
        status: 'ID_EXISTS',
      });
      expect(conflictContext.repository.tasks).toEqual([existing]);
      expect(conflictContext.repository.trash).toHaveLength(1);
    });

    it('não desfaz a restauração quando o agendamento falha', async () => {
      const trashContext = setupTrash(
        buildTask({ dueAt: DUE_AT, reminders: [{ id: 'r-15', type: 'OFFSET', offsetMinutes: 15 }] }),
      );
      trashContext.scheduler.failNext = true;

      const result = await trashContext.service.restoreFromTrash('task-1');

      expect(result).toMatchObject({ status: 'RESTORED', remindersPending: true });
      expect(trashContext.repository.tasks).toHaveLength(1);
      expect(trashContext.repository.trash).toEqual([]);
    });
  });

  describe('planos de desfazer', () => {
    it('status simples devolve REVERT com a versão lida antes da ação', async () => {
      const previous = context.repository.tasks[0]!;

      const result = await context.service.changeStatus('task-1', 'DONE');

      expect(result.ok && result.undo).toEqual({
        kind: 'REVERT',
        previous,
        expectedUpdatedAt: FIXED_NOW.toISOString(),
      });
    });

    it('edição devolve REVERT com o updatedAt produzido', async () => {
      context.advanceTo(new Date('2026-09-13T15:00:00.000Z'));

      const result = await context.service.update('task-1', { title: 'Editada' });

      expect(result.ok && result.undo).toEqual({
        kind: 'REVERT',
        previous: buildTask(),
        expectedUpdatedAt: '2026-09-13T15:00:00.000Z',
      });
    });

    it('não devolve plano quando o status já é o solicitado', async () => {
      const result = await context.service.changeStatus('task-1', 'TODO');

      expect(result.ok && result.undo).toBeUndefined();
    });

    it('criar tarefa não devolve plano', async () => {
      const result = await context.service.create({ title: 'Nova' });

      expect(result.ok && 'undo' in result).toBe(false);
    });
  });

  describe('undo', () => {
    it('desfaz a exclusão restaurando da lixeira', async () => {
      const removed = await context.service.remove('task-1');

      const result = await context.service.undo(removed.undo!);

      expect(result).toEqual({ status: 'UNDONE', task: buildTask(), remindersPending: false });
      expect(context.repository.tasks).toEqual([buildTask()]);
      expect(context.repository.trash).toEqual([]);
    });

    it('recusa desfazer exclusão quando o item saiu da lixeira', async () => {
      const removed = await context.service.remove('task-1');
      await context.repository.emptyTrash();

      await expect(context.service.undo(removed.undo!)).resolves.toEqual({
        status: 'NOT_IN_TRASH',
      });
      expect(context.repository.tasks).toEqual([]);
    });

    it('desfaz conclusão devolvendo status, completedAt e lembretes com novo updatedAt', async () => {
      await context.service.update('task-1', {
        title: 'x',
        dueAt: DUE_AT,
        reminders: [{ type: 'OFFSET', offsetMinutes: 15 }],
        status: 'IN_PROGRESS',
      });
      const before = context.repository.tasks[0]!;
      const done = await context.service.changeStatus('task-1', 'DONE');
      expect(context.scheduler.alarmsFor('task-1')).toEqual([]);
      const undoAt = new Date('2026-09-13T12:30:00.000Z');
      context.advanceTo(undoAt);

      const result = await context.service.undo(undoPlanOf(done));

      const reverted = { ...before, updatedAt: undoAt.toISOString() };
      expect(result).toEqual({ status: 'UNDONE', task: reverted, remindersPending: false });
      expect(context.repository.tasks).toEqual([reverted]);
      expect(context.scheduler.alarmsFor('task-1')).toHaveLength(1);
    });

    it('recusa sem gravar quando a tarefa foi alterada depois da ação', async () => {
      const done = await context.service.changeStatus('task-1', 'DONE');
      context.advanceTo(new Date('2026-09-13T12:10:00.000Z'));
      await context.service.update('task-1', { title: 'Editada em outro lugar', status: 'DONE' });
      const snapshot = structuredClone(context.repository.tasks);
      const listener = vi.fn();
      context.repository.subscribe(listener);

      await expect(context.service.undo(undoPlanOf(done))).resolves.toEqual({
        status: 'CHANGED',
      });
      expect(context.repository.tasks).toEqual(snapshot);
      expect(listener).not.toHaveBeenCalled();
    });

    it('recusa quando a tarefa foi removida depois da ação', async () => {
      const done = await context.service.changeStatus('task-1', 'DONE');
      await context.service.remove('task-1');

      await expect(context.service.undo(undoPlanOf(done))).resolves.toEqual({
        status: 'REMOVED',
      });
    });

    it('informa lembretes pendentes quando o agendamento falha na reversão', async () => {
      await context.service.update('task-1', {
        title: 'x',
        dueAt: DUE_AT,
        reminders: [{ type: 'OFFSET', offsetMinutes: 15 }],
      });
      const done = await context.service.changeStatus('task-1', 'DONE');
      context.scheduler.failNext = true;

      const result = await context.service.undo(undoPlanOf(done));

      expect(result).toMatchObject({ status: 'UNDONE', remindersPending: true });
      expect(context.repository.tasks[0]?.status).toBe('TODO');
    });

    it('propaga falha de gravação sem alterar os dados', async () => {
      const done = await context.service.changeStatus('task-1', 'DONE');
      const snapshot = structuredClone(context.repository.tasks);
      context.repository.failNext.revertConditionally = new TaskStorageError(
        'UNAVAILABLE',
        'falhou',
      );

      await expect(context.service.undo(undoPlanOf(done))).rejects.toBeInstanceOf(
        TaskStorageError,
      );
      expect(context.repository.tasks).toEqual(snapshot);
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

    describe('desfazer', () => {
      it('conclusão devolve plano com a ocorrência gerada e desfazer a remove junto', async () => {
        const seriesContext = setupSeries();
        const before = structuredClone(seriesContext.repository.tasks[0]!);

        const done = await seriesContext.service.changeStatus('serie', 'DONE');
        const next = nextOf(seriesContext);

        expect(done.ok && done.undo).toEqual({
          kind: 'REVERT',
          previous: before,
          expectedUpdatedAt: MONDAY.toISOString(),
          generated: { id: next.id, updatedAt: next.updatedAt },
        });
        expect(seriesContext.scheduler.alarmsFor(next.id)).toHaveLength(1);

        const result = await seriesContext.service.undo(undoPlanOf(done));

        expect(result).toMatchObject({ status: 'UNDONE', removedTaskId: next.id });
        // O lembrete de 60 minutos venceu antes do desfazer e volta marcado como processado.
        expect(seriesContext.repository.tasks).toEqual([
          {
            ...before,
            updatedAt: MONDAY.toISOString(),
            reminders: [
              {
                id: 'r-60',
                type: 'OFFSET',
                offsetMinutes: 60,
                processedFor: new Date(MONDAY.getTime() - 60 * 60_000).toISOString(),
              },
            ],
          },
        ]);
        expect(seriesContext.repository.trash).toEqual([]);
        expect(seriesContext.scheduler.alarmsFor(next.id)).toEqual([]);
      });

      it('pular ocorrência devolve plano com a ocorrência gerada', async () => {
        const seriesContext = setupSeries();

        const skipped = await seriesContext.service.changeStatus('serie', 'CANCELLED', 'SKIP');

        expect(skipped.ok && skipped.undo).toMatchObject({
          kind: 'REVERT',
          generated: { id: nextOf(seriesContext).id },
        });
      });

      it('desfazer o encerramento da série devolve a regra à tarefa', async () => {
        const seriesContext = setupSeries();
        const before = structuredClone(seriesContext.repository.tasks[0]!);

        const ended = await seriesContext.service.changeStatus('serie', 'CANCELLED', 'END');

        expect(ended.ok && ended.undo).toEqual({
          kind: 'REVERT',
          previous: before,
          expectedUpdatedAt: MONDAY.toISOString(),
        });

        const result = await seriesContext.service.undo(undoPlanOf(ended));

        expect(result).toMatchObject({ status: 'UNDONE' });
        expect(seriesContext.repository.tasks[0]).toMatchObject({
          status: 'TODO',
          recurrence: { frequency: 'WEEKLY', weekdays: [1] },
        });
      });

      it('edição que conclui a ocorrência devolve plano com a ocorrência gerada', async () => {
        const seriesContext = setupSeries();
        const task = seriesContext.repository.tasks[0]!;

        const result = await seriesContext.service.update('serie', {
          title: 'Editado',
          dueAt: task.dueAt,
          reminders: [{ id: 'r-60', type: 'OFFSET', offsetMinutes: 60 }],
          recurrence: { frequency: 'WEEKLY', weekdays: [1] },
          status: 'DONE',
        });

        expect(result.ok && result.undo).toMatchObject({
          kind: 'REVERT',
          previous: task,
          generated: { id: nextOf(seriesContext).id },
        });
      });

      it('recusa o desfazer inteiro sem gravar quando a ocorrência gerada foi alterada', async () => {
        const seriesContext = setupSeries();
        const done = await seriesContext.service.changeStatus('serie', 'DONE');
        const next = nextOf(seriesContext);
        seriesContext.advanceTo(new Date(MONDAY.getTime() + 60_000));
        await seriesContext.service.update(next.id, {
          title: 'Gerada editada',
          dueAt: next.dueAt,
          recurrence: { frequency: 'WEEKLY', weekdays: [1] },
        });
        const snapshot = structuredClone(seriesContext.repository.tasks);

        await expect(seriesContext.service.undo(undoPlanOf(done))).resolves.toEqual({
          status: 'GENERATED_CHANGED',
        });
        expect(seriesContext.repository.tasks).toEqual(snapshot);
      });
    });
  });
});
