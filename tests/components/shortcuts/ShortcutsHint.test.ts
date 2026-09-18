import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ShortcutsHint from '@/components/shortcuts/ShortcutsHint.vue';
import { shortcutsReaderKey } from '@/components/shortcuts/shortcuts-reader-key';
import { FakeKeyboardShortcutsReader } from '../../support/fakes';

let wrapper: VueWrapper | undefined;

async function mountHint(prepare?: (reader: FakeKeyboardShortcutsReader) => void) {
  const reader = new FakeKeyboardShortcutsReader();
  prepare?.(reader);
  wrapper = mount(ShortcutsHint, {
    global: { provide: { [shortcutsReaderKey as symbol]: reader } },
    attachTo: document.body,
  });
  await flushPromises();
  return { reader, wrapper };
}

/** Pares ação → combinação apresentada, na ordem em que o bloco os exibe. */
function entries(root: VueWrapper): Array<[string, string]> {
  const terms = root.findAll('dt').map((term) => term.text());
  const definitions = root.findAll('dd').map((definition) => definition.text());
  return terms.map((term, index) => [term, definitions[index] ?? '']);
}

function customizeButton(root: VueWrapper) {
  const found = root
    .findAll('button')
    .find((candidate) => candidate.text() === 'Personalizar atalhos');
  if (!found) throw new Error('Botão "Personalizar atalhos" não encontrado');
  return found;
}

describe('ShortcutsHint', () => {
  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
  });

  it('exibe a combinação em vigor de cada ação', async () => {
    const { wrapper } = await mountHint();

    expect(entries(wrapper)).toEqual([
      ['Nova tarefa (Quick Add)', 'Ctrl+Shift+K'],
      ['Abrir o gerenciamento de tarefas', 'Ctrl+Shift+L'],
    ]);
    expect(wrapper.text()).not.toContain('Sem atalho atribuído');
  });

  it('sinaliza explicitamente a ação sem atalho e mantém a outra combinação', async () => {
    const { wrapper } = await mountHint((reader) => {
      reader.shortcuts = [
        { action: 'QUICK_ADD', combination: 'Ctrl+Shift+K' },
        { action: 'OPEN_TASK_MANAGER' },
      ];
    });

    expect(entries(wrapper)).toEqual([
      ['Nova tarefa (Quick Add)', 'Ctrl+Shift+K'],
      ['Abrir o gerenciamento de tarefas', 'Sem atalho atribuído'],
    ]);
    // A combinação sugerida no pacote não é exibida como se estivesse em vigor.
    expect(wrapper.text()).not.toContain('Ctrl+Shift+L');
  });

  it('reflete a combinação alterada pelo usuário em uma nova apresentação', async () => {
    const { reader, wrapper } = await mountHint();
    expect(wrapper.text()).toContain('Ctrl+Shift+L');

    wrapper.unmount();
    reader.shortcuts = [
      { action: 'QUICK_ADD', combination: 'Ctrl+Shift+K' },
      { action: 'OPEN_TASK_MANAGER', combination: 'Alt+Shift+9' },
    ];
    const remounted = mount(ShortcutsHint, {
      global: { provide: { [shortcutsReaderKey as symbol]: reader } },
    });
    await flushPromises();

    expect(remounted.text()).toContain('Alt+Shift+9');
    expect(remounted.text()).not.toContain('Ctrl+Shift+L');
    expect(reader.reads).toBe(2);
    remounted.unmount();
  });

  it('informa a falha da consulta sem esconder a ação de personalizar', async () => {
    const { wrapper } = await mountHint((reader) => {
      reader.failRead = true;
    });

    expect(wrapper.text()).toContain('Não foi possível obter os atalhos em vigor.');
    expect(wrapper.findAll('dt')).toHaveLength(0);
    expect(customizeButton(wrapper).exists()).toBe(true);
  });

  it('abre a personalização quando o botão é acionado pelo teclado', async () => {
    const { reader, wrapper } = await mountHint();
    const button = customizeButton(wrapper).element as HTMLButtonElement;

    button.focus();
    expect(document.activeElement).toBe(button);

    // Enter e Espaço em um botão nativo produzem a mesma ativação que este clique.
    button.click();
    await flushPromises();

    expect(reader.customizations).toBe(1);
  });

  it('informa a falha ao abrir a tela de atalhos do navegador', async () => {
    const { wrapper } = await mountHint((reader) => {
      reader.failCustomization = true;
    });

    await customizeButton(wrapper).trigger('click');
    await flushPromises();

    expect(wrapper.text()).toContain('Não foi possível abrir a tela de atalhos do navegador.');
  });
});
