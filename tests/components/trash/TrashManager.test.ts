import { flushPromises, mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskStorageError } from '@/application/task-repository';
import TrashManager from '@/components/trash/TrashManager.vue';
import { formatDateTime } from '@/components/tasks/date-time';
import type { Task } from '@/domain/task';
import type { TrashItem } from '@/domain/task-trash';
import { createTaskTestContext } from '../../support/task-app';
import { buildTask, FIXED_NOW, hoursFrom } from '../../support/task-fixtures';

type Context = ReturnType<typeof createTaskTestContext>;
type Scope = Omit<DOMWrapper<Element>, 'exists'>;

const DAY_MS = 24 * 60 * 60 * 1000;

let wrapper: VueWrapper | undefined;

function daysAgo(days: number): string {
  return new Date(FIXED_NOW.getTime() - days * DAY_MS).toISOString();
}

function item(id: string, title: string, days: number, overrides: Partial<Task> = {}): TrashItem {
  return { deletedAt: daysAgo(days), task: buildTask({ id, title, ...overrides }) };
}

async function mountTrash(
  trash: TrashItem[],
  tasks: Task[] = [],
  prepare?: (context: Context) => void,
) {
  const context = createTaskTestContext(tasks);
  context.repository.trash = structuredClone(trash);
  prepare?.(context);
  wrapper = mount(TrashManager, { global: context.global, attachTo: document.body });
  await flushPromises();
  return { context, wrapper };
}

function button(root: Pick<Scope, 'findAll'>, label: string) {
  const found = root.findAll('button').find((candidate) => candidate.text() === label);
  if (!found) throw new Error(`Botão "${label}" não encontrado`);
  return found;
}

function entry(root: VueWrapper, id: string) {
  return root.get(`[data-trash-task-id="${id}"]`);
}

function titles(root: VueWrapper): string[] {
  return root.findAll('.trash-item h2').map((title) => title.text());
}

function dialog(root: VueWrapper) {
  return root.get('[role="alertdialog"]');
}

describe('TrashManager', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = undefined;
    vi.useRealTimers();
  });

  describe('apresentação', () => {
    it('lista do mais recente para o mais antigo com título e data local da exclusão', async () => {
      const { wrapper } = await mountTrash([
        item('antiga', 'Antiga', 5),
        item('recente', 'Recente', 1),
        item('meio', 'Meio', 3),
      ]);

      expect(wrapper.get('h1').text()).toBe('Lixeira');
      expect(document.activeElement).toBe(wrapper.get('h1').element);
      expect(titles(wrapper)).toEqual(['Recente', 'Meio', 'Antiga']);
      expect(entry(wrapper, 'recente').text()).toContain(
        `Excluída em ${formatDateTime(daysAgo(1))}`,
      );
      expect(button(entry(wrapper, 'meio'), 'Restaurar').exists()).toBe(true);
      expect(button(entry(wrapper, 'meio'), 'Excluir definitivamente').exists()).toBe(true);
      expect(button(wrapper, 'Esvaziar lixeira').exists()).toBe(true);
    });

    it('não apresenta item vencido e o descarta do armazenamento', async () => {
      const { wrapper, context } = await mountTrash([
        item('vencida', 'Vencida', 31),
        item('valida', 'Válida', 29),
      ]);

      expect(titles(wrapper)).toEqual(['Válida']);
      expect(context.repository.trash.map((entry) => entry.task.id)).toEqual(['valida']);
    });

    it('apresenta estado vazio com o prazo de 30 dias e sem esvaziar', async () => {
      const { wrapper } = await mountTrash([]);

      expect(wrapper.text()).toContain('A lixeira está vazia');
      expect(wrapper.text()).toContain('Tarefas excluídas ficam disponíveis aqui por 30 dias.');
      expect(wrapper.findAll('button').map((candidate) => candidate.text())).toEqual(['Voltar']);
    });

    it('informa lixeira incompatível sem oferecer ações', async () => {
      const { wrapper } = await mountTrash([item('a', 'A', 1)], [], ({ repository }) => {
        repository.failNext.listTrash = new TaskStorageError('INCOMPATIBLE_DATA', 'incompatível');
      });

      expect(wrapper.get('[role="alert"]').text()).toContain(
        'A lixeira não pôde ser lida porque está em um formato incompatível. Os dados foram preservados',
      );
      expect(wrapper.findAll('button').map((candidate) => candidate.text())).toEqual(['Voltar']);
    });

    it('atualiza a lista quando outra superfície altera a lixeira', async () => {
      const { wrapper, context } = await mountTrash([item('a', 'A', 2)]);

      context.repository.replaceTrashExternally([item('a', 'A', 2), item('b', 'Nova', 0)]);
      await flushPromises();

      expect(titles(wrapper)).toEqual(['Nova', 'A']);
    });

    it('emite close ao voltar', async () => {
      const { wrapper } = await mountTrash([]);

      await button(wrapper, 'Voltar').trigger('click');

      expect(wrapper.emitted('close')).toHaveLength(1);
    });
  });

  describe('restaurar', () => {
    it('devolve a tarefa à coleção, remove o item e informa', async () => {
      const deleted = item('a', 'Pagar aluguel', 1, {
        subtasks: [{ id: 's', title: 'Transferir', done: false }],
      });
      const { wrapper, context } = await mountTrash([deleted, item('b', 'B', 2)]);

      await button(entry(wrapper, 'a'), 'Restaurar').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toEqual([deleted.task]);
      expect(titles(wrapper)).toEqual(['B']);
      expect(wrapper.get('.live-region').text()).toBe('Tarefa “Pagar aluguel” restaurada.');
    });

    it('informa lembretes pendentes quando o agendamento falha', async () => {
      const { wrapper, context } = await mountTrash([
        item('a', 'Com lembrete', 1, {
          dueAt: hoursFrom(FIXED_NOW, 48),
          reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }],
        }),
      ]);
      context.scheduler.failNext = true;

      await button(entry(wrapper, 'a'), 'Restaurar').trigger('click');
      await flushPromises();

      expect(context.repository.tasks).toHaveLength(1);
      expect(wrapper.get('.live-region').text()).toContain(
        'Tarefa “Com lembrete” restaurada, mas os lembretes ficaram pendentes.',
      );
    });

    it('recusa quando o identificador já existe e mantém o item na lixeira', async () => {
      const existing = buildTask({ id: 'a', title: 'Restaurada pelo backup' });
      const { wrapper, context } = await mountTrash([item('a', 'Antiga', 1)], [existing]);

      await button(entry(wrapper, 'a'), 'Restaurar').trigger('click');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe(
        'A tarefa “Antiga” não foi restaurada porque já existe na listagem. O item continua na lixeira.',
      );
      expect(context.repository.tasks).toEqual([existing]);
      expect(titles(wrapper)).toEqual(['Antiga']);
      expect(document.activeElement).toBe(button(entry(wrapper, 'a'), 'Restaurar').element);
    });

    it('informa falha de gravação e mantém o item na lixeira', async () => {
      const { wrapper, context } = await mountTrash([item('a', 'A', 1)], [], ({ repository }) => {
        repository.failNext.restoreFromTrash = new TaskStorageError(
          'INCOMPATIBLE_DATA',
          'Os dados salvos estão em um formato incompatível. Nada foi alterado para preservá-los.',
        );
      });

      await button(entry(wrapper, 'a'), 'Restaurar').trigger('click');
      await flushPromises();

      expect(wrapper.get('[role="alert"]').text()).toBe(
        'A tarefa “A” não foi restaurada. Os dados salvos estão em um formato incompatível. Nada foi alterado para preservá-los.',
      );
      expect(context.repository.tasks).toEqual([]);
      expect(titles(wrapper)).toEqual(['A']);
    });

    it('ignora acionamento repetido enquanto processa', async () => {
      const { wrapper, context } = await mountTrash([item('a', 'A', 1)]);
      const restore = vi.spyOn(context.service, 'restoreFromTrash');

      const target = button(entry(wrapper, 'a'), 'Restaurar');
      await target.trigger('click');
      await target.trigger('click');
      await flushPromises();

      expect(restore).toHaveBeenCalledTimes(1);
    });
  });

  describe('excluir definitivamente e esvaziar', () => {
    it('exclui definitivamente somente após confirmação', async () => {
      const { wrapper, context } = await mountTrash([item('a', 'A', 1), item('b', 'B', 2)]);

      await button(entry(wrapper, 'a'), 'Excluir definitivamente').trigger('click');
      expect(dialog(wrapper).text()).toContain('não pode ser desfeita');
      expect(context.repository.trash).toHaveLength(2);

      await button(dialog(wrapper), 'Excluir definitivamente').trigger('click');
      await flushPromises();

      expect(context.repository.trash.map((entry) => entry.task.id)).toEqual(['b']);
      expect(titles(wrapper)).toEqual(['B']);
      expect(wrapper.find('[role="alertdialog"]').exists()).toBe(false);
    });

    it('abandonar a exclusão definitiva mantém a lixeira e devolve o foco ao controle', async () => {
      const { wrapper, context } = await mountTrash([item('a', 'A', 1)]);
      const origin = button(entry(wrapper, 'a'), 'Excluir definitivamente');
      origin.element.focus();

      await origin.trigger('click');
      await flushPromises();
      await dialog(wrapper).trigger('keydown', { key: 'Escape' });
      await flushPromises();

      expect(context.repository.trash).toHaveLength(1);
      expect(document.activeElement).toBe(
        button(entry(wrapper, 'a'), 'Excluir definitivamente').element,
      );
    });

    it('esvazia após confirmação e apresenta o estado vazio', async () => {
      const { wrapper, context } = await mountTrash([item('a', 'A', 1), item('b', 'B', 2)]);

      await button(wrapper, 'Esvaziar lixeira').trigger('click');
      expect(dialog(wrapper).text()).toContain(
        'As 2 tarefas da lixeira serão excluídas definitivamente. Esta ação não pode ser desfeita.',
      );
      await button(dialog(wrapper), 'Esvaziar lixeira').trigger('click');
      await flushPromises();

      expect(context.repository.trash).toEqual([]);
      expect(wrapper.text()).toContain('A lixeira está vazia');
      expect(document.activeElement).toBe(button(wrapper, 'Voltar').element);
    });

    it('abandonar o esvaziamento mantém a lixeira e devolve o foco ao controle', async () => {
      const { wrapper, context } = await mountTrash([item('a', 'A', 1)]);
      const origin = button(wrapper, 'Esvaziar lixeira');
      origin.element.focus();

      await origin.trigger('click');
      await flushPromises();
      await button(dialog(wrapper), 'Cancelar').trigger('click');
      await flushPromises();

      expect(context.repository.trash).toHaveLength(1);
      expect(document.activeElement).toBe(button(wrapper, 'Esvaziar lixeira').element);
    });
  });

  describe('foco após ações pelo teclado', () => {
    const three = [item('a', 'A', 1), item('b', 'B', 2), item('c', 'C', 3)];

    it('restaurar item do meio foca Restaurar do item que ocupa a posição', async () => {
      const { wrapper } = await mountTrash(three);
      const target = button(entry(wrapper, 'b'), 'Restaurar');
      target.element.focus();

      await target.trigger('click');
      await flushPromises();

      expect(document.activeElement).toBe(button(entry(wrapper, 'c'), 'Restaurar').element);
    });

    it('excluir definitivamente o último item foca Restaurar do novo último', async () => {
      const { wrapper } = await mountTrash(three);

      await button(entry(wrapper, 'c'), 'Excluir definitivamente').trigger('click');
      await button(dialog(wrapper), 'Excluir definitivamente').trigger('click');
      await flushPromises();

      expect(document.activeElement).toBe(button(entry(wrapper, 'b'), 'Restaurar').element);
    });

    it('restaurar o item único foca a ação de voltar à listagem', async () => {
      const { wrapper } = await mountTrash([item('a', 'A', 1)]);

      await button(entry(wrapper, 'a'), 'Restaurar').trigger('click');
      await flushPromises();

      expect(wrapper.text()).toContain('A lixeira está vazia');
      expect(document.activeElement).toBe(button(wrapper, 'Voltar').element);
    });
  });
});
