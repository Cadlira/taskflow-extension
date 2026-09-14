import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TaskList from '@/components/tasks/TaskList.vue';
import { buildTask, FIXED_NOW, hoursFrom } from '../../support/task-fixtures';

interface TaskListExposed {
  focusControl(taskId: string, action: string): boolean;
}

function exposedControls(wrapper: ReturnType<typeof mount>): TaskListExposed {
  return wrapper.vm as unknown as TaskListExposed;
}

function cardFor(wrapper: ReturnType<typeof mount>, id: string) {
  return wrapper.get(`[data-task-id="${id}"]`);
}

function buttonIn(card: ReturnType<ReturnType<typeof mount>['get']>, label: string) {
  const button = card.findAll('button').find((candidate) => candidate.text().startsWith(label));
  if (!button) throw new Error(`Botão ${label} não encontrado`);
  return button;
}

describe('TaskList', () => {
  const tasks = [
    buildTask({ id: 'todo', title: 'A fazer', status: 'TODO', priority: 'LOW' }),
    buildTask({ id: 'progress', title: 'Andamento', status: 'IN_PROGRESS', priority: 'MEDIUM' }),
    buildTask({ id: 'done', title: 'Feita', status: 'DONE', priority: 'HIGH' }),
    buildTask({ id: 'cancelled', title: 'Cancelada', status: 'CANCELLED', priority: 'URGENT' }),
  ];

  it('exibe título, status e prioridade dos quatro status', () => {
    const wrapper = mount(TaskList, { props: { tasks, now: FIXED_NOW } });

    const rows = wrapper
      .findAll('li')
      .map((item) => [
        item.get('h3').text(),
        item.get('[data-test="status"]').text(),
        item.get('[data-test="priority"]').text(),
      ]);
    expect(rows).toEqual([
      ['A fazer', 'A fazer', 'Baixa'],
      ['Andamento', 'Em andamento', 'Média'],
      ['Feita', 'Concluída', 'Alta'],
      ['Cancelada', 'Cancelada', 'Urgente'],
    ]);
    expect(cardFor(wrapper, 'done').get('article').classes()).toContain('status-done');
  });

  it('exibe prazo somente quando existente', () => {
    const dueAt = hoursFrom(FIXED_NOW, 72);
    const wrapper = mount(TaskList, {
      props: { tasks: [buildTask({ id: 'a', dueAt }), buildTask({ id: 'b' })], now: FIXED_NOW },
    });

    expect(cardFor(wrapper, 'a').get('time').attributes('datetime')).toBe(dueAt);
    expect(cardFor(wrapper, 'b').find('[data-test="due-at"]').exists()).toBe(false);
  });

  it('sinaliza tarefas atrasadas e próximas do vencimento, exceto terminais e sem prazo', () => {
    const wrapper = mount(TaskList, {
      props: {
        now: FIXED_NOW,
        tasks: [
          buildTask({ id: 'overdue', dueAt: hoursFrom(FIXED_NOW, -1) }),
          buildTask({ id: 'soon', status: 'IN_PROGRESS', dueAt: hoursFrom(FIXED_NOW, 5) }),
          buildTask({ id: 'later', dueAt: hoursFrom(FIXED_NOW, 48) }),
          buildTask({ id: 'done-late', status: 'DONE', dueAt: hoursFrom(FIXED_NOW, -1) }),
          buildTask({ id: 'no-due' }),
        ],
      },
    });

    const badge = (id: string) => cardFor(wrapper, id).find('[data-test="due-situation"]');
    expect(badge('overdue').text()).toBe('Atrasada');
    expect(cardFor(wrapper, 'overdue').get('article').classes()).toContain('overdue');
    expect(badge('soon').text()).toBe('Vence em até 24 h');
    expect(badge('later').exists()).toBe(false);
    expect(badge('done-late').exists()).toBe(false);
    expect(badge('no-due').exists()).toBe(false);
  });

  it('oferece concluir e cancelar para tarefas ativas e reabrir para terminais', () => {
    const wrapper = mount(TaskList, { props: { tasks, now: FIXED_NOW } });

    const labels = (id: string) =>
      cardFor(wrapper, id)
        .findAll('button')
        .map((button) => button.element.firstChild?.textContent?.trim());
    expect(labels('todo')).toEqual(['Editar', 'Concluir', 'Cancelar tarefa', 'Excluir']);
    expect(labels('done')).toEqual(['Editar', 'Reabrir', 'Excluir']);
    expect(labels('cancelled')).toEqual(['Editar', 'Reabrir', 'Excluir']);
  });

  it('emite as ações rápidas e a alteração direta de status', async () => {
    const wrapper = mount(TaskList, { props: { tasks, now: FIXED_NOW } });

    await buttonIn(cardFor(wrapper, 'todo'), 'Concluir').trigger('click');
    await buttonIn(cardFor(wrapper, 'progress'), 'Cancelar').trigger('click');
    await buttonIn(cardFor(wrapper, 'done'), 'Reabrir').trigger('click');
    await cardFor(wrapper, 'cancelled').get('select').setValue('IN_PROGRESS');
    await buttonIn(cardFor(wrapper, 'todo'), 'Editar').trigger('click');
    await buttonIn(cardFor(wrapper, 'todo'), 'Excluir').trigger('click');

    expect(wrapper.emitted('change-status')).toEqual([
      [tasks[0], 'DONE', { action: 'complete', fromFocusout: false }],
      [tasks[1], 'CANCELLED', { action: 'cancel', fromFocusout: false }],
      [tasks[2], 'TODO', { action: 'reopen', fromFocusout: false }],
      [tasks[3], 'IN_PROGRESS', { action: 'status', fromFocusout: false }],
    ]);
    expect(wrapper.emitted('edit')).toEqual([[tasks[0]]]);
    expect(wrapper.emitted('delete')).toEqual([[tasks[0]]]);
  });

  it('marca os controles da tarefa em processamento como indisponíveis sem desabilitá-los', () => {
    const wrapper = mount(TaskList, { props: { tasks, now: FIXED_NOW, busyTaskId: 'todo' } });

    const busyControls = cardFor(wrapper, 'todo').findAll('button, select');
    expect(busyControls.length).toBeGreaterThan(0);
    for (const control of busyControls) {
      expect(control.attributes('aria-disabled')).toBe('true');
      expect(control.attributes('disabled')).toBeUndefined();
    }

    const other = cardFor(wrapper, 'done');
    expect(buttonIn(other, 'Editar').attributes('aria-disabled')).toBeUndefined();
    expect(other.get('select').attributes('aria-disabled')).toBeUndefined();
  });

  describe('seletor de status', () => {
    it('não grava ao percorrer o seletor pelas setas', async () => {
      const task = buildTask({ id: 'a' });
      const wrapper = mount(TaskList, { props: { tasks: [task], now: FIXED_NOW } });
      const select = cardFor(wrapper, 'a').get('select');

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('IN_PROGRESS');
      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('DONE');

      expect(wrapper.emitted('change-status')).toBeUndefined();
      expect((select.element as HTMLSelectElement).value).toBe('DONE');
    });

    it('aplica o status escolhido com Enter em uma única alteração', async () => {
      const task = buildTask({ id: 'a' });
      const wrapper = mount(TaskList, { props: { tasks: [task], now: FIXED_NOW } });
      const select = cardFor(wrapper, 'a').get('select');

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('IN_PROGRESS');
      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('DONE');
      await select.trigger('keydown', { key: 'Enter' });

      expect(wrapper.emitted('change-status')).toEqual([
        [task, 'DONE', { action: 'status', fromFocusout: false }],
      ]);
    });

    it('aplica a escolha exibida ao sair do seletor', async () => {
      const task = buildTask({ id: 'a' });
      const wrapper = mount(TaskList, { props: { tasks: [task], now: FIXED_NOW } });
      const select = cardFor(wrapper, 'a').get('select');

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('IN_PROGRESS');
      await select.trigger('focusout');

      expect(wrapper.emitted('change-status')).toEqual([
        [task, 'IN_PROGRESS', { action: 'status', fromFocusout: true }],
      ]);
    });

    it('Escape restaura o status persistido sem gravar nem ao sair', async () => {
      const task = buildTask({ id: 'a' });
      const wrapper = mount(TaskList, { props: { tasks: [task], now: FIXED_NOW } });
      const select = cardFor(wrapper, 'a').get('select');

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('CANCELLED');
      await select.trigger('keydown', { key: 'Escape' });

      expect((select.element as HTMLSelectElement).value).toBe('TODO');

      await select.trigger('focusout');
      expect(wrapper.emitted('change-status')).toBeUndefined();
    });

    it('aplica imediatamente a escolha feita sem navegação pelo teclado', async () => {
      const task = buildTask({ id: 'a' });
      const wrapper = mount(TaskList, { props: { tasks: [task], now: FIXED_NOW } });

      await cardFor(wrapper, 'a').get('select').setValue('IN_PROGRESS');

      expect(wrapper.emitted('change-status')).toEqual([
        [task, 'IN_PROGRESS', { action: 'status', fromFocusout: false }],
      ]);
    });

    it('não grava ao confirmar o status já persistido', async () => {
      const task = buildTask({ id: 'a' });
      const wrapper = mount(TaskList, { props: { tasks: [task], now: FIXED_NOW } });
      const select = cardFor(wrapper, 'a').get('select');

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('DONE');
      await select.setValue('TODO');
      await select.trigger('keydown', { key: 'Enter' });
      await select.trigger('focusout');

      expect(wrapper.emitted('change-status')).toBeUndefined();
    });

    it('descarta a escolha pendente quando a prop de tarefas muda sem alterar o status', async () => {
      const task = buildTask({ id: 'a' });
      const wrapper = mount(TaskList, { props: { tasks: [task], now: FIXED_NOW } });
      const select = cardFor(wrapper, 'a').get('select');

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('DONE');
      await wrapper.setProps({ tasks: [task] });

      expect((select.element as HTMLSelectElement).value).toBe('TODO');
      expect(wrapper.emitted('change-status')).toBeUndefined();
    });

    it('exibe o novo status quando a prop muda por outra via', async () => {
      const task = buildTask({ id: 'a' });
      const wrapper = mount(TaskList, { props: { tasks: [task], now: FIXED_NOW } });
      const select = cardFor(wrapper, 'a').get('select');

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('DONE');
      await wrapper.setProps({ tasks: [{ ...task, status: 'IN_PROGRESS' }] });

      expect((select.element as HTMLSelectElement).value).toBe('IN_PROGRESS');
      expect(wrapper.emitted('change-status')).toBeUndefined();
    });
  });

  it('foca o controle pedido e devolve falso para tarefa inexistente', () => {
    const wrapper = mount(TaskList, {
      props: { tasks, now: FIXED_NOW },
      attachTo: document.body,
    });
    const reopen = buttonIn(cardFor(wrapper, 'done'), 'Reabrir');

    expect(exposedControls(wrapper).focusControl('done', 'reopen')).toBe(true);
    expect(document.activeElement).toBe(reopen.element);

    expect(exposedControls(wrapper).focusControl('inexistente', 'edit')).toBe(false);
    expect(document.activeElement).toBe(reopen.element);
    wrapper.unmount();
  });

  it('ignora acionamentos da tarefa em processamento e mantém o foco no controle', async () => {
    const wrapper = mount(TaskList, {
      props: { tasks, now: FIXED_NOW, busyTaskId: 'todo' },
      attachTo: document.body,
    });
    const complete = buttonIn(cardFor(wrapper, 'todo'), 'Concluir');
    complete.element.focus();

    await complete.trigger('click');
    await buttonIn(cardFor(wrapper, 'todo'), 'Editar').trigger('click');
    await buttonIn(cardFor(wrapper, 'todo'), 'Excluir').trigger('click');
    await cardFor(wrapper, 'todo').get('select').setValue('IN_PROGRESS');

    expect(wrapper.emitted('change-status')).toBeUndefined();
    expect(wrapper.emitted('edit')).toBeUndefined();
    expect(wrapper.emitted('delete')).toBeUndefined();
    expect(document.activeElement).toBe(complete.element);
    wrapper.unmount();
  });
});
