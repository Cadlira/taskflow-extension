import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TaskForm from '@/components/tasks/TaskForm.vue';
import {
  AI_SUGGEST_SUBTASKS_ACTION,
  AI_SUGGESTION_ACCEPT_ACTION,
  AI_SUGGESTION_AT_LIMIT,
  AI_SUGGESTION_CANCEL_ACTION,
  AI_SUGGESTION_DISCARD_ACTION,
  AI_SUGGESTION_TITLE_REQUIRED,
  AI_GENERATION_FAILURE_LABELS,
} from '@/components/ai/ai-suggestion-labels';
import type { AiProviderConfig } from '@/domain/ai-provider';
import { buildSubtaskSuggestionContent } from '@/domain/ai-subtask-suggestion';
import type { TaskDraft } from '@/domain/task-draft';
import { MAX_SUBTASKS, SUBTASK_TITLE_LIMIT } from '@/domain/task-subtasks';
import { createTaskTestContext } from '../../support/task-app';
import { buildTask } from '../../support/task-fixtures';

const OPENAI: AiProviderConfig = {
  provider: 'OPENAI',
  credential: 'sk-segredo',
  model: 'gpt-4o-mini',
};

const OPENAI_ORIGIN = 'https://api.openai.com';

const LOCAL: AiProviderConfig = {
  provider: 'CUSTOM',
  apiBase: 'http://localhost:11434/v1',
  credential: 'ollama',
  model: 'llama3.1',
};

const LOCAL_ORIGIN = 'http://localhost:11434';

let wrapper: VueWrapper | undefined;
let fetchMock: ReturnType<typeof vi.fn>;

interface MountOptions {
  config?: AiProviderConfig | undefined;
  granted?: boolean;
  task?: ReturnType<typeof buildTask> | undefined;
}

async function mountForm({ config, granted = true, task }: MountOptions = {}) {
  const context = createTaskTestContext();

  if (config !== undefined) {
    context.aiRepository.stored = config;

    if (granted) {
      context.aiPermissions.granted.add(
        config.provider === 'CUSTOM' ? LOCAL_ORIGIN : OPENAI_ORIGIN,
      );
    }
  }

  wrapper = mount(TaskForm, {
    props: task === undefined ? {} : { task },
    global: context.global,
    attachTo: document.body,
  });
  await flushPromises();

  return { context, wrapper };
}

function button(root: VueWrapper, label: string) {
  const found = root.findAll('button').find((candidate) => candidate.text() === label);
  if (!found) throw new Error(`Botão "${label}" não encontrado`);
  return found;
}

function findButton(root: VueWrapper, prefix: string) {
  return root.findAll('button').find((candidate) => candidate.text().startsWith(prefix));
}

function message(root: VueWrapper): string {
  return root.find('[data-testid="suggestion-message"]').text();
}

async function openPreview(root: VueWrapper): Promise<void> {
  await button(root, AI_SUGGEST_SUBTASKS_ACTION).trigger('click');
  await flushPromises();
}

async function confirm(root: VueWrapper): Promise<void> {
  const send = findButton(root, 'Enviar para') ?? findButton(root, 'Concordar e enviar para');
  const action = send ?? findButton(root, 'Conceder acesso a');
  if (!action) throw new Error('Ação de confirmação não encontrada');
  await action.trigger('click');
  await flushPromises();
}

function subtaskTitles(root: VueWrapper): string[] {
  return root
    .findAll('input[name="subtask-title"]')
    .map((input) => (input.element as HTMLInputElement).value);
}

function submitted(root: VueWrapper): TaskDraft {
  const events = root.emitted('submit') as [TaskDraft][] | undefined;
  const draft = events?.at(-1)?.[0];
  if (!draft) throw new Error('submit não foi emitido');
  return draft;
}

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ação de sugerir subtarefas', () => {
  it('não apresenta nenhum elemento de assistência sem provedor configurado', async () => {
    const { wrapper: form } = await mountForm();

    expect(findButton(form, AI_SUGGEST_SUBTASKS_ACTION)).toBeUndefined();
    expect(form.find('[data-testid="suggestion-preview"]').exists()).toBe(false);
    expect(form.text()).not.toContain('IA');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('oferece a ação quando existe provedor configurado', async () => {
    const { wrapper: form } = await mountForm({ config: OPENAI });

    expect(button(form, AI_SUGGEST_SUBTASKS_ACTION).exists()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mantém a ação indisponível, com motivo legível, enquanto o título está vazio', async () => {
    const { wrapper: form } = await mountForm({ config: OPENAI });

    expect(button(form, AI_SUGGEST_SUBTASKS_ACTION).attributes('disabled')).toBeDefined();
    expect(form.text()).toContain(AI_SUGGESTION_TITLE_REQUIRED);

    await form.get('[name="title"]').setValue('Preparar a demo');

    expect(button(form, AI_SUGGEST_SUBTASKS_ACTION).attributes('disabled')).toBeUndefined();
  });

  it('mantém a ação indisponível, com motivo legível, no limite de subtarefas', async () => {
    const task = buildTask({
      title: 'Preparar a demo',
      subtasks: Array.from({ length: MAX_SUBTASKS }, (_, index) => ({
        id: `sub-${index}`,
        title: `Passo ${index}`,
        done: false,
      })),
    });
    const { wrapper: form } = await mountForm({ config: OPENAI, task });

    expect(button(form, AI_SUGGEST_SUBTASKS_ACTION).attributes('disabled')).toBeDefined();
    expect(form.text()).toContain(AI_SUGGESTION_AT_LIMIT);
  });
});

describe('pré-visualização do conteúdo', () => {
  it('apresenta o texto integral e a origem, sem realizar requisição alguma', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI });
    await form.get('[name="title"]').setValue('Preparar a demo');
    await form.get('[name="description"]').setValue('Roteiro e dados');

    await openPreview(form);

    const expected = buildSubtaskSuggestionContent('Preparar a demo', 'Roteiro e dados').content;
    expect(form.get('[data-testid="suggestion-preview"]').text()).toBe(expected);
    expect(form.get('[data-testid="suggestion-origin"]').text()).toContain(OPENAI_ORIGIN);
    expect(context.aiSuggester.requests).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('transmite exatamente o texto apresentado, caractere por caractere', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI });
    await form.get('[name="title"]').setValue('Preparar a demo');
    await form.get('[name="description"]').setValue('Linha um\nLinha dois');

    await openPreview(form);
    const shown = form.get('[data-testid="suggestion-preview"]').text();
    await confirm(form);

    expect(context.aiSuggester.requests[0]?.content).toBe(shown);
  });

  it('indica o corte quando a descrição excede o limite de envio', async () => {
    const { wrapper: form } = await mountForm({ config: OPENAI });
    await form.get('[name="title"]').setValue('Preparar a demo');
    await form.get('[name="description"]').setValue('a'.repeat(5_000));

    await openPreview(form);

    expect(form.find('[data-testid="suggestion-truncated"]').exists()).toBe(true);
  });

  it('recompõe a pré-visualização e exige nova confirmação ao mudar o título', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI });
    await form.get('[name="title"]').setValue('Título antigo');

    await openPreview(form);
    expect(form.get('[data-testid="suggestion-preview"]').text()).toContain('Título antigo');

    await form.get('[name="title"]').setValue('Título novo');
    await flushPromises();

    expect(form.get('[data-testid="suggestion-preview"]').text()).toContain('Título novo');
    expect(form.get('[data-testid="suggestion-preview"]').text()).not.toContain('Título antigo');
    expect(form.find('[data-testid="suggestion-recomposed"]').exists()).toBe(true);
    expect(context.aiSuggester.requests).toHaveLength(0);

    await confirm(form);

    expect(context.aiSuggester.requests[0]?.content).toContain('Título novo');
    expect(context.aiSuggester.requests[0]?.content).not.toContain('Título antigo');
  });

  it('usa o que está digitado no formulário, e não o que está persistido', async () => {
    const task = buildTask({ title: 'Título salvo', description: 'Descrição salva' });
    const { context, wrapper: form } = await mountForm({ config: OPENAI, task });

    await form.get('[name="title"]').setValue('Título editado');
    await openPreview(form);
    await confirm(form);

    expect(context.aiSuggester.requests[0]?.content).toContain('Título editado');
    expect(context.aiSuggester.requests[0]?.content).not.toContain('Título salvo');
  });
});

describe('consentimento de envio de conteúdo de tarefa', () => {
  it('exige consentimento mesmo depois de um teste de conexão bem-sucedido', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI });
    // Teste de conexão bem-sucedido: a credencial já foi enviada e aceita.
    await expect(context.aiService.testConnection('MODEL_LIST')).resolves.toEqual({ ok: true });

    await form.get('[name="title"]').setValue('Preparar a demo');
    await openPreview(form);

    expect(form.find('[data-testid="suggestion-consent-notice"]').exists()).toBe(true);
    expect(findButton(form, 'Concordar e enviar para')).toBeDefined();
    expect(context.aiSuggester.requests).toHaveLength(0);
  });

  it('não envia nada e preserva o que estava digitado quando o usuário recusa', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI });
    await form.get('[name="title"]').setValue('Preparar a demo');
    await form.get('[name="description"]').setValue('Roteiro e dados');

    await openPreview(form);
    await button(form, 'Cancelar').trigger('click');
    await flushPromises();

    expect(context.aiSuggester.requests).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((form.get('[name="title"]').element as HTMLInputElement).value).toBe(
      'Preparar a demo',
    );
    expect((form.get('[name="description"]').element as HTMLTextAreaElement).value).toBe(
      'Roteiro e dados',
    );
    expect(form.find('[data-testid="suggestion-preview"]').exists()).toBe(false);
  });

  it('dispensa novo consentimento no segundo envio para a mesma origem', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI });
    await form.get('[name="title"]').setValue('Preparar a demo');

    await openPreview(form);
    await confirm(form);
    await button(form, AI_SUGGESTION_DISCARD_ACTION).trigger('click');
    await openPreview(form);

    expect(form.find('[data-testid="suggestion-consent-notice"]').exists()).toBe(false);
    expect(findButton(form, 'Enviar para')).toBeDefined();
    expect(context.aiSuggester.requests).toHaveLength(1);
  });

  it('exige novo consentimento quando a origem configurada muda', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI });
    await form.get('[name="title"]').setValue('Preparar a demo');

    await openPreview(form);
    await confirm(form);
    await button(form, AI_SUGGESTION_DISCARD_ACTION).trigger('click');

    // A configuração passa a apontar para outra origem com o formulário aberto.
    context.aiRepository.stored = LOCAL;
    context.aiPermissions.granted.add(LOCAL_ORIGIN);

    await openPreview(form);
    expect(form.get('[data-testid="suggestion-origin"]').text()).toContain(LOCAL_ORIGIN);
    expect(form.find('[data-testid="suggestion-consent-notice"]').exists()).toBe(true);
    expect(context.aiSuggester.requests).toHaveLength(1);

    await confirm(form);
    expect(context.aiSuggester.requests).toHaveLength(2);
  });
});

describe('permissão de host', () => {
  it('informa a permissão ausente e não envia enquanto ela não é concedida', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI, granted: false });
    await form.get('[name="title"]').setValue('Preparar a demo');

    await openPreview(form);

    expect(form.find('[data-testid="suggestion-permission-notice"]').exists()).toBe(true);
    expect(findButton(form, 'Conceder acesso a')).toBeDefined();
    expect(context.aiSuggester.requests).toHaveLength(0);
    expect(context.aiPermissions.requested).toEqual([]);
  });

  it('solicita a permissão a partir do gesto e envia quando ela é concedida', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI, granted: false });
    await form.get('[name="title"]').setValue('Preparar a demo');

    await openPreview(form);
    await confirm(form);

    expect(context.aiPermissions.requested).toEqual([OPENAI_ORIGIN]);
    expect(context.aiSuggester.requests).toHaveLength(1);
  });

  it('não envia nada quando a permissão é recusada', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI, granted: false });
    context.aiPermissions.grantOnRequest = false;
    await form.get('[name="title"]').setValue('Preparar a demo');

    await openPreview(form);
    await confirm(form);

    expect(context.aiPermissions.requested).toEqual([OPENAI_ORIGIN]);
    expect(context.aiSuggester.requests).toHaveLength(0);
    expect(message(form)).toContain('permissão foi recusada');
  });
});

describe('proposta revisável', () => {
  async function propose(text: string, options: MountOptions = { config: OPENAI }) {
    const mounted = await mountForm(options);
    mounted.context.aiSuggester.next = { ok: true, text };
    await mounted.wrapper.get('[name="title"]').setValue('Preparar a demo');
    await openPreview(mounted.wrapper);
    await confirm(mounted.wrapper);
    return mounted;
  }

  it('apresenta cada sugestão como item selecionável e editável', async () => {
    const { wrapper: form } = await propose('Montar roteiro\nPreparar dados');

    const items = form.findAll('[data-testid="suggestion-item"]');
    expect(items).toHaveLength(2);
    expect(form.findAll('input[name="suggestion-title"]')).toHaveLength(2);
    expect(form.findAll('input[name="suggestion-selected"]')).toHaveLength(2);
    expect(
      form.findAll('input[name="suggestion-title"]').map((input) => (input.element as HTMLInputElement).value),
    ).toEqual(['Montar roteiro', 'Preparar dados']);
  });

  it('acrescenta apenas os itens selecionados, como itens não concluídos', async () => {
    const { wrapper: form } = await propose('Montar roteiro\nPreparar dados\nEnsaiar');

    await form.findAll('input[name="suggestion-selected"]')[1]!.setValue(false);
    await button(form, AI_SUGGESTION_ACCEPT_ACTION).trigger('click');
    await form.get('form').trigger('submit');

    expect(subtaskTitles(form)).toEqual(['Montar roteiro', 'Ensaiar']);
    expect(submitted(form).subtasks).toEqual([{ title: 'Montar roteiro' }, { title: 'Ensaiar' }]);
  });

  it('acrescenta o título editado pelo usuário', async () => {
    const { wrapper: form } = await propose('Montar roteiro');

    await form.get('input[name="suggestion-title"]').setValue('Montar roteiro revisado');
    await button(form, AI_SUGGESTION_ACCEPT_ACTION).trigger('click');
    await form.get('form').trigger('submit');

    expect(submitted(form).subtasks).toEqual([{ title: 'Montar roteiro revisado' }]);
  });

  it('preserva as subtarefas existentes, inalteradas e na mesma ordem', async () => {
    const task = buildTask({
      title: 'Preparar a demo',
      subtasks: [
        { id: 'sub-1', title: 'Primeira existente', done: true },
        { id: 'sub-2', title: 'Segunda existente', done: false },
      ],
    });
    const { wrapper: form } = await propose('Montar roteiro', { config: OPENAI, task });

    await button(form, AI_SUGGESTION_ACCEPT_ACTION).trigger('click');
    await form.get('form').trigger('submit');

    expect(submitted(form).subtasks).toEqual([
      { id: 'sub-1', title: 'Primeira existente' },
      { id: 'sub-2', title: 'Segunda existente' },
      { title: 'Montar roteiro' },
    ]);
  });

  it('deixa o item aceito editável e removível como qualquer outro', async () => {
    const { wrapper: form } = await propose('Montar roteiro');

    await button(form, AI_SUGGESTION_ACCEPT_ACTION).trigger('click');
    await form.get('input[name="subtask-title"]').setValue('Editado depois de aceito');
    await form.get('form').trigger('submit');
    expect(submitted(form).subtasks).toEqual([{ title: 'Editado depois de aceito' }]);

    const remove = form
      .findAll('button')
      .find((candidate) => candidate.attributes('aria-label')?.startsWith('Remover subtarefa'));
    await remove!.trigger('click');
    await form.get('form').trigger('submit');

    expect(submitted(form).subtasks).toEqual([]);
  });

  it('descarta a proposta inteira sem tocar na lista de subtarefas', async () => {
    const task = buildTask({
      title: 'Preparar a demo',
      subtasks: [{ id: 'sub-1', title: 'Existente', done: false }],
    });
    const { wrapper: form } = await propose('Montar roteiro', { config: OPENAI, task });

    await button(form, AI_SUGGESTION_DISCARD_ACTION).trigger('click');
    await form.get('form').trigger('submit');

    expect(form.findAll('[data-testid="suggestion-item"]')).toHaveLength(0);
    expect(submitted(form).subtasks).toEqual([{ id: 'sub-1', title: 'Existente' }]);
  });

  it('informa quando parte das sugestões foi descartada por limite de vagas', async () => {
    const task = buildTask({
      title: 'Preparar a demo',
      subtasks: Array.from({ length: MAX_SUBTASKS - 1 }, (_, index) => ({
        id: `sub-${index}`,
        title: `Passo ${index}`,
        done: false,
      })),
    });
    const { wrapper: form } = await propose('Montar roteiro\nPreparar dados\nEnsaiar', {
      config: OPENAI,
      task,
    });

    expect(form.findAll('[data-testid="suggestion-item"]')).toHaveLength(1);
    expect(message(form)).toContain('descartada');
  });

  it('informa quando não houve sugestão aproveitável e não altera o formulário', async () => {
    const task = buildTask({
      title: 'Preparar a demo',
      subtasks: [{ id: 'sub-1', title: 'Existente', done: false }],
    });
    const { wrapper: form } = await propose('   \n-\n*\n', { config: OPENAI, task });

    expect(form.findAll('[data-testid="suggestion-item"]')).toHaveLength(0);
    expect(message(form)).toContain(AI_GENERATION_FAILURE_LABELS.NO_VALID_ITEM);
    expect(subtaskTitles(form)).toEqual(['Existente']);
  });

  it('descarta sugestão vazia e acima do limite de título sem impedir as demais', async () => {
    const { wrapper: form } = await propose(
      ['Montar roteiro', '-', 'b'.repeat(SUBTASK_TITLE_LIMIT + 1), 'Preparar dados'].join('\n'),
    );

    expect(
      form.findAll('input[name="suggestion-title"]').map((input) => (input.element as HTMLInputElement).value),
    ).toEqual(['Montar roteiro', 'Preparar dados']);
  });
});

describe('progresso, cancelamento e falhas', () => {
  it('indica a requisição em andamento e oferece cancelar', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI });
    const release = context.aiSuggester.hold();
    await form.get('[name="title"]').setValue('Preparar a demo');

    await openPreview(form);
    const send = findButton(form, 'Concordar e enviar para')!;
    await send.trigger('click');
    await flushPromises();

    expect(form.find('[data-testid="suggestion-progress"]').exists()).toBe(true);
    expect(button(form, AI_SUGGESTION_CANCEL_ACTION).exists()).toBe(true);

    release();
    await flushPromises();
    expect(form.find('[data-testid="suggestion-progress"]').exists()).toBe(false);
  });

  it('cancela sem alterar o formulário', async () => {
    const task = buildTask({
      title: 'Preparar a demo',
      subtasks: [{ id: 'sub-1', title: 'Existente', done: false }],
    });
    const { context, wrapper: form } = await mountForm({ config: OPENAI, task });
    const release = context.aiSuggester.hold();

    await openPreview(form);
    await findButton(form, 'Concordar e enviar para')!.trigger('click');
    await flushPromises();
    await button(form, AI_SUGGESTION_CANCEL_ACTION).trigger('click');
    release();
    await flushPromises();

    expect(message(form)).toContain('cancelada');
    expect(form.findAll('[data-testid="suggestion-item"]')).toHaveLength(0);
    expect(subtaskTitles(form)).toEqual(['Existente']);
  });

  it.each([
    ['INVALID_CREDENTIALS', 401],
    ['ENDPOINT_UNREACHABLE', undefined],
    ['TIMEOUT', undefined],
    ['UNEXPECTED_RESPONSE', 500],
    ['EMPTY_RESPONSE', undefined],
    ['UNREADABLE_RESPONSE', undefined],
  ] as const)('apresenta o motivo %s com, no máximo, origem e código', async (reason, status) => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI });
    context.aiSuggester.next = { ok: false, reason, ...(status !== undefined && { status }) };
    await form.get('[name="title"]').setValue('Preparar a demo');

    await openPreview(form);
    await confirm(form);

    const text = message(form);
    expect(text).toContain(AI_GENERATION_FAILURE_LABELS[reason]);
    expect(text).toContain(OPENAI_ORIGIN);
    expect(text).not.toContain('sk-segredo');
    expect(text).not.toContain('/v1/chat/completions');

    if (status !== undefined) {
      expect(text).toContain(String(status));
    }
  });

  it('apresenta o motivo de permissão ausente sem enviar conteúdo', async () => {
    const { context, wrapper: form } = await mountForm({ config: OPENAI, granted: false });
    context.aiPermissions.grantOnRequest = false;
    await form.get('[name="title"]').setValue('Preparar a demo');

    await openPreview(form);
    await confirm(form);

    expect(context.aiSuggester.requests).toHaveLength(0);
  });
});
