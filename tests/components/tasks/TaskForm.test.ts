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

function focusFirstInvalid(wrapper: ReturnType<typeof mount>): boolean {
  return (wrapper.vm as unknown as { focusFirstInvalid(): boolean }).focusFirstInvalid();
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
      reminders: [
        { type: 'OFFSET', offsetMinutes: 60 },
        { type: 'OFFSET', offsetMinutes: 0 },
      ],
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
      reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 1440 }],
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

  it('reabre lembrete absoluto convertido para o fuso local', () => {
    const at = new Date(2026, 8, 21, 8, 5).toISOString();
    const wrapper = mount(TaskForm, {
      props: {
        task: buildTask({
          dueAt: new Date(2026, 8, 22, 10, 0).toISOString(),
          reminders: [{ id: 'r', type: 'AT', at }],
        }),
      },
    });

    expect((wrapper.get('select[name="reminder-type"]').element as HTMLSelectElement).value).toBe(
      'AT',
    );
    expect((wrapper.get('input[name="reminder-at"]').element as HTMLInputElement).value).toBe(
      '2026-09-21T08:05',
    );
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

  describe('foco no primeiro erro', () => {
    it('foca o primeiro campo inválido na ordem do documento', () => {
      const wrapper = mount(TaskForm, {
        props: { errors: { title: 'Informe um título.', description: 'Descrição inválida.' } },
        attachTo: document.body,
      });

      expect(focusFirstInvalid(wrapper)).toBe(true);
      expect(document.activeElement).toBe(wrapper.get('[name="title"]').element);
      wrapper.unmount();
    });

    it('foca a primeira opção de lembrete quando o grupo é o primeiro inválido', () => {
      const wrapper = mount(TaskForm, {
        props: {
          errors: { reminders: 'Lembretes exigem um prazo.', sourceUrl: 'Informe uma URL válida.' },
        },
        attachTo: document.body,
      });

      expect(focusFirstInvalid(wrapper)).toBe(true);
      expect(document.activeElement).toBe(
        wrapper.get('input[name="reminders"][value="0"]').element,
      );
      wrapper.unmount();
    });

    it('devolve falso quando não há campo inválido', () => {
      const wrapper = mount(TaskForm, { attachTo: document.body });

      expect(focusFirstInvalid(wrapper)).toBe(false);
      wrapper.unmount();
    });
  });

  describe('lembretes', () => {
    function addReminderButton(wrapper: ReturnType<typeof mount>) {
      return wrapper.findAll('button').find((button) => button.text() === 'Adicionar lembrete')!;
    }

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

      const group = wrapper.get('fieldset.reminders');
      expect(group.attributes('aria-invalid')).toBe('true');
      const describedBy = group.attributes('aria-describedby')!.split(' ');
      expect(describedBy).toHaveLength(2);
      expect(wrapper.get(`#${CSS.escape(describedBy[1]!)}`).text()).toBe(
        'Lembretes exigem um prazo.',
      );
    });

    it('adiciona item personalizado e envia o deslocamento convertido em minutos', async () => {
      const wrapper = mount(TaskForm);
      await wrapper.get('[name="title"]').setValue('Com lembrete');

      await addReminderButton(wrapper).trigger('click');
      await wrapper.get('input[name="reminder-offset"]').setValue('2');
      await wrapper.get('select[name="reminder-unit"]').setValue('HOURS');
      await wrapper.get('form').trigger('submit');

      expect(lastSubmitted(wrapper).reminders).toEqual([
        { type: 'OFFSET', offsetMinutes: 120 },
      ]);
    });

    it('converte horário absoluto digitado no fuso local para ISO UTC', async () => {
      const wrapper = mount(TaskForm);
      await wrapper.get('[name="title"]').setValue('Com horário');

      await addReminderButton(wrapper).trigger('click');
      await wrapper.get('select[name="reminder-type"]').setValue('AT');
      await wrapper.get('input[name="reminder-at"]').setValue('2026-09-20T14:45');
      await wrapper.get('form').trigger('submit');

      expect(lastSubmitted(wrapper).reminders).toEqual([
        { type: 'AT', at: new Date(2026, 8, 20, 14, 45).toISOString() },
      ]);
    });

    it('remove o item da lista', async () => {
      const wrapper = mount(TaskForm);
      await wrapper.get('[name="title"]').setValue('Com lembrete');

      await addReminderButton(wrapper).trigger('click');
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Remover')!
        .trigger('click');
      await wrapper.get('form').trigger('submit');

      expect(lastSubmitted(wrapper).reminders).toEqual([]);
    });

    it('limita a inclusão a dez lembretes', async () => {
      const task = buildTask({
        dueAt: '2026-09-20T12:00:00.000Z',
        reminders: Array.from({ length: 10 }, (_, index) => ({
          id: `r${index}`,
          type: 'OFFSET' as const,
          offsetMinutes: (index + 1) * 10,
        })),
      });
      const wrapper = mount(TaskForm, { props: { task } });

      expect(addReminderButton(wrapper).attributes('disabled')).toBeDefined();
      expect(wrapper.text()).toContain('10 de 10 lembretes configurados');
    });

    it('ativar e desativar um preset preserva os demais lembretes e seus identificadores', async () => {
      const task = buildTask({
        dueAt: '2026-09-20T12:00:00.000Z',
        reminders: [
          { id: 'manual', type: 'OFFSET', offsetMinutes: 90 },
          { id: 'preset', type: 'OFFSET', offsetMinutes: 60 },
        ],
      });
      const wrapper = mount(TaskForm, { props: { task } });

      await wrapper.get('input[name="reminders"][value="60"]').setValue(false);
      await wrapper.get('form').trigger('submit');

      expect(lastSubmitted(wrapper).reminders).toEqual([
        { id: 'manual', type: 'OFFSET', offsetMinutes: 90 },
      ]);
    });

    it('mostra o erro do item e foca o primeiro controle inválido', () => {
      const task = buildTask({
        dueAt: '2026-09-20T12:00:00.000Z',
        reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 60 }],
      });
      const wrapper = mount(TaskForm, {
        props: {
          task,
          errors: { reminderItems: ['O horário do lembrete já passou.'] },
        },
        attachTo: document.body,
      });

      expect(wrapper.text()).toContain('O horário do lembrete já passou.');
      expect(focusFirstInvalid(wrapper)).toBe(true);
      expect(document.activeElement).toBe(wrapper.get('input[name="reminder-offset"]').element);
      wrapper.unmount();
    });
  });

  describe('recorrência', () => {
    const dueAt = new Date(2026, 8, 20, 9).toISOString();

    function stopSeriesButton(wrapper: ReturnType<typeof mount>) {
      return wrapper.findAll('button').find((button) => button.text() === 'Encerrar série');
    }

    it('configura uma regra diária e emite o rascunho', async () => {
      const wrapper = mount(TaskForm);
      await wrapper.get('[name="title"]').setValue('Regar plantas');
      await wrapper.get('[name="dueAt"]').setValue('2026-09-20T09:00');
      await wrapper.get('[name="recurrence-frequency"]').setValue('DAILY');
      await wrapper.get('[name="recurrence-interval-days"]').setValue('3');
      await wrapper.get('form').trigger('submit');

      expect(lastSubmitted(wrapper).recurrence).toEqual({ frequency: 'DAILY', intervalDays: 3 });
    });

    it('configura uma regra semanal com dois dias', async () => {
      const wrapper = mount(TaskForm);
      await wrapper.get('[name="title"]').setValue('Relatório');
      await wrapper.get('[name="dueAt"]').setValue('2026-09-21T09:00');
      await wrapper.get('[name="recurrence-frequency"]').setValue('WEEKLY');
      await wrapper.get('input[name="recurrence-weekdays"][value="1"]').setValue(true);
      await wrapper.get('input[name="recurrence-weekdays"][value="4"]').setValue(true);
      await wrapper.get('form').trigger('submit');

      expect(lastSubmitted(wrapper).recurrence).toEqual({ frequency: 'WEEKLY', weekdays: [1, 4] });
    });

    it('configura uma regra mensal com limite', async () => {
      const wrapper = mount(TaskForm);
      await wrapper.get('[name="title"]').setValue('Pagar conta');
      await wrapper.get('[name="dueAt"]').setValue('2026-09-20T09:00');
      await wrapper.get('[name="recurrence-frequency"]').setValue('MONTHLY');
      await wrapper.get('[name="recurrence-day-of-month"]').setValue('10');
      await wrapper.get('[name="recurrence-until"]').setValue('2026-12-31T23:59');
      await wrapper.get('form').trigger('submit');

      expect(lastSubmitted(wrapper).recurrence).toEqual({
        frequency: 'MONTHLY',
        dayOfMonth: 10,
        until: new Date(2026, 11, 31, 23, 59).toISOString(),
      });
    });

    it('não envia recorrência quando a frequência não repetir está selecionada', async () => {
      const wrapper = mount(TaskForm);
      await wrapper.get('[name="title"]').setValue('Sem repetição');
      await wrapper.get('form').trigger('submit');

      expect(lastSubmitted(wrapper).recurrence).toBeUndefined();
      expect(wrapper.find('[name="recurrence-until"]').exists()).toBe(false);
    });

    it('preenche a edição com a regra persistida', () => {
      const wrapper = mount(TaskForm, {
        props: {
          task: buildTask({
            dueAt,
            seriesId: 'serie-1',
            recurrence: { frequency: 'WEEKLY', weekdays: [1, 4] },
          }),
        },
      });

      expect(
        (wrapper.get('[name="recurrence-frequency"]').element as HTMLSelectElement).value,
      ).toBe('WEEKLY');
      expect(
        (wrapper.get('input[name="recurrence-weekdays"][value="1"]').element as HTMLInputElement)
          .checked,
      ).toBe(true);
      expect(
        (wrapper.get('input[name="recurrence-weekdays"][value="4"]').element as HTMLInputElement)
          .checked,
      ).toBe(true);
    });

    it('associa os erros por campo da regra aos controles', () => {
      const wrapper = mount(TaskForm, {
        props: {
          task: buildTask({
            dueAt,
            seriesId: 'serie-1',
            recurrence: { frequency: 'DAILY', intervalDays: 1 },
          }),
          errors: { recurrenceFields: { intervalDays: 'Informe um intervalo de 1 a 365 dias.' } },
        },
      });

      const input = wrapper.get('[name="recurrence-interval-days"]');
      expect(input.attributes('aria-invalid')).toBe('true');
      const describedBy = input.attributes('aria-describedby')!;
      expect(wrapper.get(`#${CSS.escape(describedBy)}`).text()).toBe(
        'Informe um intervalo de 1 a 365 dias.',
      );
    });

    it('mostra o conflito com lembrete absoluto e foca o primeiro campo inválido', () => {
      const wrapper = mount(TaskForm, {
        props: {
          task: buildTask({
            dueAt,
            seriesId: 'serie-1',
            recurrence: { frequency: 'DAILY', intervalDays: 1 },
            reminders: [{ id: 'r', type: 'AT', at: new Date(2026, 8, 19, 9).toISOString() }],
          }),
          errors: {
            recurrence:
              'Remova ou converta os lembretes de horário absoluto antes de salvar a recorrência.',
            reminderItems: ['Tarefas recorrentes aceitam somente lembretes por deslocamento.'],
          },
        },
        attachTo: document.body,
      });

      expect(wrapper.text()).toContain('Remova ou converta os lembretes de horário absoluto');
      expect(focusFirstInvalid(wrapper)).toBe(true);
      expect(document.activeElement).toBe(
        wrapper.get('[name="recurrence-frequency"]').element,
      );
      wrapper.unmount();
    });

    it('encerra a série removendo a regra do rascunho', async () => {
      const wrapper = mount(TaskForm, {
        props: {
          task: buildTask({
            dueAt,
            seriesId: 'serie-1',
            recurrence: { frequency: 'WEEKLY', weekdays: [1] },
          }),
        },
      });

      await stopSeriesButton(wrapper)!.trigger('click');
      await wrapper.get('form').trigger('submit');

      expect(lastSubmitted(wrapper).recurrence).toBeUndefined();
      expect(wrapper.text()).toContain('A regra será removida da tarefa ao salvar');
    });

    it('não oferece encerrar série para tarefa sem regra', () => {
      const wrapper = mount(TaskForm, { props: { task: buildTask({ dueAt }) } });

      expect(stopSeriesButton(wrapper)).toBeUndefined();
    });
  });

  describe('valores iniciais de captura', () => {
    const initialDraft = {
      title: 'Chamado 4521',
      description: 'Detalhes do chamado',
      sourceUrl: 'https://portal.exemplo/4521',
    };

    it('pré-preenche título, descrição e URL de origem na criação', () => {
      const wrapper = mount(TaskForm, { props: { initialDraft } });

      expect((wrapper.get('[name="title"]').element as HTMLInputElement).value).toBe(
        'Chamado 4521',
      );
      expect((wrapper.get('[name="description"]').element as HTMLTextAreaElement).value).toBe(
        'Detalhes do chamado',
      );
      expect((wrapper.get('[name="sourceUrl"]').element as HTMLInputElement).value).toBe(
        'https://portal.exemplo/4521',
      );
      expect((wrapper.get('[name="status"]').element as HTMLSelectElement).value).toBe('TODO');
      expect((wrapper.get('[name="priority"]').element as HTMLSelectElement).value).toBe('MEDIUM');
      expect(wrapper.get('h2').text()).toBe('Nova tarefa');
    });

    it('mantém o foco inicial no título com valores pré-preenchidos', () => {
      const wrapper = mount(TaskForm, { props: { initialDraft }, attachTo: document.body });

      expect(document.activeElement).toBe(wrapper.get('[name="title"]').element);
      wrapper.unmount();
    });

    it('ignora initialDraft na edição', () => {
      const wrapper = mount(TaskForm, {
        props: { task: buildTask({ title: 'Existente' }), initialDraft },
      });

      expect((wrapper.get('[name="title"]').element as HTMLInputElement).value).toBe('Existente');
      expect((wrapper.get('[name="sourceUrl"]').element as HTMLInputElement).value).toBe('');
    });
  });
});
