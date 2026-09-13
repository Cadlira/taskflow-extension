import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TaskList from '@/components/tasks/TaskList.vue';
import { buildTask, FIXED_NOW, hoursFrom } from '../../support/task-fixtures';

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
      [tasks[0], 'DONE'],
      [tasks[1], 'CANCELLED'],
      [tasks[2], 'TODO'],
      [tasks[3], 'IN_PROGRESS'],
    ]);
    expect(wrapper.emitted('edit')).toEqual([[tasks[0]]]);
    expect(wrapper.emitted('delete')).toEqual([[tasks[0]]]);
  });

  it('desabilita ações da tarefa em processamento', () => {
    const wrapper = mount(TaskList, { props: { tasks, now: FIXED_NOW, busyTaskId: 'todo' } });

    expect(
      cardFor(wrapper, 'todo')
        .findAll('button')
        .every((button) => button.attributes('disabled') !== undefined),
    ).toBe(true);
    expect(buttonIn(cardFor(wrapper, 'done'), 'Editar').attributes('disabled')).toBeUndefined();
  });
});
