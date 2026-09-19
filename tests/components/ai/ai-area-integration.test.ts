import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TaskManager from '@/components/tasks/TaskManager.vue';
import { AI_OPTIONAL_NOTICE } from '@/components/ai/ai-provider-labels';
import { createTaskTestContext } from '../../support/task-app';
import { buildTask, FIXED_NOW } from '../../support/task-fixtures';

const root = join(__dirname, '..', '..', '..');

type Scope = Omit<DOMWrapper<Element>, 'exists'>;

let wrapper: VueWrapper | undefined;

function button(scope: Pick<Scope, 'findAll'>, label: string) {
  const found = scope.findAll('button').find((candidate) => candidate.text().startsWith(label));
  if (!found) throw new Error(`Botão "${label}" não encontrado`);
  return found;
}

describe('acesso à área de provedores', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
  });

  async function mountManager() {
    const context = createTaskTestContext([buildTask()]);
    wrapper = mount(TaskManager, { global: context.global, attachTo: document.body });
    await flushPromises();
    return { context, wrapper: wrapper as VueWrapper };
  }

  it('abre a área a partir do gerenciamento de tarefas, no padrão de backup e lixeira', async () => {
    const { wrapper: root } = await mountManager();

    await button(root, 'Provedores de IA').trigger('click');
    await flushPromises();

    expect(root.get('h1').text()).toBe('Provedores de IA');
    expect(root.text()).toContain(AI_OPTIONAL_NOTICE);
    expect(root.text()).toContain('Nenhum provedor configurado.');
  });

  it('devolve o foco ao ponto de entrada ao voltar', async () => {
    const { wrapper: root } = await mountManager();
    await button(root, 'Provedores de IA').trigger('click');
    await flushPromises();

    await button(root, 'Voltar').trigger('click');
    await flushPromises();

    expect(root.get('h1').text()).toBe('Tarefas');
    expect(document.activeElement).toBe(button(root, 'Provedores de IA').element);
  });

  it('não contata nenhum provedor ao abrir a área', async () => {
    const { context, wrapper: root } = await mountManager();

    await button(root, 'Provedores de IA').trigger('click');
    await flushPromises();

    expect(context.aiTester.requests).toEqual([]);
    expect(context.aiPermissions.requested).toEqual([]);
  });
});

describe('popup não configura IA', () => {
  const popupSources = ['src/entrypoints/popup', 'src/components/quick-add'].flatMap((directory) =>
    readdirSync(join(root, directory), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => join(root, directory, entry.name)),
  );

  it('não referencia a área de provedores nem o serviço de IA', () => {
    const offenders = popupSources.filter((file) => {
      const content = readFileSync(file, 'utf8');
      return /AiProviderManager|aiProviderServiceKey|chrome-ai-service|components\/ai\//.test(
        content,
      );
    });

    expect(offenders.map((file) => relative(root, file))).toEqual([]);
  });
});

describe('credencial fora do estado compartilhado', () => {
  const storeFiles = readdirSync(join(root, 'src', 'stores'), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(root, 'src', 'stores', entry.name));

  it('nenhuma store expõe credencial ou configuração de provedor', () => {
    const offenders = storeFiles.filter((file) => {
      const content = readFileSync(file, 'utf8');
      return /credential|taskflow\.ai|AiProvider|ai-provider/i.test(content);
    });

    expect(offenders.map((file) => relative(root, file))).toEqual([]);
  });

  it('a área não usa Pinia para guardar a credencial', () => {
    const content = readFileSync(
      join(root, 'src', 'components', 'ai', 'AiProviderManager.vue'),
      'utf8',
    );

    expect(content).not.toMatch(/from ['"]pinia['"]/);
    expect(content).not.toMatch(/useStore|defineStore/);
  });

  it('o adapter lê a credencial sob demanda do repository, não de estado da interface', () => {
    const service = readFileSync(
      join(root, 'src', 'application', 'ai', 'ai-provider-service.ts'),
      'utf8',
    );

    expect(service).toContain('repository.read()');
    expect(service).toContain('tester.testConnection({ config: read.config');
  });
});
