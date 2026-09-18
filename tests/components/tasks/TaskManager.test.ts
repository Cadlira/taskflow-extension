import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBackupFile } from '@/application/backup/backup-file';
import { TaskStorageError } from '@/application/task-repository';
import TaskManager from '@/components/tasks/TaskManager.vue';
import type { PendingCapture } from '@/domain/page-capture';
import type { Task } from '@/domain/task';
import { shortcutsReaderKey } from '@/components/shortcuts/shortcuts-reader-key';
import { createTaskTestContext } from '../../support/task-app';
import { FakeKeyboardShortcutsReader } from '../../support/fakes';
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

    it('abandonar a edição após adicionar, remover ou reordenar subtarefas não altera as persistidas', async () => {
      const original = buildTask({
        id: 'abc',
        subtasks: [
          { id: 'a', title: 'A', done: true },
          { id: 'b', title: 'B', done: false },
          { id: 'c', title: 'C', done: false },
        ],
      });
      const { wrapper, context } = await mountManager([original]);
      const labelled = (label: string) =>
        wrapper.findAll('button').find((candidate) => candidate.attributes('aria-label') === label)!;

      await button(card(wrapper, 'abc'), 'Editar').trigger('click');
      await button(wrapper, 'Adicionar subtarefa').trigger('click');
      await wrapper.findAll('input[name="subtask-title"]')[3]!.setValue('D');
      await labelled('Remover subtarefa 2: B').trigger('click');
      await labelled('Mover para cima subtarefa 2: C').trigger('click');
      await flushPromises();
      await button(wrapper, 'Cancelar').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toEqual([original]);
    });

    it('salvar o formulário preserva a marcação feita em outra superfície durante a edição', async () => {
      const original = buildTask({
        id: 'abc',
        title: 'Preparar reunião',
        subtasks: [{ id: 'a', title: 'A', done: false }],
      });
      const { wrapper, context } = await mountManager([original]);

      await button(card(wrapper, 'abc'), 'Editar').trigger('click');
      await wrapper.get('[name="title"]').setValue('Preparar reunião da diretoria');
      context.repository.tasks = [{ ...original, subtasks: [{ id: 'a', title: 'A', done: true }] }];
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(context.repository.tasks).toEqual([
        expect.objectContaining({
          title: 'Preparar reunião da diretoria',
          subtasks: [{ id: 'a', title: 'A', done: true }],
        }),
      ]);
    });

    it('rejeita lembrete sem prazo no formulário completo', async () => {
      const { wrapper, context } = await mountManager([buildTask()]);

      await button(wrapper, 'Nova tarefa').trigger('click');
      await wrapper.get('[name="title"]').setValue('Com lembrete');
      await wrapper.get('input[name="reminders"][value="15"]').setValue(true);
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.get('fieldset.reminders').text()).toContain('Lembretes exigem um prazo.');
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

    it('apresenta o conflito entre recorrência e lembrete absoluto e foca a recorrência', async () => {
      const series = buildTask({
        id: 'serie',
        title: 'Recorrente',
        dueAt: hoursFrom(FIXED_NOW, 48),
        seriesId: 'serie-1',
        recurrence: { frequency: 'DAILY', intervalDays: 1 },
        reminders: [{ id: 'r', type: 'AT', at: hoursFrom(FIXED_NOW, 24) }],
      });
      const { wrapper, context } = await mountManager([series]);

      await button(card(wrapper, 'serie'), 'Editar').trigger('click');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(wrapper.text()).toContain(
        'Remova ou converta os lembretes de horário absoluto antes de salvar a recorrência.',
      );
      expect(document.activeElement).toBe(
        wrapper.get('[name="recurrence-frequency"]').element,
      );
      expect(context.repository.tasks).toEqual([series]);
    });

    it('encerra a série pelo formulário mantendo a tarefa', async () => {
      const series = buildTask({
        id: 'serie',
        title: 'Pagar conta',
        dueAt: hoursFrom(FIXED_NOW, 48),
        seriesId: 'serie-1',
        recurrence: { frequency: 'MONTHLY', dayOfMonth: 10 },
      });
      const { wrapper, context } = await mountManager([series]);

      await button(card(wrapper, 'serie'), 'Editar').trigger('click');
      await button(wrapper, 'Encerrar série').trigger('click');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(context.repository.tasks).toHaveLength(1);
      expect(context.repository.tasks[0]).toMatchObject({ id: 'serie', seriesId: 'serie-1' });
      expect(context.repository.tasks[0]?.recurrence).toBeUndefined();
      expect(wrapper.text()).toContain('Alterações salvas.');
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
      expect(dialog.text()).toContain(
        'A tarefa “Ativa” irá para a lixeira e poderá ser restaurada por 30 dias.',
      );
      expect(dialog.text()).not.toContain('série');
      expect(document.activeElement?.textContent?.trim()).toBe('Cancelar');
      expect(remove).not.toHaveBeenCalled();

      await button(dialog, 'Excluir').trigger('click');
      await flushPromises();

      expect(remove).toHaveBeenCalledWith('ativa');
      expect(context.repository.tasks.map((task) => task.id)).toEqual(['feita']);
      expect(context.repository.trash.map((item) => item.task.id)).toEqual(['ativa']);
      expect(visibleTitles(wrapper)).toEqual(['Feita']);
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
      expect(wrapper.get('.live-region').text()).toBe('Tarefa “Ativa” movida para a lixeira.');
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

    it('informa que a série será encerrada ao excluir a ocorrência que carrega a regra', async () => {
      const series = buildTask({
        id: 'serie',
        title: 'Pagar conta',
        dueAt: hoursFrom(FIXED_NOW, 48),
        seriesId: 'serie-1',
        recurrence: { frequency: 'MONTHLY', dayOfMonth: 10 },
      });
      const { wrapper } = await mountManager([series]);

      await button(card(wrapper, 'serie'), 'Excluir').trigger('click');

      const dialogText = wrapper.get('[role="alertdialog"]').text();
      expect(dialogText).toContain(
        'A tarefa “Pagar conta” irá para a lixeira e poderá ser restaurada por 30 dias.',
      );
      expect(dialogText).toContain('A série será encerrada e nenhuma ocorrência nova será criada.');
    });
  });

  describe('subtarefas no cartão', () => {
    const subtasks = [
      { id: 's-1', title: 'Reservar sala', done: true },
      { id: 's-2', title: 'Enviar pauta', done: false },
    ];

    function checkbox(root: VueWrapper, taskId: string, subtaskId: string) {
      return card(root, taskId).get(`[data-subtask-id="${subtaskId}"]`);
    }

    async function expand(root: VueWrapper, taskId: string) {
      await card(root, taskId).get('[data-action="subtasks"]').trigger('click');
    }

    /** O navegador converte Espaço na caixa focada em um clique; o happy-dom não sintetiza isso. */
    async function pressSpace(target: ReturnType<typeof checkbox>) {
      (target.element as HTMLInputElement).focus();
      await target.trigger('keydown', { key: ' ', code: 'Space' });
      (target.element as HTMLInputElement).click();
      await target.trigger('keyup', { key: ' ', code: 'Space' });
    }

    it('marca pelo teclado, persiste, atualiza o progresso e mantém o foco na caixa', async () => {
      const { wrapper, context } = await mountManager([
        buildTask({ id: 'a', status: 'IN_PROGRESS', subtasks }),
      ]);
      await expand(wrapper, 'a');
      const target = checkbox(wrapper, 'a', 's-2');

      await pressSpace(target);
      await flushPromises();

      expect(context.repository.tasks[0]).toMatchObject({
        status: 'IN_PROGRESS',
        subtasks: [
          { id: 's-1', done: true },
          { id: 's-2', done: true },
        ],
      });
      expect(context.repository.tasks[0]?.completedAt).toBeUndefined();
      expect(card(wrapper, 'a').get('[data-test="subtask-progress"]').text()).toBe('2 de 2');
      expect((checkbox(wrapper, 'a', 's-2').element as HTMLInputElement).checked).toBe(true);
      expect(document.activeElement).toBe(checkbox(wrapper, 'a', 's-2').element);
      expect(card(wrapper, 'a').get('[data-action="subtasks"]').attributes('aria-expanded')).toBe(
        'true',
      );
    });

    it('marca subtarefa de tarefa cancelada mantendo o status', async () => {
      const { wrapper, context } = await mountManager([
        buildTask({ id: 'a', status: 'CANCELLED', subtasks }),
      ]);
      await expand(wrapper, 'a');

      await checkbox(wrapper, 'a', 's-2').trigger('click');
      await flushPromises();

      expect(context.repository.tasks[0]).toMatchObject({
        status: 'CANCELLED',
        subtasks: [{ done: true }, { done: true }],
      });
    });

    it('ignora acionamento repetido durante a gravação sem iniciar segunda gravação', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'a', subtasks })]);
      await expand(wrapper, 'a');
      let release: () => void = () => undefined;
      const original = context.repository.updateTaskConditionally.bind(context.repository);
      const update = vi
        .spyOn(context.repository, 'updateTaskConditionally')
        .mockImplementation(async (id, change) => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return original(id, change);
        });
      const target = checkbox(wrapper, 'a', 's-2');

      await pressSpace(target);
      await flushPromises();
      expect(target.attributes('aria-disabled')).toBe('true');

      await pressSpace(target);
      await flushPromises();
      expect(update).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(target.element);

      release();
      await flushPromises();

      expect(update).toHaveBeenCalledTimes(1);
      expect(context.repository.tasks[0]?.subtasks[1]?.done).toBe(true);
      expect(checkbox(wrapper, 'a', 's-2').attributes('aria-disabled')).toBeUndefined();
      expect(document.activeElement).toBe(checkbox(wrapper, 'a', 's-2').element);
    });

    it('restaura a marcação persistida, informa a falha e mantém o foco na caixa', async () => {
      const original = buildTask({ id: 'a', subtasks });
      const { wrapper, context } = await mountManager([original]);
      await expand(wrapper, 'a');
      context.repository.failNext.updateTaskConditionally = new TaskStorageError(
        'UNAVAILABLE',
        'Sem espaço.',
      );
      const target = checkbox(wrapper, 'a', 's-2');

      await pressSpace(target);
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe(
        'A alteração da subtarefa não foi salva. Sem espaço.',
      );
      expect((checkbox(wrapper, 'a', 's-2').element as HTMLInputElement).checked).toBe(false);
      expect(document.activeElement).toBe(checkbox(wrapper, 'a', 's-2').element);
      expect(context.repository.tasks).toEqual([original]);
    });

    it('informa subtarefa removida em outra superfície sem recriá-la nem alterar as demais', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'a', subtasks })]);
      await expand(wrapper, 'a');
      const target = checkbox(wrapper, 'a', 's-2');
      (target.element as HTMLInputElement).focus();
      context.repository.tasks = [buildTask({ id: 'a', subtasks: [subtasks[0]!] })];

      (target.element as HTMLInputElement).click();
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe(
        'A alteração da subtarefa não foi salva. A subtarefa não existe mais.',
      );
      expect(context.repository.tasks[0]?.subtasks).toEqual([subtasks[0]]);
      expect(card(wrapper, 'a').find('[data-subtask-id="s-2"]').exists()).toBe(false);
      expect(document.activeElement).toBe(card(wrapper, 'a').get('[data-action="subtasks"]').element);
    });

    it('mantém a expansão quando outra superfície altera a tarefa', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'a', subtasks })]);
      await expand(wrapper, 'a');

      context.repository.replaceExternally([
        buildTask({ id: 'a', title: 'Alterada', subtasks: subtasks.map((s) => ({ ...s, done: true })) }),
      ]);
      await flushPromises();

      expect(card(wrapper, 'a').get('[data-action="subtasks"]').attributes('aria-expanded')).toBe(
        'true',
      );
      expect(card(wrapper, 'a').get('[data-test="subtask-progress"]').text()).toBe('2 de 2');
    });

    it('concluir tarefa com subtarefas pendentes não abre diálogo e preserva as marcações', async () => {
      const { wrapper, context } = await mountManager([buildTask({ id: 'a', subtasks })]);

      await button(card(wrapper, 'a'), 'Concluir').trigger('click');
      await flushPromises();

      expect(wrapper.find('[role="dialog"], [role="alertdialog"], dialog').exists()).toBe(false);
      expect(context.repository.tasks[0]).toMatchObject({ status: 'DONE', subtasks });
    });

    it('marcar a última subtarefa não conclui a tarefa', async () => {
      const { wrapper, context } = await mountManager([
        buildTask({ id: 'a', status: 'IN_PROGRESS', subtasks }),
      ]);
      await expand(wrapper, 'a');

      await checkbox(wrapper, 'a', 's-2').trigger('click');
      await flushPromises();

      expect(context.repository.tasks[0]?.status).toBe('IN_PROGRESS');
      expect(context.repository.tasks[0]?.completedAt).toBeUndefined();
      expect(card(wrapper, 'a').get('[data-test="status"]').text()).toBe('Em andamento');
    });

    it('pesquisa encontra a tarefa pelo título de uma subtarefa', async () => {
      const { wrapper } = await mountManager([
        buildTask({ id: 'a', title: 'Preparar reunião', subtasks }),
        buildTask({ id: 'b', title: 'Outra' }),
      ]);

      await filterField(wrapper, 'Pesquisar').setValue('sala');
      await flushPromises();

      expect(visibleTitles(wrapper)).toEqual(['Preparar reunião']);
    });
  });

  describe('cancelamento de ocorrência recorrente', () => {
    function series() {
      return buildTask({
        id: 'serie',
        title: 'Enviar relatório',
        dueAt: hoursFrom(FIXED_NOW, 48),
        seriesId: 'serie-1',
        recurrence: { frequency: 'WEEKLY', weekdays: [3] },
        reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 60 }],
      });
    }

    function dialog(wrapper: VueWrapper) {
      return wrapper.get('[role="alertdialog"]');
    }

    it('pular pelo botão cancela a ocorrência e gera a próxima', async () => {
      const { wrapper, context } = await mountManager([series()]);
      const changeStatus = vi.spyOn(context.service, 'changeStatus');

      await button(card(wrapper, 'serie'), 'Cancelar tarefa').trigger('click');
      expect(dialog(wrapper).text()).toContain('pular esta ocorrência ou encerrar a série');
      expect(changeStatus).not.toHaveBeenCalled();

      await button(dialog(wrapper), 'Pular esta ocorrência').trigger('click');
      await flushPromises();

      expect(changeStatus).toHaveBeenCalledWith('serie', 'CANCELLED', 'SKIP');
      expect(context.repository.tasks.find((task) => task.id === 'serie')?.status).toBe(
        'CANCELLED',
      );
      expect(context.repository.tasks).toHaveLength(2);
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    });

    it('encerrar pelo botão cancela a ocorrência sem gerar a próxima', async () => {
      const { wrapper, context } = await mountManager([series()]);

      await button(card(wrapper, 'serie'), 'Cancelar tarefa').trigger('click');
      await button(dialog(wrapper), 'Encerrar a série').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toHaveLength(1);
      expect(context.repository.tasks[0]).toMatchObject({
        id: 'serie',
        status: 'CANCELLED',
        seriesId: 'serie-1',
      });
      expect(context.repository.tasks[0]?.recurrence).toBeUndefined();
    });

    it('abandonar pelo botão não altera a tarefa e devolve o foco ao botão', async () => {
      const { wrapper, context } = await mountManager([series()]);

      await button(card(wrapper, 'serie'), 'Cancelar tarefa').trigger('click');
      await button(dialog(wrapper), 'Cancelar').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toEqual([series()]);
      expect(document.activeElement).toBe(
        button(card(wrapper, 'serie'), 'Cancelar tarefa').element,
      );
    });

    it('Enter no seletor pede confirmação sem persistir', async () => {
      const { wrapper, context } = await mountManager([series()]);
      const select = card(wrapper, 'serie').get('select');

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('CANCELLED');
      await select.trigger('keydown', { key: 'Enter' });
      await flushPromises();

      expect(context.repository.tasks).toEqual([series()]);
      expect(dialog(wrapper).text()).toContain('pular esta ocorrência ou encerrar a série');

      await button(dialog(wrapper), 'Pular esta ocorrência').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toHaveLength(2);
      expect(context.repository.tasks.find((task) => task.id === 'serie')?.status).toBe(
        'CANCELLED',
      );
    });

    it('escolha por ponteiro pede confirmação sem persistir', async () => {
      const { wrapper, context } = await mountManager([series()]);

      await card(wrapper, 'serie').get('select').setValue('CANCELLED');
      await flushPromises();

      expect(context.repository.tasks).toEqual([series()]);
      expect(dialog(wrapper).text()).toContain('pular esta ocorrência ou encerrar a série');

      await button(dialog(wrapper), 'Encerrar a série').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toHaveLength(1);
      expect(context.repository.tasks[0]).toMatchObject({ status: 'CANCELLED', seriesId: 'serie-1' });
    });

    it('sair do seletor não cancela a ocorrência e restaura o status persistido', async () => {
      const { wrapper, context } = await mountManager([series()]);
      const select = card(wrapper, 'serie').get('select');

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('CANCELLED');
      await select.trigger('focusout');
      await flushPromises();

      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
      expect(context.repository.tasks).toEqual([series()]);
      expect((select.element as HTMLSelectElement).value).toBe('TODO');
    });

    it('abandonar a confirmação do seletor devolve o foco ao próprio seletor', async () => {
      const { wrapper, context } = await mountManager([series()]);
      const select = card(wrapper, 'serie').get('select');

      await select.trigger('keydown', { key: 'ArrowDown' });
      await select.setValue('CANCELLED');
      await select.trigger('keydown', { key: 'Enter' });
      await flushPromises();

      await button(dialog(wrapper), 'Cancelar').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toEqual([series()]);
      expect(document.activeElement).toBe(card(wrapper, 'serie').get('select').element);
      expect((select.element as HTMLSelectElement).value).toBe('TODO');
    });

    it('pular leva o foco para Reabrir do mesmo cartão', async () => {
      const { wrapper } = await mountManager([series()]);

      await button(card(wrapper, 'serie'), 'Cancelar tarefa').trigger('click');
      await button(dialog(wrapper), 'Pular esta ocorrência').trigger('click');
      await flushPromises();

      expect(document.activeElement).toBe(button(card(wrapper, 'serie'), 'Reabrir').element);
    });

    it('cancela diretamente a ocorrência de série já encerrada', async () => {
      const terminal = buildTask({
        id: 'terminal',
        title: 'Ocorrência antiga',
        dueAt: hoursFrom(FIXED_NOW, 48),
        seriesId: 'serie-1',
      });
      const { wrapper, context } = await mountManager([terminal]);

      await button(card(wrapper, 'terminal'), 'Cancelar tarefa').trigger('click');
      await flushPromises();

      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
      expect(context.repository.tasks[0]?.status).toBe('CANCELLED');
    });

    it('cancelar pelo formulário pede confirmação e permite pular', async () => {
      const { wrapper, context } = await mountManager([series()]);

      await button(card(wrapper, 'serie'), 'Editar').trigger('click');
      await wrapper.get('[name="status"]').setValue('CANCELLED');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      expect(dialog(wrapper).text()).toContain('pular esta ocorrência ou encerrar a série');
      expect(context.repository.tasks).toEqual([series()]);

      await button(dialog(wrapper), 'Pular esta ocorrência').trigger('click');
      await flushPromises();

      expect(context.repository.tasks.find((task) => task.id === 'serie')?.status).toBe(
        'CANCELLED',
      );
      expect(context.repository.tasks).toHaveLength(2);
      expect(wrapper.find('form').exists()).toBe(false);
    });

    it('cancelar pelo formulário permite encerrar a série', async () => {
      const { wrapper, context } = await mountManager([series()]);

      await button(card(wrapper, 'serie'), 'Editar').trigger('click');
      await wrapper.get('[name="status"]').setValue('CANCELLED');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      await button(dialog(wrapper), 'Encerrar a série').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toHaveLength(1);
      expect(context.repository.tasks[0]).toMatchObject({
        status: 'CANCELLED',
        seriesId: 'serie-1',
      });
      expect(context.repository.tasks[0]?.recurrence).toBeUndefined();
      expect(wrapper.text()).toContain('Alterações salvas.');
    });

    it('abandonar a confirmação do formulário mantém o formulário sem gravar', async () => {
      const { wrapper, context } = await mountManager([series()]);

      await button(card(wrapper, 'serie'), 'Editar').trigger('click');
      await wrapper.get('[name="status"]').setValue('CANCELLED');
      await wrapper.get('form').trigger('submit');
      await flushPromises();

      await button(dialog(wrapper), 'Cancelar').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toEqual([series()]);
      expect(wrapper.find('form').exists()).toBe(true);
      expect((wrapper.get('[name="status"]').element as HTMLSelectElement).value).toBe('CANCELLED');
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
      context.repository.failNext.moveToTrash = new Error('falhou');
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
      expect(dialog.text()).toContain('“A” irá para a lixeira');
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

  describe('desfazer', () => {
    const active = buildTask({ id: 'ativa', title: 'Ativa', status: 'IN_PROGRESS' });
    const other = buildTask({ id: 'outra', title: 'Outra' });

    function undoButton(root: VueWrapper) {
      return root.findAll('button').find((candidate) => candidate.text() === 'Desfazer');
    }

    function liveText(root: VueWrapper): string {
      return root.get('.live-region').text();
    }

    function series() {
      return buildTask({
        id: 'serie',
        title: 'Enviar relatório',
        dueAt: hoursFrom(FIXED_NOW, 48),
        seriesId: 'serie-1',
        recurrence: { frequency: 'WEEKLY', weekdays: [3] },
      });
    }

    describe('oferta', () => {
      it('aparece logo após a região de mensagens depois de excluir', async () => {
        const { wrapper } = await mountManager([active]);

        await button(card(wrapper, 'ativa'), 'Excluir').trigger('click');
        await button(wrapper.get('[role="alertdialog"]'), 'Excluir').trigger('click');
        await flushPromises();

        expect(liveText(wrapper)).toBe('Tarefa “Ativa” movida para a lixeira.');
        const undo = undoButton(wrapper);
        expect(undo).toBeDefined();
        expect(wrapper.get('.live-region').element.contains(undo!.element)).toBe(false);
        expect(wrapper.get('.live-region').element.nextElementSibling?.contains(undo!.element)).toBe(
          true,
        );
      });

      it.each(['Concluir', 'Cancelar'])('aparece depois de %s pelas ações rápidas', async (label) => {
        const { wrapper } = await mountManager([active]);

        await button(card(wrapper, 'ativa'), label).trigger('click');
        await flushPromises();

        expect(undoButton(wrapper)).toBeDefined();
      });

      it('aparece depois de alterar o status pelo seletor', async () => {
        const { wrapper } = await mountManager([active]);

        await card(wrapper, 'ativa').get('select').setValue('TODO');
        await flushPromises();

        expect(undoButton(wrapper)).toBeDefined();
      });

      it.each(['Pular esta ocorrência', 'Encerrar a série'])(
        'aparece depois de %s pelo diálogo da série',
        async (choice) => {
          const { wrapper } = await mountManager([series()]);

          await button(card(wrapper, 'serie'), 'Cancelar tarefa').trigger('click');
          await button(wrapper.get('[role="alertdialog"]'), choice).trigger('click');
          await flushPromises();

          expect(undoButton(wrapper)).toBeDefined();
        },
      );

      it('aparece depois de salvar uma edição', async () => {
        const { wrapper } = await mountManager([active]);

        await button(card(wrapper, 'ativa'), 'Editar').trigger('click');
        await wrapper.get('[name="title"]').setValue('Editada');
        await wrapper.get('form').trigger('submit');
        await flushPromises();

        expect(wrapper.text()).toContain('Alterações salvas.');
        expect(undoButton(wrapper)).toBeDefined();
      });

      it('não aparece ao criar tarefa', async () => {
        const { wrapper } = await mountManager([active]);

        await button(wrapper, 'Nova tarefa').trigger('click');
        await wrapper.get('[name="title"]').setValue('Nova');
        await wrapper.get('form').trigger('submit');
        await flushPromises();

        expect(wrapper.text()).toContain('Tarefa criada.');
        expect(undoButton(wrapper)).toBeUndefined();
      });

      it('não aparece ao marcar subtarefa e some da ação anterior', async () => {
        const { wrapper } = await mountManager([
          { ...active, subtasks: [{ id: 's-1', title: 'Passo', done: false }] },
        ]);
        await button(card(wrapper, 'ativa'), 'Concluir').trigger('click');
        await flushPromises();
        expect(undoButton(wrapper)).toBeDefined();

        await card(wrapper, 'ativa').get('[data-action="subtasks"]').trigger('click');
        (card(wrapper, 'ativa').get('[data-subtask-id="s-1"]').element as HTMLInputElement).click();
        await flushPromises();

        expect(undoButton(wrapper)).toBeUndefined();
      });

      it('é substituída pela ação seguinte', async () => {
        const { wrapper, context } = await mountManager([active, other]);

        await button(card(wrapper, 'ativa'), 'Concluir').trigger('click');
        await flushPromises();
        await button(card(wrapper, 'outra'), 'Concluir').trigger('click');
        await flushPromises();
        await undoButton(wrapper)!.trigger('click');
        await flushPromises();

        expect(context.repository.tasks.find((task) => task.id === 'ativa')?.status).toBe('DONE');
        expect(context.repository.tasks.find((task) => task.id === 'outra')?.status).toBe('TODO');
      });

      it.each([
        ['o formulário', 'Nova tarefa', 'Cancelar'],
        ['o backup', 'Backup', 'Voltar'],
        ['a lixeira', 'Lixeira', 'Voltar'],
      ])('some ao abrir %s', async (_label, open, back) => {
        const { wrapper } = await mountManager([active]);
        await button(card(wrapper, 'ativa'), 'Concluir').trigger('click');
        await flushPromises();
        expect(undoButton(wrapper)).toBeDefined();

        await button(wrapper, open).trigger('click');
        await flushPromises();
        await button(wrapper, back).trigger('click');
        await flushPromises();

        expect(wrapper.find('[data-task-id="ativa"]').exists()).toBe(true);
        expect(undoButton(wrapper)).toBeUndefined();
      });

      it('não expira com o passar do tempo', async () => {
        const { wrapper } = await mountManager([active]);
        await button(card(wrapper, 'ativa'), 'Concluir').trigger('click');
        await flushPromises();

        vi.setSystemTime(new Date(FIXED_NOW.getTime() + 30 * 60_000));
        await flushPromises();

        expect(undoButton(wrapper)).toBeDefined();
      });

      it('não move o foco ao ser apresentada', async () => {
        const { wrapper } = await mountManager([active]);
        const complete = button(card(wrapper, 'ativa'), 'Concluir');
        complete.element.focus();

        await complete.trigger('click');
        await flushPromises();

        expect(undoButton(wrapper)).toBeDefined();
        expect(document.activeElement).toBe(button(card(wrapper, 'ativa'), 'Reabrir').element);
      });
    });

    describe('acionamento', () => {
      it('desfaz, anuncia o resultado e foca Editar do cartão visível', async () => {
        const { wrapper, context } = await mountManager([active]);
        await button(card(wrapper, 'ativa'), 'Concluir').trigger('click');
        await flushPromises();
        const undo = undoButton(wrapper)!;
        undo.element.focus();

        await undo.trigger('click');
        await flushPromises();

        expect(context.repository.tasks[0]).toMatchObject({ status: 'IN_PROGRESS' });
        expect(context.repository.tasks[0]?.completedAt).toBeUndefined();
        expect(liveText(wrapper)).toBe('Ação desfeita em “Ativa”.');
        expect(undoButton(wrapper)).toBeUndefined();
        expect(document.activeElement).toBe(button(card(wrapper, 'ativa'), 'Editar').element);
      });

      it('desfaz a exclusão devolvendo a tarefa à listagem', async () => {
        const { wrapper, context } = await mountManager([active]);
        await button(card(wrapper, 'ativa'), 'Excluir').trigger('click');
        await button(wrapper.get('[role="alertdialog"]'), 'Excluir').trigger('click');
        await flushPromises();

        await undoButton(wrapper)!.trigger('click');
        await flushPromises();

        expect(visibleTitles(wrapper)).toEqual(['Ativa']);
        expect(context.repository.trash).toEqual([]);
        expect(document.activeElement).toBe(button(card(wrapper, 'ativa'), 'Editar').element);
      });

      it('foca a ação principal do estado quando o filtro oculta o cartão', async () => {
        const { wrapper } = await mountManager([active]);
        await button(card(wrapper, 'ativa'), 'Concluir').trigger('click');
        await flushPromises();
        await filterField(wrapper, 'Status').setValue('DONE');

        await undoButton(wrapper)!.trigger('click');
        await flushPromises();

        expect(wrapper.find('[data-task-id="ativa"]').exists()).toBe(false);
        expect(document.activeElement).toBe(
          button(wrapper.get('section.state'), 'Limpar filtros').element,
        );
      });

      it('informa a recusa por alteração concorrente sem gravar e mantém o foco com destino', async () => {
        const { wrapper, context } = await mountManager([active]);
        await button(card(wrapper, 'ativa'), 'Concluir').trigger('click');
        await flushPromises();
        const edited = {
          ...context.repository.tasks[0]!,
          title: 'Editada em outro painel',
          updatedAt: '2026-09-13T12:05:00.000Z',
        };
        context.repository.replaceExternally([edited]);
        await flushPromises();

        await undoButton(wrapper)!.trigger('click');
        await flushPromises();

        expect(liveText(wrapper)).toBe(
          'A ação não foi desfeita. A tarefa foi alterada depois da ação.',
        );
        expect(context.repository.tasks).toEqual([edited]);
        expect(undoButton(wrapper)).toBeUndefined();
        expect(document.activeElement).toBe(button(card(wrapper, 'ativa'), 'Editar').element);
      });

      it('informa falha de gravação sem alterar os dados', async () => {
        const { wrapper, context } = await mountManager([active]);
        await button(card(wrapper, 'ativa'), 'Concluir').trigger('click');
        await flushPromises();
        context.repository.failNext.revertConditionally = new TaskStorageError(
          'UNAVAILABLE',
          'Tente mais tarde.',
        );

        await undoButton(wrapper)!.trigger('click');
        await flushPromises();

        expect(liveText(wrapper)).toBe('A ação não foi desfeita. Tente mais tarde.');
        expect(context.repository.tasks[0]?.status).toBe('DONE');
        expect(document.activeElement).not.toBe(document.body);
      });

      it('indica processamento e ignora acionamentos repetidos', async () => {
        const { wrapper, context } = await mountManager([active]);
        await button(card(wrapper, 'ativa'), 'Concluir').trigger('click');
        await flushPromises();
        const original = context.service.undo;
        let release: () => void = () => undefined;
        const undo = vi.spyOn(context.service, 'undo').mockImplementation(async (plan) => {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return original(plan);
        });

        const offer = undoButton(wrapper)!;
        offer.element.focus();
        await offer.trigger('click');
        await offer.trigger('click');

        expect(offer.attributes('aria-disabled')).toBe('true');
        expect(offer.attributes('disabled')).toBeUndefined();
        expect(document.activeElement).toBe(offer.element);

        release();
        await flushPromises();

        expect(undo).toHaveBeenCalledTimes(1);
        expect(context.repository.tasks[0]?.status).toBe('IN_PROGRESS');
      });
    });
  });

  describe('lixeira', () => {
    it('abre pelo cabeçalho e volta à listagem com o foco em Lixeira', async () => {
      const { wrapper } = await mountManager([buildTask()]);

      await button(wrapper, 'Lixeira').trigger('click');
      await flushPromises();

      expect(wrapper.get('h1').text()).toBe('Lixeira');
      expect(wrapper.text()).not.toContain('Nova tarefa');

      await button(wrapper, 'Voltar').trigger('click');
      await flushPromises();

      expect(visibleTitles(wrapper)).toEqual(['Revisar proposta']);
      expect(document.activeElement).toBe(button(wrapper, 'Lixeira').element);
    });

    it('oferece abrir a lixeira no estado de lista vazia', async () => {
      const { wrapper } = await mountManager([]);

      await button(wrapper.get('section.state'), 'Abrir lixeira').trigger('click');
      await flushPromises();

      expect(wrapper.get('h1').text()).toBe('Lixeira');
      expect(wrapper.text()).toContain('A lixeira está vazia');
    });

    it('limpa mensagens e a oferta de desfazer ao abrir', async () => {
      const { wrapper } = await mountManager([buildTask()]);
      await button(card(wrapper, 'task-1'), 'Concluir').trigger('click');
      await flushPromises();

      await button(wrapper, 'Lixeira').trigger('click');
      await flushPromises();

      expect(wrapper.text()).not.toContain('alterado para');
      expect(wrapper.findAll('button').some((candidate) => candidate.text() === 'Desfazer')).toBe(
        false,
      );
    });
  });

  describe('bloco de atalhos', () => {
    async function mountWithShortcuts(tasks: Task[] = []) {
      const context = createTaskTestContext(tasks);
      const reader = new FakeKeyboardShortcutsReader();
      wrapper = mount(TaskManager, {
        global: {
          ...context.global,
          provide: { ...context.global.provide, [shortcutsReaderKey as symbol]: reader },
        },
        attachTo: document.body,
      });
      await flushPromises();
      return { wrapper, reader };
    }

    it('apresenta os atalhos ao fim da listagem, sem substituí-la', async () => {
      const { wrapper } = await mountWithShortcuts([buildTask()]);
      const hint = wrapper.get('.shortcuts-hint');

      expect(visibleTitles(wrapper)).toEqual(['Revisar proposta']);
      expect(hint.text()).toContain('Ctrl+Shift+L');
      expect(hint.element.compareDocumentPosition(wrapper.get('ul').element)).toBe(
        Node.DOCUMENT_POSITION_PRECEDING,
      );
    });

    it('não acrescenta botão ao cabeçalho nem novo modo de navegação', async () => {
      const { wrapper } = await mountWithShortcuts([buildTask()]);

      expect(
        wrapper
          .get('.header-actions')
          .findAll('button')
          .map((candidate) => candidate.text()),
      ).toEqual(['Lixeira', 'Backup', 'Nova tarefa']);
    });

    it('recolhe o bloco fora da listagem', async () => {
      const { wrapper } = await mountWithShortcuts([buildTask()]);
      await button(wrapper, 'Nova tarefa').trigger('click');
      await flushPromises();

      expect(wrapper.find('.shortcuts-hint').exists()).toBe(false);
    });
  });
});
