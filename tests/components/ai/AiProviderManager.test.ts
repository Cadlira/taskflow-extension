import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import { createAiProviderService } from '@/application/ai/ai-provider-service';
import AiProviderManager from '@/components/ai/AiProviderManager.vue';
import {
  AI_BLOCK_LABELS,
  AI_CREDENTIAL_SAVED_MARK,
  AI_FAILURE_LABELS,
  AI_OPTIONAL_NOTICE,
  AI_PERMISSION_REFUSED_MESSAGE,
  AI_PERMISSION_REVOKED_MESSAGE,
  AI_REMOVED_MESSAGE,
  AI_TEST_SUCCESS_MESSAGE,
} from '@/components/ai/ai-provider-labels';
import { aiProviderServiceKey } from '@/components/ai/ai-service-key';
import type { AiProviderConfig } from '@/domain/ai-provider';
import {
  FakeAiConnectionTester,
  FakeHostPermissions,
  InMemoryAiProviderConfigRepository,
} from '../../support/fakes';

type Scope = Omit<DOMWrapper<Element>, 'exists'>;

const OPENAI_CONFIG: AiProviderConfig = {
  provider: 'OPENAI',
  credential: 'sk-secreta',
  model: 'gpt-4o-mini',
};

const CUSTOM_CONFIG: AiProviderConfig = {
  provider: 'CUSTOM',
  apiBase: 'https://gateway.exemplo/v1',
  credential: 'chave-gateway',
  model: 'llama3.1',
};

let wrapper: VueWrapper | undefined;

afterEach(() => {
  wrapper?.unmount();
  wrapper = undefined;
});

function setup(config?: AiProviderConfig, ...grantedOrigins: string[]) {
  const repository = new InMemoryAiProviderConfigRepository(config);
  const permissions = new FakeHostPermissions(...grantedOrigins);
  const tester = new FakeAiConnectionTester();
  const service = createAiProviderService({ repository, permissions, tester });

  return { repository, permissions, tester, service };
}

type Context = ReturnType<typeof setup>;

async function mountManager(context: Context = setup()) {
  wrapper = mount(AiProviderManager, {
    global: { provide: { [aiProviderServiceKey as symbol]: context.service } },
    attachTo: document.body,
  });
  await flushPromises();
  return { context, wrapper: wrapper as VueWrapper };
}

function button(root: Pick<Scope, 'findAll'>, label: string) {
  const found = root.findAll('button').find((candidate) => candidate.text().startsWith(label));
  if (!found) throw new Error(`Botão "${label}" não encontrado`);
  return found;
}

function field(root: VueWrapper, label: string) {
  const labelElement = root.findAll('label').find((candidate) => candidate.text() === label);
  if (!labelElement) throw new Error(`Campo "${label}" não encontrado`);
  return root.get(`#${CSS.escape(labelElement.attributes('for')!)}`);
}

async function fill(root: VueWrapper, label: string, value: string): Promise<void> {
  await field(root, label).setValue(value);
}

async function save(root: VueWrapper): Promise<void> {
  await button(root, 'Salvar configuração').trigger('click');
  await flushPromises();
}

async function testConnection(root: VueWrapper, consent = true): Promise<void> {
  await root.get('[data-testid="test-connection"]').trigger('click');
  await flushPromises();

  if (consent && root.find('.ai-consent').exists()) {
    await button(root.get('.ai-consent'), 'Enviar credencial e testar').trigger('click');
    await flushPromises();
  }
}

describe('área de provedores', () => {
  it('informa que a IA é opcional e apresenta o estado sem provedor configurado', async () => {
    const { wrapper: root } = await mountManager();

    expect(root.get('h1').text()).toBe('Provedores de IA');
    expect(root.text()).toContain(AI_OPTIONAL_NOTICE);
    expect(root.text()).toContain('Nenhum provedor configurado.');
  });

  it('apresenta a configuração atual ao abrir, sem contatar o provedor', async () => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');

    const { wrapper: root } = await mountManager(context);

    expect((field(root, 'Modelo').element as HTMLInputElement).value).toBe('llama3.1');
    expect((field(root, 'Base da API').element as HTMLInputElement).value).toBe(
      'https://gateway.exemplo/v1',
    );
    expect(context.tester.requests).toEqual([]);
  });

  it('leva o foco ao título ao abrir a área', async () => {
    const { wrapper: root } = await mountManager();

    expect(document.activeElement).toBe(root.get('h1').element);
  });
});

describe('seleção de provedor e base', () => {
  it('não apresenta campo de base para provedor oficial e exibe a base fixa', async () => {
    const { wrapper: root } = await mountManager();

    expect(root.get('[data-testid="official-base"]').text()).toBe('https://api.openai.com/v1');
    expect(
      root.findAll('label').some((candidate) => candidate.text() === 'Base da API'),
    ).toBe(false);
    expect(root.get('[data-testid="official-base"]').attributes('contenteditable')).toBeUndefined();

    await field(root, 'Provedor').setValue('ANTHROPIC');

    expect(root.get('[data-testid="official-base"]').text()).toBe('https://api.anthropic.com');
  });

  it('exige a base em CUSTOM e recusa a gravação sem ela', async () => {
    const { context, wrapper: root } = await mountManager();

    await field(root, 'Provedor').setValue('CUSTOM');
    await fill(root, 'Credencial', 'sk-abc');
    await fill(root, 'Modelo', 'llama3.1');
    await save(root);

    expect(root.get('.field-error').text()).toContain('base da API');
    expect(context.repository.stored).toBeUndefined();
    expect(document.activeElement).toBe(field(root, 'Base da API').element);
  });

  it('apresenta em destaque a origem resolvida antes do envio', async () => {
    const { wrapper: root } = await mountManager();

    await field(root, 'Provedor').setValue('CUSTOM');
    await fill(root, 'Base da API', 'http://localhost:11434/v1');

    expect(root.get('.ai-origin').text()).toContain('http://localhost:11434');
    expect(root.get('.ai-origin').text()).not.toContain('/v1');
  });

  it('substitui a configuração anterior por completo ao salvar', async () => {
    const context = setup(OPENAI_CONFIG, 'https://api.openai.com');
    const { wrapper: root } = await mountManager(context);

    await field(root, 'Provedor').setValue('CUSTOM');
    await fill(root, 'Base da API', 'https://gateway.exemplo/v1');
    await fill(root, 'Credencial', 'chave-gateway');
    await fill(root, 'Modelo', 'llama3.1');
    await save(root);

    expect(context.repository.stored).toEqual(CUSTOM_CONFIG);
  });
});

describe('tratamento protegido da credencial', () => {
  it('oculta os caracteres por padrão e oferece ação explícita de revelar', async () => {
    const { wrapper: root } = await mountManager();
    const input = field(root, 'Credencial');

    expect(input.attributes('type')).toBe('password');
    expect(input.attributes('autocomplete')).toBe('off');
    expect(input.attributes('spellcheck')).toBe('false');

    await button(root, 'Revelar credencial').trigger('click');

    expect(field(root, 'Credencial').attributes('type')).toBe('text');
    expect(button(root, 'Ocultar credencial').attributes('aria-pressed')).toBe('true');
  });

  it('não preenche o campo com a credencial salva e indica que ela existe', async () => {
    const { wrapper: root } = await mountManager(setup(OPENAI_CONFIG, 'https://api.openai.com'));

    expect((field(root, 'Credencial').element as HTMLInputElement).value).toBe('');
    expect(root.text()).toContain(AI_CREDENTIAL_SAVED_MARK);
    expect(root.html()).not.toContain('sk-secreta');
  });

  it('preserva a credencial quando o usuário altera apenas o modelo', async () => {
    const context = setup(OPENAI_CONFIG, 'https://api.openai.com');
    const { wrapper: root } = await mountManager(context);

    await fill(root, 'Modelo', 'gpt-4o');
    await save(root);

    expect(context.repository.stored).toEqual({
      provider: 'OPENAI',
      credential: 'sk-secreta',
      model: 'gpt-4o',
    });
  });

  it('recusa salvar sem credencial quando nenhuma está gravada', async () => {
    const { context, wrapper: root } = await mountManager();

    await fill(root, 'Modelo', 'gpt-4o-mini');
    await save(root);

    expect(root.text()).toContain('Informe a credencial do provedor.');
    expect(context.repository.stored).toBeUndefined();
    expect(document.activeElement).toBe(field(root, 'Credencial').element);
  });
});

describe('consentimento antes do primeiro envio', () => {
  it('avisa que a credencial será enviada e só prossegue por ação explícita', async () => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');
    const { wrapper: root } = await mountManager(context);

    await root.get('[data-testid="test-connection"]').trigger('click');
    await flushPromises();

    expect(root.get('.ai-consent').text()).toContain('https://gateway.exemplo');
    expect(context.tester.requests).toEqual([]);

    await button(root.get('.ai-consent'), 'Enviar credencial e testar').trigger('click');
    await flushPromises();

    expect(context.tester.requests).toHaveLength(1);
  });

  it('reapresenta o aviso quando a base muda para outra origem', async () => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo', 'http://localhost:11434');
    const { wrapper: root } = await mountManager(context);

    await testConnection(root);
    expect(root.text()).toContain(AI_TEST_SUCCESS_MESSAGE);

    await fill(root, 'Base da API', 'http://localhost:11434/v1');
    await save(root);
    await root.get('[data-testid="test-connection"]').trigger('click');
    await flushPromises();

    expect(root.get('.ai-consent').text()).toContain('http://localhost:11434');
    expect(context.tester.requests).toHaveLength(1);
  });

  it('não reapresenta o aviso para a mesma origem já consentida', async () => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');
    const { wrapper: root } = await mountManager(context);

    await testConnection(root);
    await testConnection(root, false);

    expect(context.tester.requests).toHaveLength(2);
  });
});

describe('teste de conexão', () => {
  it('não contata o provedor sem clique do usuário', async () => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');

    const { wrapper: root } = await mountManager(context);
    await fill(root, 'Modelo', 'outro-modelo');
    await save(root);

    expect(context.tester.requests).toEqual([]);
    expect(root.find('[data-testid="test-connection"]').exists()).toBe(true);
  });

  it('informa sucesso quando a verificação passa', async () => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');
    const { wrapper: root } = await mountManager(context);

    await testConnection(root);

    expect(root.get('.feedback-success').text()).toBe(AI_TEST_SUCCESS_MESSAGE);
  });

  it.each([
    ['INVALID_CREDENTIALS'],
    ['ENDPOINT_UNREACHABLE'],
    ['TIMEOUT'],
    ['UNEXPECTED_RESPONSE'],
  ] as const)('apresenta mensagem própria para %s', async (reason) => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');
    context.tester.next = { ok: false, reason };
    const { wrapper: root } = await mountManager(context);

    await testConnection(root);

    const alert = root.get('[role="alert"]');
    expect(alert.text()).toBe(AI_FAILURE_LABELS[reason]);
    expect(document.activeElement).toBe(alert.element);
  });

  it('produz mensagens distintas para cada motivo', () => {
    const messages = Object.values(AI_FAILURE_LABELS);

    expect(new Set(messages).size).toBe(messages.length);
  });

  it('oferece a verificação mínima quando a listagem não existe', async () => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');
    context.tester.results = [{ ok: false, reason: 'MODEL_LIST_UNSUPPORTED', status: 404 }];
    const { wrapper: root } = await mountManager(context);

    await testConnection(root);

    expect(root.get('[role="alert"]').text()).toBe(AI_FAILURE_LABELS.MODEL_LIST_UNSUPPORTED);
    expect(root.text()).toContain('Nenhum dado de tarefa é enviado.');

    await root.get('[data-testid="minimal-probe"]').trigger('click');
    await flushPromises();

    expect(context.tester.requests.map((request) => request.probe)).toEqual([
      'MODEL_LIST',
      'MINIMAL_COMPLETION',
    ]);
  });
});

describe('permissão de host', () => {
  it('solicita apenas a origem configurada a partir do clique', async () => {
    const context = setup(CUSTOM_CONFIG);
    const { wrapper: root } = await mountManager(context);

    await testConnection(root);

    expect(context.permissions.requested).toEqual(['https://gateway.exemplo']);
  });

  it('informa a recusa sem enviar nada', async () => {
    const context = setup(CUSTOM_CONFIG);
    context.permissions.grantOnRequest = false;
    const { wrapper: root } = await mountManager(context);

    await testConnection(root);

    expect(root.get('[role="alert"]').text()).toBe(AI_PERMISSION_REFUSED_MESSAGE);
    expect(context.tester.requests).toEqual([]);
  });

  it('informa a revogação por fora da extensão e oferece conceder de novo', async () => {
    const context = setup(CUSTOM_CONFIG);
    const { wrapper: root } = await mountManager(context);

    expect(root.get('.ai-permission').text()).toBe(AI_PERMISSION_REVOKED_MESSAGE);

    await button(root, 'Conceder permissão').trigger('click');
    await flushPromises();

    expect(context.permissions.requested).toEqual(['https://gateway.exemplo']);
    expect(root.find('.ai-permission').exists()).toBe(false);
  });
});

describe('remoção da configuração', () => {
  it('pede confirmação, apaga a credencial e revoga a permissão', async () => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');
    const { wrapper: root } = await mountManager(context);

    await button(root, 'Remover configuração').trigger('click');
    await flushPromises();
    expect(context.repository.stored).toEqual(CUSTOM_CONFIG);

    await button(root.get('.dialog-backdrop'), 'Remover').trigger('click');
    await flushPromises();

    expect(context.repository.stored).toBeUndefined();
    expect(context.permissions.revoked).toEqual(['https://gateway.exemplo']);
    expect(context.permissions.granted.has('https://gateway.exemplo')).toBe(false);
    expect(root.get('.feedback-success').text()).toBe(AI_REMOVED_MESSAGE);
    expect(root.text()).toContain('Nenhum provedor configurado.');
    expect(document.activeElement).toBe(root.get('h1').element);
  });
});

describe('configuração persistida incompatível', () => {
  it('informa o problema, bloqueia salvar e testar e só permite remover', async () => {
    const context = setup(OPENAI_CONFIG, 'https://api.openai.com');
    context.repository.incompatible = true;
    const { wrapper: root } = await mountManager(context);

    expect(root.text()).toContain(AI_BLOCK_LABELS.INCOMPATIBLE);
    expect(root.find('[data-testid="test-connection"]').exists()).toBe(false);
    expect(
      root.findAll('button').some((candidate) => candidate.text().startsWith('Salvar')),
    ).toBe(false);

    await button(root, 'Remover configuração').trigger('click');
    await flushPromises();
    await button(root.get('.dialog-backdrop'), 'Remover').trigger('click');
    await flushPromises();

    expect(context.repository.stored).toBeUndefined();
    expect(root.text()).toContain('Nenhum provedor configurado.');
  });
});

describe('acessibilidade da área', () => {
  it('mantém um único h1 e subtítulos h2 em cada seção', async () => {
    const { wrapper: root } = await mountManager(setup(CUSTOM_CONFIG, 'https://gateway.exemplo'));

    expect(root.findAll('h1')).toHaveLength(1);
    expect(root.findAll('h2').map((heading) => heading.text())).toEqual([
      'Configuração',
      'Teste de conexão',
      'Remover configuração',
    ]);
    expect(root.findAll('h3')).toHaveLength(0);
  });

  it('associa cada seção ao próprio título', async () => {
    const { wrapper: root } = await mountManager(setup(CUSTOM_CONFIG, 'https://gateway.exemplo'));

    for (const section of root.findAll('.ai-section')) {
      const labelledBy = section.attributes('aria-labelledby');
      expect(labelledBy).toBeTruthy();
      expect(root.get(`#${labelledBy!}`).element.tagName).toBe('H2');
    }
  });

  it('rotula todos os campos e marca os inválidos', async () => {
    const { wrapper: root } = await mountManager();

    await field(root, 'Provedor').setValue('CUSTOM');
    for (const input of root.findAll('.field input, .field select')) {
      const id = input.attributes('id')!;
      expect(root.findAll('label').some((label) => label.attributes('for') === id)).toBe(true);
    }

    await save(root);

    expect(field(root, 'Base da API').attributes('aria-invalid')).toBe('true');
    expect(field(root, 'Credencial').attributes('aria-invalid')).toBe('true');
    expect(field(root, 'Modelo').attributes('aria-invalid')).toBe('true');
  });

  it('leva o foco ao alerta quando a falha não aponta um campo', async () => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');
    context.tester.next = { ok: false, reason: 'TIMEOUT' };
    const { wrapper: root } = await mountManager(context);

    await testConnection(root);

    const alert = root.get('[role="alert"]');
    expect(alert.attributes('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(alert.element);
  });

  it('anuncia sucesso em região viva sem roubar o foco', async () => {
    const context = setup(CUSTOM_CONFIG, 'https://gateway.exemplo');
    const { wrapper: root } = await mountManager(context);
    await testConnection(root);

    expect(root.get('[aria-live="polite"]').text()).toBe(AI_TEST_SUCCESS_MESSAGE);
  });
});
