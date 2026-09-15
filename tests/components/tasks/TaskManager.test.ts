import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBackupFile } from '@/application/backup/backup-file';
import { TaskStorageError } from '@/application/task-repository';
import TaskManager from '@/components/tasks/TaskManager.vue';
import type { PendingCapture } from '@/domain/page-capture';
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

function filterField(root: VueWrapper, label: string) {
  const labelElement = root.findAll('label').find((candidate) => candidate.text() === label);
  return root.get(`#${CSS.escape(labelElement!.attributes('for')!)}`);
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
      expect(wrapper.get('p.state[role="status"]').text()).toBe('Carregando tarefas…');

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

  describe('estrutura de títulos', () => {
    it('apresenta Lista de tarefas entre os filtros e os títulos das tarefas', async () => {
      const { wrapper } = await mountManager([buildTask({ id: 'a', title: 'A' })]);

      const headings = wrapper
        .findAll('h1, h2, h3')
        .map((heading) => [heading.element.tagName, heading.text()]);
      expect(headings).toEqual([
        ['H1', 'Tarefas'],
        ['H2', 'Pesquisa, filtros e ordenação'],
        ['H2', 'Lista de tarefas'],
        ['H3', 'A'],
      ]);
    });

    it('não apresenta Lista de tarefas quando a pesquisa não retorna tarefas', async () => {
      const { wrapper } = await mountManager([buildTask({ id: 'a', title: 'A' })]);

      await filterField(wrapper, 'Pesquisar').setValue('inexistente');

      expect(wrapper.text()).toContain('Nenhuma tarefa encontrada');
      expect(wrapper.text()).not.toContain('Lista de tarefas');
      expect(wrapper.findAll('li')).toHaveLength(0);
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

    it('leva o foco ao Título quando o envio falha na validação', async () => {
      const { wrapper } = await mountManager([buildTask()]);

      await button(wrapper, 'Nova tarefa').trigger('click');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(document.activeElement).toBe(wrapper.get('[name="title"]').element);
    });

    it('leva o foco à primeira opção de lembrete preservando os valores digitados', async () => {
      const { wrapper } = await mountManager([buildTask()]);

      await button(wrapper, 'Nova tarefa').trigger('click');
      await wrapper.get('[name="title"]').setValue('Com lembrete');
      await wrapper.get('input[name="reminders"][value="15"]').setValue(true);
      await wrapper.get('[name="sourceUrl"]').setValue('ftp://exemplo');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(document.activeElement).toBe(
        wrapper.get('input[name="reminders"][value="0"]').element,
      );
      expect((wrapper.get('[name="title"]').element as HTMLInputElement).value).toBe('Com lembrete');
      expect(
        (wrapper.get('input[name="reminders"][value="15"]').element as HTMLInputElement).checked,
      ).toBe(true);
      expect((wrapper.get('[name="sourceUrl"]').element as HTMLInputElement).value).toBe(
        'ftp://exemplo',
      );
    });

    it('leva o foco à mensagem quando a falha não tem erro de campo', async () => {
      const { wrapper, context } = await mountManager([buildTask()]);
      await button(wrapper, 'Nova tarefa').trigger('click');
      await wrapper.get('[name="title"]').setValue('Nova');
      context.repository.failNext.save = new TaskStorageError('UNAVAILABLE', 'Sem espaço.');

      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(document.activeElement).toBe(wrapper.get('[role="alert"]').element);
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

  describe('foco após ações da lista', () => {
    function stateButton(root: VueWrapper, label: string) {
      const found = root
        .get('section.state')
        .findAll('button')
        .find((candidate) => candidate.text().startsWith(label));
      if (!found) throw new Error(`Botão "${label}" não encontrado no estado`);
      return found;
    }

    it('leva o foco a Reabrir do mesmo cartão ao concluir', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'ativa', title: 'Ativa' })]);
      const complete = button(card(wrapper, 'ativa'), 'Concluir');
      complete.element.focus();

      await complete.trigger('click');
      await flushPromises();

      expect(context.repository.tasks[0]?.status).toBe('DONE');
      expect(document.activeElement).toBe(button(card(wrapper, 'ativa'), 'Reabrir').element);
      expect(document.activeElement).not.toBe(document.body);
    });

    it('leva o foco a Reabrir do mesmo cartão ao cancelar', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'ativa', title: 'Ativa' })]);
      const cancel = button(card(wrapper, 'ativa'), 'Cancelar');
      cancel.element.focus();

      await cancel.trigger('click');
      await flushPromises();

      expect(context.repository.tasks[0]?.status).toBe('CANCELLED');
      expect(document.activeElement).toBe(button(card(wrapper, 'ativa'), 'Reabrir').element);
    });

    it('leva o foco a Concluir do mesmo cartão ao reabrir', async () => {
      const { wrapper, context } = await mountManager([
        buildTask({
          id: 'feita',
          title: 'Feita',
          status: 'DONE',
          completedAt: '2026-09-10T00:00:00.000Z',
        }),
      ]);
      const reopen = button(card(wrapper, 'feita'), 'Reabrir');
      reopen.element.focus();

      await reopen.trigger('click');
      await flushPromises();

      expect(context.repository.tasks[0]?.status).toBe('TODO');
      expect(document.activeElement).toBe(button(card(wrapper, 'feita'), 'Concluir').element);
    });

    it('mantém o foco no seletor ao confirmar o status com Enter', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'ativa' })]);
      const select = card(wrapper, 'ativa').get('select');
      select.element.focus();

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('IN_PROGRESS');
      await select.trigger('keydown', { key: 'Enter' });
      await flushPromises();

      expect(context.repository.tasks[0]?.status).toBe('IN_PROGRESS');
      expect(document.activeElement).toBe(card(wrapper, 'ativa').get('select').element);
    });

    it('não retira o foco de outro controle exibido ao confirmar o status ao sair do seletor', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'ativa' })]);
      const select = card(wrapper, 'ativa').get('select');
      select.element.focus();

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('IN_PROGRESS');
      const target = button(card(wrapper, 'ativa'), 'Excluir');
      target.element.focus();
      await select.trigger('focusout');
      await flushPromises();

      expect(context.repository.tasks[0]?.status).toBe('IN_PROGRESS');
      expect(document.activeElement).toBe(target.element);
    });

    it('foca Editar do cartão que ocupa a mesma posição quando o filtro remove o cartão', async () => {
      const { wrapper } = await mountManager([
        buildTask({ id: 'a', title: 'A' }),
        buildTask({ id: 'b', title: 'B' }),
        buildTask({ id: 'c', title: 'C' }),
      ]);
      await filterField(wrapper, 'Status').setValue('TODO');

      const complete = button(card(wrapper, 'b'), 'Concluir');
      complete.element.focus();
      await complete.trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-task-id="b"]').exists()).toBe(false);
      expect(document.activeElement).toBe(button(card(wrapper, 'c'), 'Editar').element);
    });

    it('foca Editar do novo último cartão quando o último sai da lista', async () => {
      const { wrapper } = await mountManager([
        buildTask({ id: 'a', title: 'A' }),
        buildTask({ id: 'b', title: 'B' }),
      ]);
      await filterField(wrapper, 'Status').setValue('TODO');

      const complete = button(card(wrapper, 'b'), 'Concluir');
      complete.element.focus();
      await complete.trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-task-id="b"]').exists()).toBe(false);
      expect(document.activeElement).toBe(button(card(wrapper, 'a'), 'Editar').element);
    });

    it('foca Limpar filtros quando não resta cartão visível', async () => {
      const { wrapper } = await mountManager([buildTask({ id: 'a', title: 'A' })]);
      await filterField(wrapper, 'Status').setValue('TODO');

      const complete = button(card(wrapper, 'a'), 'Concluir');
      complete.element.focus();
      await complete.trigger('click');
      await flushPromises();

      expect(wrapper.text()).toContain('Nenhuma tarefa encontrada');
      expect(document.activeElement).toBe(stateButton(wrapper, 'Limpar filtros').element);
    });

    it('mantém o foco em Concluir quando a alteração falha', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'ativa' })]);
      context.repository.failNext.save = new Error('falhou');
      const complete = button(card(wrapper, 'ativa'), 'Concluir');
      complete.element.focus();

      await complete.trigger('click');
      await flushPromises();

      expect(context.repository.tasks[0]?.status).toBe('TODO');
      expect(document.activeElement).toBe(button(card(wrapper, 'ativa'), 'Concluir').element);
    });

    it('foca Editar do cartão seguinte quando uma exclusão intermediária é confirmada', async () => {
      const { wrapper, context } = await mountManager([
        buildTask({ id: 'a', title: 'A' }),
        buildTask({ id: 'b', title: 'B' }),
        buildTask({ id: 'c', title: 'C' }),
      ]);
      const remove = button(card(wrapper, 'b'), 'Excluir');
      remove.element.focus();

      await remove.trigger('click');
      await button(wrapper.get('[role="alertdialog"]'), 'Excluir').trigger('click');
      await flushPromises();

      expect(context.repository.tasks.map((task) => task.id)).toEqual(['a', 'c']);
      expect(document.activeElement).toBe(button(card(wrapper, 'c'), 'Editar').element);
    });

    it('foca Criar primeira tarefa quando a única tarefa é excluída', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'a', title: 'A' })]);
      const remove = button(card(wrapper, 'a'), 'Excluir');
      remove.element.focus();

      await remove.trigger('click');
      await button(wrapper.get('[role="alertdialog"]'), 'Excluir').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toEqual([]);
      expect(wrapper.text()).toContain('Nenhuma tarefa ainda');
      expect(document.activeElement).toBe(button(wrapper, 'Criar primeira tarefa').element);
    });

    it('devolve o foco a Excluir quando a exclusão falha', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'a', title: 'A' })]);
      context.repository.failNext.delete = new Error('falhou');
      const remove = button(card(wrapper, 'a'), 'Excluir');
      remove.element.focus();

      await remove.trigger('click');
      await button(wrapper.get('[role="alertdialog"]'), 'Excluir').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toHaveLength(1);
      expect(document.activeElement).toBe(button(card(wrapper, 'a'), 'Excluir').element);
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

  describe('captura pendente', () => {
    function pendingCapture(overrides: Partial<PendingCapture> = {}): PendingCapture {
      return {
        version: 1,
        id: 'captura-1',
        kind: 'page',
        capturedAt: FIXED_NOW.toISOString(),
        draft: {
          title: 'Chamado capturado',
          sourceUrl: 'https://exemplo.com/chamado',
        },
        ...overrides,
      };
    }

    it('abre o formulário pré-preenchido ao montar com captura pendente', async () => {
      const { wrapper } = await mountManager([buildTask()], (context) => {
        context.pendingCapture.takeResult = pendingCapture();
      });

      expect(wrapper.text()).toContain('Dados capturados da página. Revise antes de salvar.');
      expect((wrapper.get('[name="title"]').element as HTMLInputElement).value).toBe(
        'Chamado capturado',
      );
      expect((wrapper.get('[name="sourceUrl"]').element as HTMLInputElement).value).toBe(
        'https://exemplo.com/chamado',
      );
      expect((wrapper.get('[name="status"]').element as HTMLSelectElement).value).toBe('TODO');
      expect((wrapper.get('[name="priority"]').element as HTMLSelectElement).value).toBe('MEDIUM');
    });

    it('apresenta a captura que chega com a listagem aberta', async () => {
      const { wrapper, context } = await mountManager([buildTask()]);
      expect(wrapper.find('form').exists()).toBe(false);

      context.pendingCapture.emit(pendingCapture());
      await flushPromises();

      expect(wrapper.find('form').exists()).toBe(true);
      expect((wrapper.get('[name="title"]').element as HTMLInputElement).value).toBe(
        'Chamado capturado',
      );
    });

    it('salva a captura persistindo a tarefa', async () => {
      const { wrapper, context } = await mountManager([buildTask()], (context) => {
        context.pendingCapture.takeResult = pendingCapture();
      });

      await wrapper.get('[name="title"]').setValue('Chamado revisado');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(context.repository.tasks.at(-1)).toMatchObject({
        title: 'Chamado revisado',
        sourceUrl: 'https://exemplo.com/chamado',
        status: 'TODO',
        priority: 'MEDIUM',
      });
      expect(wrapper.text()).toContain('Tarefa criada.');
    });

    it('cancela a captura sem persistir e sem reapresentar', async () => {
      const { wrapper, context } = await mountManager([buildTask()], (context) => {
        context.pendingCapture.takeResult = pendingCapture();
      });

      await button(wrapper, 'Cancelar').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toHaveLength(1);
      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('Dados capturados da página');
      expect(wrapper.text()).not.toContain('aguardando revisão');
    });

    it('preserva os valores digitados quando uma captura chega durante a edição', async () => {
      const original = buildTask({ id: 'abc', title: 'Antes' });
      const { wrapper, context } = await mountManager([original]);

      await button(card(wrapper, 'abc'), 'Editar').trigger('click');
      await wrapper.get('[name="title"]').setValue('Editado');
      context.pendingCapture.emit(pendingCapture());
      await flushPromises();

      expect(wrapper.find('form').exists()).toBe(true);
      expect((wrapper.get('[name="title"]').element as HTMLInputElement).value).toBe('Editado');
      expect(wrapper.text()).toContain('aguardando revisão');
    });

    it('oferece Revisar captura após cancelar a edição', async () => {
      const original = buildTask({ id: 'abc', title: 'Antes' });
      const { wrapper, context } = await mountManager([original]);

      await button(card(wrapper, 'abc'), 'Editar').trigger('click');
      context.pendingCapture.emit(pendingCapture());
      await flushPromises();
      await button(wrapper, 'Cancelar').trigger('click');
      await flushPromises();

      expect(wrapper.text()).toContain('aguardando revisão');
      await button(wrapper, 'Revisar captura').trigger('click');
      await flushPromises();

      expect((wrapper.get('[name="title"]').element as HTMLInputElement).value).toBe(
        'Chamado capturado',
      );
      expect(wrapper.text()).toContain('Dados capturados da página');
    });

    it('descarta a captura aguardando revisão', async () => {
      const original = buildTask({ id: 'abc', title: 'Antes' });
      const { wrapper, context } = await mountManager([original]);

      await button(card(wrapper, 'abc'), 'Editar').trigger('click');
      context.pendingCapture.emit(pendingCapture());
      await flushPromises();
      await button(wrapper, 'Cancelar').trigger('click');
      await flushPromises();

      await button(wrapper, 'Descartar captura').trigger('click');
      await flushPromises();

      expect(wrapper.text()).not.toContain('aguardando revisão');
      expect(wrapper.find('form').exists()).toBe(false);
    });

    it('não interrompe a área de backup', async () => {
      const { wrapper, context } = await mountManager([buildTask()]);

      await button(wrapper, 'Backup').trigger('click');
      await flushPromises();
      context.pendingCapture.emit(pendingCapture());
      await flushPromises();

      expect(wrapper.find('input[type="file"]').exists()).toBe(true);
      expect(wrapper.text()).toContain('aguardando revisão');

      await button(wrapper, 'Voltar').trigger('click');
      await flushPromises();

      expect(wrapper.text()).toContain('aguardando revisão');
    });

    it('não interrompe a confirmação de exclusão', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'a', title: 'A' })]);

      await button(card(wrapper, 'a'), 'Excluir').trigger('click');
      context.pendingCapture.emit(pendingCapture());
      await flushPromises();

      const dialog = wrapper.get('[role="alertdialog"]');
      expect(dialog.text()).toContain('“A” será excluída definitivamente');
      await button(dialog, 'Excluir').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toEqual([]);
    });

    it('não reapresenta a captura consumida em uma nova abertura', async () => {
      const { wrapper: first, context } = await mountManager([buildTask()]);
      context.pendingCapture.emit(pendingCapture());
      await flushPromises();
      expect(first.find('form').exists()).toBe(true);

      first.unmount();
      wrapper = mount(TaskManager, { global: context.global, attachTo: document.body });
      await flushPromises();

      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('aguardando revisão');
    });

    it('não apresenta captura expirada', async () => {
      const { wrapper } = await mountManager([buildTask()], (context) => {
        context.pendingCapture.takeResult = pendingCapture({
          capturedAt: new Date(FIXED_NOW.getTime() - 11 * 60 * 1000).toISOString(),
        });
      });

      expect(wrapper.find('form').exists()).toBe(false);
      expect(wrapper.text()).not.toContain('aguardando revisão');
    });
  });
});
