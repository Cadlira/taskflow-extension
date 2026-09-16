import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import ConfirmDialog from '@/components/ConfirmDialog.vue';

function mountDialog(busy = false) {
  const opener = document.createElement('button');
  document.body.append(opener);
  opener.focus();

  const wrapper = mount(ConfirmDialog, {
    props: { title: 'Excluir tarefa?', message: 'Não poderá ser desfeito.', busy },
    attachTo: document.body,
  });

  const [cancel, confirm] = wrapper.findAll('button');
  return { wrapper, opener, cancel: cancel!, confirm: confirm! };
}

describe('ConfirmDialog', () => {
  it('é um diálogo de alerta rotulado com foco inicial em cancelar', () => {
    const { wrapper, cancel } = mountDialog();

    const dialog = wrapper.get('[role="alertdialog"]');
    expect(dialog.attributes('aria-modal')).toBe('true');
    expect(wrapper.get(`#${CSS.escape(dialog.attributes('aria-labelledby')!)}`).text()).toBe(
      'Excluir tarefa?',
    );
    expect(document.activeElement).toBe(cancel.element);
    wrapper.unmount();
  });

  it('mantém o foco dentro do diálogo ao navegar com Tab', async () => {
    const { wrapper, cancel, confirm } = mountDialog();

    (confirm.element as HTMLButtonElement).focus();
    await wrapper.get('.dialog-backdrop').trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(cancel.element);

    await wrapper.get('.dialog-backdrop').trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(confirm.element);
    wrapper.unmount();
  });

  it('emite confirmação e cancelamento, e devolve o foco ao fechar', async () => {
    const { wrapper, opener, cancel, confirm } = mountDialog();

    await confirm.trigger('click');
    await cancel.trigger('click');
    await wrapper.get('.dialog-backdrop').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('confirm')).toHaveLength(1);
    expect(wrapper.emitted('cancel')).toHaveLength(2);
    wrapper.unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('desabilita confirmação e cancelamento enquanto processa e ignora Escape', async () => {
    const { wrapper, cancel, confirm } = mountDialog(true);

    expect(confirm.attributes('disabled')).toBeDefined();
    expect(cancel.attributes('disabled')).toBeDefined();

    await wrapper.get('.dialog-backdrop').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('cancel')).toBeUndefined();
    wrapper.unmount();
  });
});

describe('ConfirmDialog com mais de duas ações', () => {
  function mountActions(busy = false) {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();

    const wrapper = mount(ConfirmDialog, {
      props: {
        title: 'Tarefa recorrente',
        message: 'O que você quer fazer com esta ocorrência?',
        actions: [
          { id: 'skip', label: 'Pular esta ocorrência', tone: 'secondary' },
          { id: 'end', label: 'Encerrar a série', tone: 'danger' },
        ],
        busy,
      },
      attachTo: document.body,
    });

    const [abandon, skip, end] = wrapper.findAll('button');
    return { wrapper, opener, abandon: abandon!, skip: skip!, end: end! };
  }

  it('apresenta as ações além de abandonar e emite a ação escolhida', async () => {
    const { wrapper, skip, end } = mountActions();

    expect(wrapper.get('.dialog-actions').text()).toContain('Pular esta ocorrência');
    expect(wrapper.get('.dialog-actions').text()).toContain('Encerrar a série');
    expect(skip.classes()).toContain('button-secondary');
    expect(end.classes()).toContain('button-danger');

    await end.trigger('click');

    expect(wrapper.emitted('action')).toEqual([['end']]);
    expect(wrapper.emitted('confirm')).toBeUndefined();
    wrapper.unmount();
  });

  it('mantém o foco inicial em abandonar', () => {
    const { wrapper, abandon } = mountActions();

    expect(document.activeElement).toBe(abandon.element);
    wrapper.unmount();
  });

  it('circula o foco por Tab e Shift+Tab sobre as três ações', async () => {
    const { wrapper, abandon, end } = mountActions();

    (end.element as HTMLButtonElement).focus();
    await wrapper.get('.dialog-backdrop').trigger('keydown', { key: 'Tab' });
    expect(document.activeElement).toBe(abandon.element);

    await wrapper.get('.dialog-backdrop').trigger('keydown', { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(end.element);
    wrapper.unmount();
  });

  it('Escape abandona sem aplicar nenhuma ação', async () => {
    const { wrapper, opener } = mountActions();

    await wrapper.get('.dialog-backdrop').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('action')).toBeUndefined();
    expect(wrapper.emitted('cancel')).toHaveLength(1);
    wrapper.unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('mantém Escape inerte e as ações desabilitadas durante o processamento', async () => {
    const { wrapper, abandon, skip, end } = mountActions(true);

    expect(abandon.attributes('disabled')).toBeDefined();
    expect(skip.attributes('disabled')).toBeDefined();
    expect(end.attributes('disabled')).toBeDefined();

    await wrapper.get('.dialog-backdrop').trigger('keydown', { key: 'Escape' });

    expect(wrapper.emitted('cancel')).toBeUndefined();
    expect(wrapper.emitted('action')).toBeUndefined();
    wrapper.unmount();
  });
});
