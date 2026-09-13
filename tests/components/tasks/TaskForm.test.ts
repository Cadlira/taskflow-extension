import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import TaskForm from '@/components/tasks/TaskForm.vue';
import type { TaskDraft } from '@/domain/task-draft';
import { buildTask } from '../../support/task-fixtures';

function lastSubmitted(wrapper: ReturnType<typeof mount>): TaskDraft {
  const events = wrapper.emitted('submit') as [TaskDraft][] | undefined;
  const draft = events?.at(-1)?.[0];
  if (!draft) throw new Error('submit não foi emitido');
  return draft;
}

describe('TaskForm', () => {
  it('apresenta todos os campos do MVP e foca o título ao abrir', () => {
    const wrapper = mount(TaskForm, { attachTo: document.body });

    for (const name of [
      'title',
      'description',
      'requester',
      'assignee',
      'status',
      'priority',
      'dueAt',
      'tags',
      'sourceUrl',
    ]) {
      expect(wrapper.find(`[name="${name}"]`).exists(), name).toBe(true);
    }
    expect(wrapper.findAll('input[name="reminders"]')).toHaveLength(4);
    expect(document.activeElement).toBe(wrapper.get('[name="title"]').element);
    expect(wrapper.get('h2').text()).toBe('Nova tarefa');
    wrapper.unmount();
  });

  it('emite rascunho de criação com valores padrão e prazo convertido para UTC', async () => {
    const wrapper = mount(TaskForm);

    await wrapper.get('[name="title"]').setValue('Preparar demo');
    await wrapper.get('[name="description"]').setValue('Roteiro e dados');
    await wrapper.get('[name="requester"]').setValue('Ana');
    await wrapper.get('[name="assignee"]').setValue('Bruno');
    await wrapper.get('[name="priority"]').setValue('HIGH');
    await wrapper.get('[name="dueAt"]').setValue('2026-09-20T14:45');
    await wrapper.get('input[name="reminders"][value="60"]').setValue(true);
    await wrapper.get('input[name="reminders"][value="0"]').setValue(true);
    await wrapper.get('[name="tags"]').setValue('cliente, demo');
    await wrapper.get('[name="sourceUrl"]').setValue('https://example.com');
    await wrapper.get('form').trigger('submit');

    expect(lastSubmitted(wrapper)).toEqual({
      title: 'Preparar demo',
      description: 'Roteiro e dados',
      requester: 'Ana',
      assignee: 'Bruno',
      status: 'TODO',
      priority: 'HIGH',
      dueAt: new Date(2026, 8, 20, 14, 45).toISOString(),
      reminderOffsets: [60, 0],
      tags: ['cliente', ' demo'],
      sourceUrl: 'https://example.com',
    });
  });

  it('preenche a edição com os valores persistidos no fuso local', () => {
    const dueAt = new Date(2026, 8, 21, 8, 5).toISOString();
    const task = buildTask({
      title: 'Existente',
      status: 'IN_PROGRESS',
      priority: 'URGENT',
      dueAt,
      reminders: [{ id: 'r', offsetMinutes: 1440 }],
      tags: ['a', 'b'],
      sourceUrl: 'https://example.com/x',
    });

    const wrapper = mount(TaskForm, { props: { task } });

    expect(wrapper.get('h2').text()).toBe('Editar tarefa');
    expect((wrapper.get('[name="title"]').element as HTMLInputElement).value).toBe('Existente');
    expect((wrapper.get('[name="status"]').element as HTMLSelectElement).value).toBe('IN_PROGRESS');
    expect((wrapper.get('[name="dueAt"]').element as HTMLInputElement).value).toBe(
      '2026-09-21T08:05',
    );
    expect(
      (wrapper.get('input[name="reminders"][value="1440"]').element as HTMLInputElement).checked,
    ).toBe(true);
    expect((wrapper.get('[name="tags"]').element as HTMLInputElement).value).toBe('a, b');
    expect(wrapper.get('button[type="submit"]').text()).toBe('Salvar alterações');
  });

  it('preserva o instante UTC ao salvar edição sem alterar o prazo', async () => {
    const dueAt = new Date(2026, 8, 21, 8, 5).toISOString();
    const wrapper = mount(TaskForm, { props: { task: buildTask({ dueAt }) } });

    await wrapper.get('form').trigger('submit');

    expect(lastSubmitted(wrapper).dueAt).toBe(dueAt);
  });

  it('apresenta erros junto aos campos sem perder o preenchimento', async () => {
    const wrapper = mount(TaskForm);
    await wrapper.get('[name="title"]').setValue('   ');
    await wrapper.get('[name="sourceUrl"]').setValue('ftp://x');

    await wrapper.setProps({
      errors: { title: 'Informe um título.', sourceUrl: 'Informe uma URL válida.' },
    });

    const title = wrapper.get('[name="title"]');
    expect(title.attributes('aria-invalid')).toBe('true');
    const errorId = title.attributes('aria-describedby');
    expect(wrapper.get(`#${CSS.escape(errorId!)}`).text()).toBe('Informe um título.');
    expect(wrapper.text()).toContain('Informe uma URL válida.');
    expect((wrapper.get('[name="sourceUrl"]').element as HTMLInputElement).value).toBe('ftp://x');
  });

  it('emite cancelamento sem enviar dados', async () => {
    const wrapper = mount(TaskForm, { props: { task: buildTask() } });
    await wrapper.get('[name="title"]').setValue('Não salvar');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Cancelar')!
      .trigger('click');

    expect(wrapper.emitted('cancel')).toHaveLength(1);
    expect(wrapper.emitted('submit')).toBeUndefined();
  });

  describe('lembretes', () => {
    it('oferece as quatro opções e informa que exigem prazo', () => {
      const wrapper = mount(TaskForm);

      expect(wrapper.findAll('.checkbox').map((option) => option.text())).toEqual([
        'No horário do prazo',
        '15 minutos antes',
        '1 hora antes',
        '1 dia antes',
      ]);
      expect(wrapper.text()).toContain('Lembretes exigem um prazo');
    });

    it('associa o erro de lembrete sem prazo ao grupo de opções', async () => {
      const wrapper = mount(TaskForm, {
        props: { errors: { reminders: 'Lembretes exigem um prazo.' } },
      });

      const group = wrapper.get('fieldset');
      expect(group.attributes('aria-invalid')).toBe('true');
      const describedBy = group.attributes('aria-describedby')!.split(' ');
      expect(describedBy).toHaveLength(2);
      expect(wrapper.get(`#${CSS.escape(describedBy[1]!)}`).text()).toBe(
        'Lembretes exigem um prazo.',
      );
    });
  });
});
