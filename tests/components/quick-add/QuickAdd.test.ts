import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { TaskManagerNavigator } from '@/application/open-task-manager';
import { TaskStorageError } from '@/application/task-repository';
import QuickAdd from '@/components/quick-add/QuickAdd.vue';
import { createTaskTestContext } from '../../support/task-app';
import { FIXED_NOW } from '../../support/task-fixtures';

let wrapper: VueWrapper | undefined;

function mountQuickAdd(
  navigator: TaskManagerNavigator = { open: vi.fn().mockResolvedValue(undefined) },
) {
  const context = createTaskTestContext();
  wrapper = mount(QuickAdd, {
    props: { navigator },
    global: context.global,
    attachTo: document.body,
  });
  return { context, wrapper, navigator };
}

function input(root: VueWrapper, name: string): HTMLInputElement {
  return root.get(`[name="${name}"]`).element as HTMLInputElement;
}

describe('QuickAdd', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
  });

  describe('formulário compacto', () => {
    it('apresenta somente os campos compactos, foca o título e inicia com prioridade MEDIUM', () => {
      const { wrapper } = mountQuickAdd();

      const names = wrapper.findAll('form [name]').map((field) => field.attributes('name'));
      expect(names).toEqual(['title', 'dueAt', 'requester', 'assignee', 'priority']);
      expect(document.activeElement).toBe(input(wrapper, 'title'));
      expect(input(wrapper, 'priority').value).toBe('MEDIUM');
    });

    it('cria tarefa TODO válida com os valores padrão e informa sucesso', async () => {
      const { wrapper, context } = mountQuickAdd();

      await wrapper.get('[name="title"]').setValue('Ligar para o fornecedor');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(context.repository.tasks).toEqual([
        expect.objectContaining({
          title: 'Ligar para o fornecedor',
          status: 'TODO',
          priority: 'MEDIUM',
          reminders: [],
          tags: [],
        }),
      ]);
      expect(context.repository.tasks[0]).not.toHaveProperty('dueAt');
      expect(wrapper.text()).toContain('Tarefa “Ligar para o fornecedor” adicionada.');
    });

    it('persiste os campos opcionais preenchidos', async () => {
      const { wrapper, context } = mountQuickAdd();

      await wrapper.get('[name="title"]').setValue('Revisar contrato');
      await wrapper.get('[name="dueAt"]').setValue('2026-09-15T17:00');
      await wrapper.get('[name="requester"]').setValue('Diretoria');
      await wrapper.get('[name="assignee"]').setValue('Jurídico');
      await wrapper.get('[name="priority"]').setValue('HIGH');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(context.repository.tasks[0]).toMatchObject({
        title: 'Revisar contrato',
        dueAt: new Date(2026, 8, 15, 17, 0).toISOString(),
        requester: 'Diretoria',
        assignee: 'Jurídico',
        priority: 'HIGH',
        status: 'TODO',
      });
    });

    it('envia pelo envio implícito do formulário acionado pelo teclado', async () => {
      const { wrapper, context } = mountQuickAdd();
      await wrapper.get('[name="title"]').setValue('Via teclado');

      // Enter em um campo de texto aciona o envio implícito do formulário, sem clicar no botão.
      input(wrapper, 'title').form?.requestSubmit();
      await flushPromises();

      expect(context.repository.tasks.map((task) => task.title)).toEqual(['Via teclado']);
    });

    it('não intercepta a digitação nos campos', async () => {
      const { wrapper } = mountQuickAdd();
      const title = wrapper.get('[name="title"]');

      const event = new KeyboardEvent('keydown', { key: 'a', cancelable: true, bubbles: true });
      title.element.dispatchEvent(event);
      await title.setValue('abc');

      expect(event.defaultPrevented).toBe(false);
      expect(input(wrapper, 'title').value).toBe('abc');
    });
  });

  describe('validação e persistência', () => {
    it('mostra erro junto ao campo, preserva o preenchimento e não persiste', async () => {
      const { wrapper, context } = mountQuickAdd();

      await wrapper.get('[name="title"]').setValue('   ');
      await wrapper.get('[name="requester"]').setValue('Ana');
      await wrapper.get('[name="priority"]').setValue('URGENT');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      const title = wrapper.get('[name="title"]');
      expect(title.attributes('aria-invalid')).toBe('true');
      expect(wrapper.get(`#${CSS.escape(title.attributes('aria-describedby')!)}`).text()).toBe(
        'Informe um título.',
      );
      expect(input(wrapper, 'requester').value).toBe('Ana');
      expect(input(wrapper, 'priority').value).toBe('URGENT');
      expect(context.repository.tasks).toEqual([]);
      expect(wrapper.text()).not.toContain('adicionada');
    });

    it('preserva o preenchimento e informa quando o armazenamento falha', async () => {
      const { wrapper, context } = mountQuickAdd();
      context.repository.failNext.save = new TaskStorageError('UNAVAILABLE', 'Sem espaço.');

      await wrapper.get('[name="title"]').setValue('Não perder');
      await wrapper.get('[name="assignee"]').setValue('Bia');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe('A tarefa não foi salva. Sem espaço.');
      expect(input(wrapper, 'title').value).toBe('Não perder');
      expect(input(wrapper, 'assignee').value).toBe('Bia');
      expect(wrapper.text()).not.toContain('adicionada');
    });

    it('leva o foco ao Título quando o envio pelo teclado falha na validação', async () => {
      const { wrapper } = mountQuickAdd();
      await wrapper.get('[name="title"]').setValue('   ');
      (wrapper.get('button[type="submit"]').element as HTMLElement).focus();

      // Enter em um campo de texto aciona o envio implícito do formulário, sem clicar no botão.
      input(wrapper, 'title').form?.requestSubmit();
      await flushPromises();

      expect(document.activeElement).toBe(input(wrapper, 'title'));
    });

    it('leva o foco à mensagem quando a gravação falha sem erro de campo', async () => {
      const { wrapper, context } = mountQuickAdd();
      context.repository.failNext.save = new TaskStorageError('UNAVAILABLE', 'Sem espaço.');
      await wrapper.get('[name="title"]').setValue('Não perder');

      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(document.activeElement).toBe(wrapper.get('[role="alert"]').element);
      expect(input(wrapper, 'title').value).toBe('Não perder');
    });

    it('limpa o formulário somente após sucesso e volta o foco ao título', async () => {
      const { wrapper } = mountQuickAdd();

      await wrapper.get('[name="title"]').setValue('Primeira');
      await wrapper.get('[name="requester"]').setValue('Ana');
      await wrapper.get('[name="priority"]').setValue('LOW');
      input(wrapper, 'dueAt').focus();
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(input(wrapper, 'title').value).toBe('');
      expect(input(wrapper, 'requester').value).toBe('');
      expect(input(wrapper, 'priority').value).toBe('MEDIUM');
      expect(wrapper.find('[aria-invalid="true"]').exists()).toBe(false);
      expect(document.activeElement).toBe(input(wrapper, 'title'));
    });
  });

  describe('acesso ao gerenciamento', () => {
    it('abre o Side Panel pelo gateway e sinaliza a abertura', async () => {
      const open = vi.fn<() => Promise<void>>().mockResolvedValue();
      const { wrapper } = mountQuickAdd({ open });

      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Abrir gerenciamento')!
        .trigger('click');
      await flushPromises();

      expect(open).toHaveBeenCalledOnce();
      expect(wrapper.emitted('manager-opened')).toHaveLength(1);
    });

    it('mantém o popup e os dados digitados quando a abertura falha', async () => {
      const open = vi.fn<() => Promise<void>>().mockRejectedValue(new Error('negado'));
      const { wrapper } = mountQuickAdd({ open });
      await wrapper.get('[name="title"]').setValue('Rascunho');
      await wrapper.get('[name="requester"]').setValue('Carlos');

      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Abrir gerenciamento')!
        .trigger('click');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toContain(
        'Não foi possível abrir o gerenciamento',
      );
      expect(wrapper.emitted('manager-opened')).toBeUndefined();
      expect(input(wrapper, 'title').value).toBe('Rascunho');
      expect(input(wrapper, 'requester').value).toBe('Carlos');
    });

    it('não lê a aba ativa ao abrir, criar ou navegar', async () => {
      const tabsQuery = vi.spyOn(fakeBrowser.tabs, 'query');
      const tabsGet = vi.spyOn(fakeBrowser.tabs, 'get');
      const tabsGetCurrent = vi.spyOn(fakeBrowser.tabs, 'getCurrent');
      const { wrapper, context } = mountQuickAdd();

      await wrapper.get('[name="title"]').setValue('Sem contexto');
      await wrapper.get('form').trigger('submit');
      await wrapper
        .findAll('button')
        .find((button) => button.text() === 'Abrir gerenciamento')!
        .trigger('click');
      await flushPromises();

      expect(tabsQuery).not.toHaveBeenCalled();
      expect(tabsGet).not.toHaveBeenCalled();
      expect(tabsGetCurrent).not.toHaveBeenCalled();
      expect(context.repository.tasks[0]).not.toHaveProperty('sourceUrl');
    });
  });
});
