import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBackupFile } from '@/application/backup/backup-file';
import { TaskStorageError } from '@/application/task-repository';
import TaskManager from '@/components/tasks/TaskManager.vue';
import type { Task } from '@/domain/task';
import { createTaskTestContext } from '../../support/task-app';
import { buildTask, FIXED_NOW, hoursFrom } from '../../support/task-fixtures';

type Context = ReturnType<typeof createTaskTestContext>;
type Scope = Omit<DOMWrapper<Element>, 'exists'>;

let wrapper: VueWrapper | undefined;

async function mountManager(tasks: Task[] = [], prepare?: (context: Context) => void) {
  const context = createTaskTestContext(tasks);
  prepare?.(context);
  wrapper = mount(TaskManager, { global: context.global, attachTo: document.body });
  await flushPromises();
  return { context, wrapper };
}

function button(root: Pick<Scope, 'findAll'>, label: string) {
  const found = root.findAll('button').find((candidate) => candidate.text().startsWith(label));
  if (!found) throw new Error(`Botão "${label}" não encontrado`);
  return found;
}

function card(root: VueWrapper, id: string) {
  return root.get(`[data-task-id="${id}"]`);
}

function visibleTitles(root: VueWrapper): string[] {
  return root.findAll('li h3').map((title) => title.text());
}

describe('TaskManager', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
  });

  describe('estados da interface', () => {
    it('apresenta carregamento enquanto a leitura não termina', async () => {
      const context = createTaskTestContext();
      let release: (tasks: Task[]) => void = () => undefined;
      vi.spyOn(context.repository, 'list').mockReturnValue(
        new Promise((resolve) => {
          release = resolve;
        }),
      );

      wrapper = mount(TaskManager, { global: context.global });
      await flushPromises();
      expect(wrapper.get('[role="status"]').text()).toBe('Carregando tarefas…');

      release([buildTask()]);
      await flushPromises();
      expect(wrapper.text()).not.toContain('Carregando tarefas…');
      expect(visibleTitles(wrapper)).toEqual(['Revisar proposta']);
    });

    it('apresenta lista vazia com ação que abre o formulário focado', async () => {
      const { wrapper } = await mountManager();

      expect(wrapper.text()).toContain('Nenhuma tarefa ainda');
      await button(wrapper, 'Criar primeira tarefa').trigger('click');

      expect(wrapper.find('form').exists()).toBe(true);
      expect(document.activeElement).toBe(wrapper.get('[name="title"]').element);
    });

    it('apresenta erro de carregamento, foca a nova tentativa e recupera a lista', async () => {
      const { wrapper } = await mountManager([buildTask()], ({ repository }) => {
        repository.failNext.list = new TaskStorageError('UNAVAILABLE', 'Tente mais tarde.');
      });

      const alert = wrapper.get('[role="alert"]');
      expect(alert.text()).toContain('Não foi possível carregar as tarefas. Tente mais tarde.');
      const retry = button(wrapper, 'Tentar novamente');
      expect(document.activeElement).toBe(retry.element);

      await retry.trigger('click');
      await flushPromises();

      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(visibleTitles(wrapper)).toEqual(['Revisar proposta']);
    });

    it('reflete alteração feita em outra superfície', async () => {
      const { wrapper, context } = await mountManager([buildTask()]);

      context.repository.replaceExternally([buildTask({ title: 'Alterada no popup' })]);
      await flushPromises();

      expect(visibleTitles(wrapper)).toEqual(['Alterada no popup']);
    });
  });

  describe('criação e edição', () => {
    it('cria tarefa pelo formulário completo e a exibe na listagem', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'existente' })]);

      await button(wrapper, 'Nova tarefa').trigger('click');
      await wrapper.get('[name="title"]').setValue('Contratar fornecedor');
      await wrapper.get('[name="priority"]').setValue('URGENT');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.text()).toContain('Tarefa criada.');
      expect(visibleTitles(wrapper)).toContain('Contratar fornecedor');
      expect(context.repository.tasks.at(-1)).toMatchObject({
        title: 'Contratar fornecedor',
        priority: 'URGENT',
        status: 'TODO',
      });
      expect(document.activeElement).toBe(button(wrapper, 'Nova tarefa').element);
    });

    it('mantém o formulário e mostra erros de validação junto aos campos', async () => {
      const { wrapper, context } = await mountManager([buildTask()]);

      await button(wrapper, 'Nova tarefa').trigger('click');
      await wrapper.get('[name="description"]').setValue('Sem título');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.get('[name="title"]').attributes('aria-invalid')).toBe('true');
      expect(wrapper.text()).toContain('Informe um título.');
      expect((wrapper.get('[name="description"]').element as HTMLTextAreaElement).value).toBe(
        'Sem título',
      );
      expect(context.repository.tasks).toHaveLength(1);
    });

    it('informa falha de persistência sem fechar o formulário', async () => {
      const { wrapper, context } = await mountManager([buildTask()]);
      await button(wrapper, 'Nova tarefa').trigger('click');
      await wrapper.get('[name="title"]').setValue('Nova');
      context.repository.failNext.save = new TaskStorageError('UNAVAILABLE', 'Sem espaço.');

      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe('A tarefa não foi salva. Sem espaço.');
      expect((wrapper.get('[name="title"]').element as HTMLInputElement).value).toBe('Nova');
      expect(wrapper.text()).not.toContain('Tarefa criada.');
    });

    it('edita preservando identidade e criação', async () => {
      const original = buildTask({ id: 'abc', title: 'Antes' });
      const { wrapper, context } = await mountManager([original]);

      await button(card(wrapper, 'abc'), 'Editar').trigger('click');
      await wrapper.get('[name="title"]').setValue('Depois');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(context.repository.tasks).toEqual([
        expect.objectContaining({
          id: 'abc',
          title: 'Depois',
          createdAt: original.createdAt,
          updatedAt: FIXED_NOW.toISOString(),
        }),
      ]);
      expect(wrapper.text()).toContain('Alterações salvas.');
    });

    it('cancelar edição mantém os dados persistidos', async () => {
      const original = buildTask({ id: 'abc', title: 'Antes' });
      const { wrapper, context } = await mountManager([original]);

      await button(card(wrapper, 'abc'), 'Editar').trigger('click');
      await wrapper.get('[name="title"]').setValue('Descartado');
      await button(wrapper, 'Cancelar').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toEqual([original]);
      expect(visibleTitles(wrapper)).toEqual(['Antes']);
    });

    it('rejeita lembrete sem prazo no formulário completo', async () => {
      const { wrapper, context } = await mountManager([buildTask()]);

      await button(wrapper, 'Nova tarefa').trigger('click');
      await wrapper.get('[name="title"]').setValue('Com lembrete');
      await wrapper.get('input[name="reminders"][value="15"]').setValue(true);
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.get('fieldset').text()).toContain('Lembretes exigem um prazo.');
      expect(context.repository.tasks).toHaveLength(1);
    });

    it('salva lembretes e avisa quando o agendamento ficou pendente', async () => {
      const { wrapper, context } = await mountManager([buildTask()]);
      context.scheduler.failNext = true;

      await button(wrapper, 'Nova tarefa').trigger('click');
      await wrapper.get('[name="title"]').setValue('Com lembrete');
      await wrapper.get('[name="dueAt"]').setValue('2026-09-20T10:00');
      await wrapper.get('input[name="reminders"][value="60"]').setValue(true);
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.get('.feedback-warning').text()).toContain('lembretes ficaram pendentes');
      expect(context.repository.tasks.at(-1)?.reminders).toHaveLength(1);
    });
  });

  describe('ações da lista', () => {
    const active = buildTask({ id: 'ativa', title: 'Ativa', dueAt: hoursFrom(FIXED_NOW, 48) });
    const done = buildTask({
      id: 'feita',
      title: 'Feita',
      status: 'DONE',
      completedAt: '2026-09-10T00:00:00.000Z',
    });

    it.each([
      ['Concluir', 'ativa', 'DONE'],
      ['Cancelar', 'ativa', 'CANCELLED'],
      ['Reabrir', 'feita', 'TODO'],
    ] as const)('%s chama a alteração de status correspondente', async (label, id, status) => {
      const { wrapper, context } = await mountManager([active, done]);
      const changeStatus = vi.spyOn(context.service, 'changeStatus');

      await button(card(wrapper, id), label).trigger('click');
      await flushPromises();

      expect(changeStatus).toHaveBeenCalledWith(id, status);
      expect(context.repository.tasks.find((task) => task.id === id)?.status).toBe(status);
    });

    it('altera status diretamente pelo seletor', async () => {
      const { wrapper, context } = await mountManager([active]);
      const changeStatus = vi.spyOn(context.service, 'changeStatus');

      await card(wrapper, 'ativa').get('select').setValue('IN_PROGRESS');
      await flushPromises();

      expect(changeStatus).toHaveBeenCalledWith('ativa', 'IN_PROGRESS');
      expect(wrapper.text()).toContain('alterado para Em andamento');
    });

    it('informa falha ao alterar status', async () => {
      const { wrapper, context } = await mountManager([active]);
      context.repository.failNext.save = new Error('falhou');

      await button(card(wrapper, 'ativa'), 'Concluir').trigger('click');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe('O status não foi alterado.');
      expect(context.repository.tasks[0]?.status).toBe('TODO');
    });

    it('exclui somente após confirmação', async () => {
      const { wrapper, context } = await mountManager([active, done]);
      const remove = vi.spyOn(context.service, 'remove');

      await button(card(wrapper, 'ativa'), 'Excluir').trigger('click');
      const dialog = wrapper.get('[role="alertdialog"]');
      expect(dialog.text()).toContain('“Ativa” será excluída definitivamente');
      expect(document.activeElement?.textContent?.trim()).toBe('Cancelar');
      expect(remove).not.toHaveBeenCalled();

      await button(dialog, 'Excluir').trigger('click');
      await flushPromises();

      expect(remove).toHaveBeenCalledWith('ativa');
      expect(context.repository.tasks.map((task) => task.id)).toEqual(['feita']);
      expect(visibleTitles(wrapper)).toEqual(['Feita']);
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    });

    it.each([
      ['botão cancelar', (dialog: Scope) => button(dialog, 'Cancelar').trigger('click')],
      ['tecla Escape', (dialog: Scope) => dialog.trigger('keydown', { key: 'Escape' })],
    ])('cancelar a confirmação pelo %s não altera a tarefa', async (_label, cancel) => {
      const { wrapper, context } = await mountManager([active]);
      const remove = vi.spyOn(context.service, 'remove');

      await button(card(wrapper, 'ativa'), 'Excluir').trigger('click');
      await cancel(wrapper.get('[role="alertdialog"]'));
      await flushPromises();

      expect(remove).not.toHaveBeenCalled();
      expect(context.repository.tasks).toEqual([active]);
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    });
  });

  describe('pesquisa, filtros e ordenação', () => {
    const tasks = [
      buildTask({
        id: 'a',
        title: 'Relatório mensal',
        priority: 'LOW',
        dueAt: hoursFrom(FIXED_NOW, -2),
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
      buildTask({
        id: 'b',
        title: 'Reunião com cliente',
        priority: 'URGENT',
        status: 'IN_PROGRESS',
        dueAt: hoursFrom(FIXED_NOW, 3),
        tags: ['Comercial'],
        createdAt: '2026-09-02T00:00:00.000Z',
      }),
      buildTask({
        id: 'c',
        title: 'Planejamento',
        priority: 'HIGH',
        assignee: 'Marina',
        createdAt: '2026-09-03T00:00:00.000Z',
      }),
      buildTask({
        id: 'd',
        title: 'Relatório anual',
        priority: 'HIGH',
        status: 'DONE',
        dueAt: hoursFrom(FIXED_NOW, -10),
        createdAt: '2026-09-04T00:00:00.000Z',
      }),
    ];

    function field(root: VueWrapper, label: string) {
      const labelElement = root.findAll('label').find((candidate) => candidate.text() === label);
      return root.get(`#${CSS.escape(labelElement!.attributes('for')!)}`);
    }

    it('ordena por prazo por padrão e permite ordenar por prioridade e status', async () => {
      const { wrapper } = await mountManager(tasks);

      expect(visibleTitles(wrapper)).toEqual([
        'Relatório anual',
        'Relatório mensal',
        'Reunião com cliente',
        'Planejamento',
      ]);

      await field(wrapper, 'Ordenar por').setValue('PRIORITY');
      expect(visibleTitles(wrapper)).toEqual([
        'Reunião com cliente',
        'Relatório anual',
        'Planejamento',
        'Relatório mensal',
      ]);

      await field(wrapper, 'Ordenar por').setValue('STATUS');
      expect(visibleTitles(wrapper)).toEqual([
        'Relatório mensal',
        'Planejamento',
        'Reunião com cliente',
        'Relatório anual',
      ]);
    });

    it('pesquisa sem diferenciar maiúsculas em campos e tags', async () => {
      const { wrapper } = await mountManager(tasks);

      await field(wrapper, 'Pesquisar').setValue('comercial');
      expect(visibleTitles(wrapper)).toEqual(['Reunião com cliente']);

      await field(wrapper, 'Pesquisar').setValue('MARINA');
      expect(visibleTitles(wrapper)).toEqual(['Planejamento']);
    });

    it('combina filtros e limpa mantendo a ordenação escolhida', async () => {
      const { wrapper } = await mountManager(tasks);
      await field(wrapper, 'Ordenar por').setValue('PRIORITY');

      await field(wrapper, 'Pesquisar').setValue('relatório');
      await field(wrapper, 'Status').setValue('TODO');
      await field(wrapper, 'Prioridade').setValue('LOW');
      await field(wrapper, 'Prazo').setValue('OVERDUE');
      expect(visibleTitles(wrapper)).toEqual(['Relatório mensal']);
      expect(wrapper.text()).toContain('1 de 4 tarefas');

      await button(wrapper, 'Limpar filtros').trigger('click');

      expect(visibleTitles(wrapper)).toEqual([
        'Reunião com cliente',
        'Relatório anual',
        'Planejamento',
        'Relatório mensal',
      ]);
      expect((field(wrapper, 'Pesquisar').element as HTMLInputElement).value).toBe('');
      expect((field(wrapper, 'Status').element as HTMLSelectElement).value).toBe('ALL');
    });

    it('filtra próximas do vencimento', async () => {
      const { wrapper } = await mountManager(tasks);

      await field(wrapper, 'Prazo').setValue('DUE_SOON');

      expect(visibleTitles(wrapper)).toEqual(['Reunião com cliente']);
    });

    it('apresenta estado sem correspondência com ação para limpar filtros', async () => {
      const { wrapper } = await mountManager(tasks);

      await field(wrapper, 'Pesquisar').setValue('inexistente');
      expect(wrapper.text()).toContain('Nenhuma tarefa encontrada');
      expect(wrapper.find('li').exists()).toBe(false);

      const clearButtons = wrapper
        .findAll('button')
        .filter((candidate) => candidate.text() === 'Limpar filtros');
      await clearButtons.at(-1)!.trigger('click');

      expect(visibleTitles(wrapper)).toHaveLength(4);
    });
  });

  describe('backup', () => {
    const backupFile = encodeBackupFile([buildTask({ id: 'nova', title: 'Restaurada' })], {
      exportedAt: '2026-09-13T12:00:00.000Z',
      appVersion: '0.1.0',
    });

    async function chooseBackupFile(root: VueWrapper, text: string): Promise<void> {
      const input = root.get('input[type="file"]');
      Object.defineProperty(input.element, 'files', {
        value: [{ size: text.length, text: () => Promise.resolve(text) }],
        configurable: true,
      });
      await input.trigger('change');
      await flushPromises();
    }

    it('abre a área pelo cabeçalho e volta sem alterar as tarefas', async () => {
      const original = buildTask({ id: 'a' });
      const { wrapper, context } = await mountManager([original]);

      await button(wrapper, 'Backup').trigger('click');
      await flushPromises();

      expect(wrapper.find('input[type="file"]').exists()).toBe(true);
      expect(wrapper.text()).not.toContain('Nova tarefa');

      await button(wrapper, 'Voltar').trigger('click');
      await flushPromises();

      expect(wrapper.find('input[type="file"]').exists()).toBe(false);
      expect(visibleTitles(wrapper)).toEqual(['Revisar proposta']);
      expect(context.repository.tasks).toEqual([original]);
    });

    it('oferece restaurar backup no estado de lista vazia', async () => {
      const { wrapper } = await mountManager([]);

      expect(wrapper.text()).toContain('Criar primeira tarefa');
      await button(wrapper, 'Restaurar backup').trigger('click');
      await flushPromises();

      expect(wrapper.find('input[type="file"]').exists()).toBe(true);
    });

    it('volta à listagem atualizada após restaurar', async () => {
      const { wrapper, context } = await mountManager([]);

      await button(wrapper, 'Restaurar backup').trigger('click');
      await flushPromises();
      await chooseBackupFile(wrapper, backupFile);
      await button(wrapper, 'Restaurar').trigger('click');
      await button(wrapper.get('[role="alertdialog"]'), 'Substituir tarefas').trigger('click');
      await flushPromises();

      expect(wrapper.find('input[type="file"]').exists()).toBe(false);
      expect(visibleTitles(wrapper)).toEqual(['Restaurada']);
      expect(context.repository.tasks.map((task) => task.id)).toEqual(['nova']);
      expect(wrapper.text()).toContain('Restauração concluída: 1 tarefa restaurada.');
    });
  });
});
