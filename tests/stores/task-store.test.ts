import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h } from 'vue';
import { TaskStorageError } from '@/application/task-repository';
import { useConnectedTaskStore, useTaskStore } from '@/stores/task-store';
import { createTaskTestContext } from '../support/task-app';
import { buildTask, FIXED_NOW, hoursFrom } from '../support/task-fixtures';

describe('useTaskStore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('carregamento', () => {
    it('carrega tarefas e controla o estado de carregamento', async () => {
      createTaskTestContext([buildTask()]);
      const store = useTaskStore();

      const loading = store.load();
      expect(store.loading).toBe(true);
      await loading;

      expect(store.loading).toBe(false);
      expect(store.loaded).toBe(true);
      expect(store.tasks).toEqual([buildTask()]);
    });

    it('expõe erro de carregamento e permite tentar novamente', async () => {
      const { repository } = createTaskTestContext([buildTask()]);
      repository.failNext.list = new TaskStorageError('UNAVAILABLE', 'Armazenamento indisponível.');
      const store = useTaskStore();

      await store.load();
      expect(store.loadError).toBe(
        'Não foi possível carregar as tarefas. Armazenamento indisponível.',
      );
      expect(store.loaded).toBe(false);

      await store.load();
      expect(store.loadError).toBeNull();
      expect(store.tasks).toHaveLength(1);
    });
  });

  describe('getters de apresentação', () => {
    const tasks = [
      buildTask({ id: 'a', title: 'Relatório', priority: 'LOW', dueAt: hoursFrom(FIXED_NOW, -1) }),
      buildTask({ id: 'b', title: 'Reunião', priority: 'URGENT', dueAt: hoursFrom(FIXED_NOW, 2) }),
      buildTask({ id: 'c', title: 'Relatório final', priority: 'HIGH', status: 'DONE' }),
    ];

    it('aplica filtros e ordenação sobre as tarefas carregadas', async () => {
      createTaskTestContext(tasks);
      const store = useTaskStore();
      await store.load();

      expect(store.visibleTasks.map((task) => task.id)).toEqual(['a', 'b', 'c']);

      store.setSortKey('PRIORITY');
      expect(store.visibleTasks.map((task) => task.id)).toEqual(['b', 'c', 'a']);

      store.setFilters({ search: 'relatório' });
      expect(store.hasActiveFilters).toBe(true);
      expect(store.visibleTasks.map((task) => task.id)).toEqual(['c', 'a']);

      store.setFilters({ dueSituation: 'OVERDUE' });
      expect(store.visibleTasks.map((task) => task.id)).toEqual(['a']);

      store.clearFilters();
      expect(store.hasActiveFilters).toBe(false);
      expect(store.sortKey).toBe('PRIORITY');
      expect(store.visibleTasks).toHaveLength(3);
    });

    it('classifica prazo com o relógio atual e o atualiza periodicamente', async () => {
      createTaskTestContext(tasks);
      const store = useTaskStore();
      await store.connect();

      expect(store.dueSituationOf(tasks[1]!)).toBe('DUE_SOON');

      vi.advanceTimersByTime(3 * 60 * 60 * 1000);
      expect(store.dueSituationOf(tasks[1]!)).toBe('OVERDUE');
      store.disconnect();
    });

    it('seleciona tarefa por id', async () => {
      createTaskTestContext(tasks);
      const store = useTaskStore();
      await store.load();

      store.select('b');
      expect(store.selectedTask?.title).toBe('Reunião');

      store.select(null);
      expect(store.selectedTask).toBeNull();
    });
  });

  describe('ações', () => {
    it('cria, atualiza e altera status mantendo o repository como fonte persistente', async () => {
      const { repository } = createTaskTestContext();
      const store = useTaskStore();

      const created = await store.create({ title: 'Nova' });
      expect(created.ok).toBe(true);
      expect(repository.tasks.map((task) => task.title)).toEqual(['Nova']);
      expect(store.tasks.map((task) => task.title)).toEqual(['Nova']);

      const id = created.ok ? created.task.id : '';
      await store.update(id, { title: 'Editada' });
      await store.changeStatus(id, 'DONE');

      expect(repository.tasks[0]).toMatchObject({ title: 'Editada', status: 'DONE' });
      expect(store.tasks[0]).toMatchObject({ title: 'Editada', status: 'DONE' });
    });

    it('retorna erros de validação sem alterar o estado', async () => {
      createTaskTestContext();
      const store = useTaskStore();

      const result = await store.create({ title: '' });

      expect(result).toEqual({ ok: false, errors: { title: 'Informe um título.' } });
      expect(store.tasks).toEqual([]);
    });

    it('informa falha de persistência sem apresentar sucesso', async () => {
      const { repository } = createTaskTestContext();
      repository.failNext.save = new TaskStorageError('UNAVAILABLE', 'Sem espaço.');
      const store = useTaskStore();

      const result = await store.create({ title: 'Nova' });

      expect(result).toEqual({
        ok: false,
        errors: {},
        message: 'A tarefa não foi salva. Sem espaço.',
      });
      expect(store.tasks).toEqual([]);
    });

    it('exclui tarefa e limpa a seleção', async () => {
      const { repository } = createTaskTestContext([buildTask()]);
      const store = useTaskStore();
      await store.load();
      store.select('task-1');

      await expect(store.remove('task-1')).resolves.toEqual({ ok: true });

      expect(repository.tasks).toEqual([]);
      expect(store.tasks).toEqual([]);
      expect(store.selectedTaskId).toBeNull();
    });

    it('mantém a tarefa quando a exclusão falha', async () => {
      const { repository } = createTaskTestContext([buildTask()]);
      repository.failNext.moveToTrash = new Error('falhou');
      const store = useTaskStore();
      await store.load();

      await expect(store.remove('task-1')).resolves.toEqual({
        ok: false,
        message: 'A tarefa não foi excluída.',
      });
      expect(store.tasks).toHaveLength(1);
    });
  });

  describe('marcação de subtarefas', () => {
    const task = buildTask({
      subtasks: [
        { id: 's-1', title: 'Reservar sala', done: false },
        { id: 's-2', title: 'Enviar pauta', done: false },
      ],
    });

    it('persiste a marcação e atualiza a tarefa na lista', async () => {
      const { repository } = createTaskTestContext([task]);
      const store = useTaskStore();
      await store.load();

      const result = await store.setSubtaskDone('task-1', 's-2', true);

      expect(result).toMatchObject({ ok: true, task: { id: 'task-1' } });
      expect(repository.tasks[0]?.subtasks[1]?.done).toBe(true);
      expect(store.tasks[0]?.subtasks.map((subtask) => subtask.done)).toEqual([false, true]);
    });

    it('trata marcação sem mudança como sucesso', async () => {
      createTaskTestContext([task]);
      const store = useTaskStore();
      await store.load();

      await expect(store.setSubtaskDone('task-1', 's-1', false)).resolves.toMatchObject({
        ok: true,
      });
    });

    it('traduz falha de armazenamento como as demais mutações', async () => {
      const { repository } = createTaskTestContext([task]);
      repository.failNext.updateTaskConditionally = new TaskStorageError(
        'UNAVAILABLE',
        'Sem espaço.',
      );
      const store = useTaskStore();
      await store.load();

      await expect(store.setSubtaskDone('task-1', 's-1', true)).resolves.toEqual({
        ok: false,
        message: 'A alteração da subtarefa não foi salva. Sem espaço.',
      });
      expect(store.tasks[0]?.subtasks[0]?.done).toBe(false);
    });

    it('informa subtarefa inexistente e reflete a versão persistida', async () => {
      const { repository } = createTaskTestContext([task]);
      const store = useTaskStore();
      await store.load();
      repository.tasks = [{ ...task, subtasks: [task.subtasks[1]!] }];

      await expect(store.setSubtaskDone('task-1', 's-1', true)).resolves.toEqual({
        ok: false,
        message: 'A alteração da subtarefa não foi salva. A subtarefa não existe mais.',
      });
      expect(store.tasks[0]?.subtasks.map((subtask) => subtask.id)).toEqual(['s-2']);
    });

    it('informa tarefa inexistente', async () => {
      const { repository } = createTaskTestContext([task]);
      const store = useTaskStore();
      await store.load();
      repository.tasks = [];

      await expect(store.setSubtaskDone('task-1', 's-1', true)).resolves.toEqual({
        ok: false,
        message: 'A alteração da subtarefa não foi salva. A tarefa não existe mais.',
      });
      expect(store.tasks).toEqual([]);
    });
  });

  describe('sincronização', () => {
    it('reflete alterações externas e não duplica inscrições', async () => {
      const { repository } = createTaskTestContext();
      const store = useTaskStore();

      await store.connect();
      await store.connect();
      expect(repository.listeners.size).toBe(1);

      repository.replaceExternally([buildTask({ title: 'De outra superfície' })]);
      expect(store.tasks.map((task) => task.title)).toEqual(['De outra superfície']);

      store.disconnect();
      expect(repository.listeners.size).toBe(0);
      repository.replaceExternally([]);
      expect(store.tasks).toHaveLength(1);
    });

    it('expõe erro de sincronização recebido do armazenamento', async () => {
      const { repository } = createTaskTestContext();
      const store = useTaskStore();
      await store.connect();

      repository.emitError(new TaskStorageError('INCOMPATIBLE_DATA', 'Formato incompatível.'));

      expect(store.syncError).toBe(
        'Não foi possível sincronizar as tarefas. Formato incompatível.',
      );
      store.disconnect();
    });
  });

  describe('useConnectedTaskStore', () => {
    const Surface = defineComponent({
      setup() {
        const store = useConnectedTaskStore();
        return () =>
          h(
            'ul',
            store.tasks.map((task) => h('li', { key: task.id }, task.title)),
          );
      },
    });

    it('conecta ao montar, recebe atualizações externas e remove a inscrição ao desmontar', async () => {
      const context = createTaskTestContext([buildTask({ title: 'Inicial' })]);

      const wrapper = mount(Surface, { global: context.global });
      await flushPromises();

      expect(context.repository.listeners.size).toBe(1);
      expect(wrapper.text()).toBe('Inicial');

      context.repository.replaceExternally([buildTask({ title: 'Externa' })]);
      await flushPromises();
      expect(wrapper.text()).toBe('Externa');

      wrapper.unmount();
      expect(context.repository.listeners.size).toBe(0);
    });

    it('não acumula inscrições ao abrir a superfície repetidamente', async () => {
      const context = createTaskTestContext();

      for (let attempt = 0; attempt < 3; attempt++) {
        const wrapper = mount(Surface, { global: context.global });
        await flushPromises();
        wrapper.unmount();
      }

      expect(context.repository.listeners.size).toBe(0);
    });
  });
});
