import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TaskStorageError } from '@/application/task-repository';
import type { Task } from '@/domain/task';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { TASKS_STORAGE_KEY } from '@/infrastructure/storage/stored-task-collection';
import { buildTask } from '../support/task-fixtures';

async function storedValue(): Promise<unknown> {
  return (await fakeBrowser.storage.local.get(TASKS_STORAGE_KEY))[TASKS_STORAGE_KEY];
}

describe('ChromeTaskRepository', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  describe('persistência e recuperação', () => {
    it('retorna coleção vazia quando não há dados salvos', async () => {
      await expect(new ChromeTaskRepository().list()).resolves.toEqual([]);
    });

    it('salva no envelope versionado e recupera em uma nova instância', async () => {
      const task = buildTask({
        dueAt: '2026-09-20T10:00:00.000Z',
        reminders: [{ id: 'r', offsetMinutes: 15 }],
        tags: ['casa'],
      });

      await new ChromeTaskRepository().save(task);

      expect(await storedValue()).toEqual({ schemaVersion: 1, tasks: [task] });
      await expect(new ChromeTaskRepository().list()).resolves.toEqual([task]);
      await expect(new ChromeTaskRepository().get(task.id)).resolves.toEqual(task);
    });

    it('substitui tarefa existente sem duplicá-la e preserva a ordem', async () => {
      const repository = new ChromeTaskRepository();
      await repository.save(buildTask({ id: 'a' }));
      await repository.save(buildTask({ id: 'b' }));

      await repository.save(buildTask({ id: 'a', title: 'Atualizada' }));

      const tasks = await repository.list();
      expect(tasks.map((task) => [task.id, task.title])).toEqual([
        ['a', 'Atualizada'],
        ['b', 'Revisar proposta'],
      ]);
    });

    it('serializa escritas concorrentes da mesma instância', async () => {
      const repository = new ChromeTaskRepository();

      await Promise.all([
        repository.save(buildTask({ id: 'a' })),
        repository.save(buildTask({ id: 'b' })),
        repository.save(buildTask({ id: 'c' })),
      ]);

      expect((await repository.list()).map((task) => task.id)).toEqual(['a', 'b', 'c']);
    });

    it('exclui somente a tarefa informada', async () => {
      const repository = new ChromeTaskRepository();
      await repository.save(buildTask({ id: 'a' }));
      await repository.save(buildTask({ id: 'b' }));

      await repository.delete('a');

      await expect(repository.list()).resolves.toEqual([buildTask({ id: 'b' })]);
      await expect(repository.get('a')).resolves.toBeUndefined();
    });
  });

  describe('normalização segura', () => {
    it('completa listas ausentes e descarta propriedades desconhecidas', async () => {
      await fakeBrowser.storage.local.set({
        [TASKS_STORAGE_KEY]: {
          schemaVersion: 1,
          tasks: [
            {
              id: 'a',
              title: 'Legado',
              status: 'TODO',
              priority: 'LOW',
              createdAt: '2026-09-01T00:00:00.000Z',
              updatedAt: '2026-09-01T00:00:00.000Z',
              extra: 'ignorado',
            },
          ],
        },
      });

      await expect(new ChromeTaskRepository().list()).resolves.toEqual([
        {
          id: 'a',
          title: 'Legado',
          status: 'TODO',
          priority: 'LOW',
          reminders: [],
          tags: [],
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ]);
    });
  });

  describe('assinatura de mudanças', () => {
    it('notifica assinantes com a coleção atualizada por outra superfície', async () => {
      const listener = vi.fn<(tasks: Task[]) => void>();
      const unsubscribe = new ChromeTaskRepository().subscribe(listener);
      const task = buildTask({ id: 'externa' });

      await new ChromeTaskRepository().save(task);

      expect(listener).toHaveBeenCalledWith([task]);
      unsubscribe();
    });

    it('ignora outras chaves e áreas de armazenamento', async () => {
      const listener = vi.fn();
      const unsubscribe = new ChromeTaskRepository().subscribe(listener);

      await fakeBrowser.storage.local.set({ outraChave: 1 });
      await fakeBrowser.storage.session.set({
        [TASKS_STORAGE_KEY]: { schemaVersion: 1, tasks: [] },
      });

      expect(listener).not.toHaveBeenCalled();
      unsubscribe();
    });

    it('notifica coleção vazia quando os dados são removidos', async () => {
      const repository = new ChromeTaskRepository();
      await repository.save(buildTask());
      const listener = vi.fn();
      const unsubscribe = repository.subscribe(listener);

      await fakeBrowser.storage.local.remove(TASKS_STORAGE_KEY);

      expect(listener).toHaveBeenCalledWith([]);
      unsubscribe();
    });

    it('para de notificar após cancelar a inscrição', async () => {
      const listener = vi.fn();
      const unsubscribe = new ChromeTaskRepository().subscribe(listener);

      unsubscribe();
      await new ChromeTaskRepository().save(buildTask());

      expect(listener).not.toHaveBeenCalled();
    });

    it('informa erro quando a alteração recebida é incompatível', async () => {
      const onChange = vi.fn();
      const onError = vi.fn<(error: TaskStorageError) => void>();
      const unsubscribe = new ChromeTaskRepository().subscribe(onChange, onError);

      await fakeBrowser.storage.local.set({
        [TASKS_STORAGE_KEY]: { schemaVersion: 99, tasks: [] },
      });

      expect(onChange).not.toHaveBeenCalled();
      expect(onError.mock.calls[0]?.[0].reason).toBe('INCOMPATIBLE_DATA');
      unsubscribe();
    });
  });

  describe('falhas e dados incompatíveis', () => {
    const incompatibleValues: [string, unknown][] = [
      ['versão futura', { schemaVersion: 2, tasks: [] }],
      ['envelope sem versão', { tasks: [] }],
      ['coleção que não é lista', { schemaVersion: 1, tasks: {} }],
      ['valor primitivo', 'tarefas'],
      ['lista sem envelope', [buildTask()]],
      [
        'status desconhecido',
        { schemaVersion: 1, tasks: [{ ...buildTask(), status: 'ARCHIVED' }] },
      ],
      ['data inválida', { schemaVersion: 1, tasks: [{ ...buildTask(), createdAt: 'ontem' }] }],
      ['tarefa sem título', { schemaVersion: 1, tasks: [{ ...buildTask(), title: undefined }] }],
      [
        'lembrete inválido',
        {
          schemaVersion: 1,
          tasks: [{ ...buildTask(), reminders: [{ id: 'r', offsetMinutes: '15' }] }],
        },
      ],
      ['tag inválida', { schemaVersion: 1, tasks: [{ ...buildTask(), tags: [1] }] }],
    ];

    it.each(incompatibleValues)('rejeita leitura de %s', async (_label, value) => {
      await fakeBrowser.storage.local.set({ [TASKS_STORAGE_KEY]: value });

      const error = await new ChromeTaskRepository().list().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TaskStorageError);
      expect((error as TaskStorageError).reason).toBe('INCOMPATIBLE_DATA');
    });

    it('não sobrescreve dados incompatíveis ao salvar ou excluir', async () => {
      const original = { schemaVersion: 2, tasks: [{ futuro: true }] };
      await fakeBrowser.storage.local.set({ [TASKS_STORAGE_KEY]: original });
      const repository = new ChromeTaskRepository();

      await expect(repository.save(buildTask())).rejects.toMatchObject({
        reason: 'INCOMPATIBLE_DATA',
      });
      await expect(repository.delete('task-1')).rejects.toMatchObject({
        reason: 'INCOMPATIBLE_DATA',
      });

      expect(await storedValue()).toEqual(original);
    });

    it('informa indisponibilidade quando a leitura da API falha', async () => {
      vi.spyOn(fakeBrowser.storage.local, 'get').mockRejectedValueOnce(new Error('quota'));

      await expect(new ChromeTaskRepository().list()).rejects.toMatchObject({
        name: 'TaskStorageError',
        reason: 'UNAVAILABLE',
      });
    });

    it('rejeita a escrita quando a API falha e preserva os dados anteriores', async () => {
      const repository = new ChromeTaskRepository();
      const previous = buildTask({ id: 'anterior' });
      await repository.save(previous);
      vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));

      await expect(repository.save(buildTask({ id: 'nova' }))).rejects.toMatchObject({
        reason: 'UNAVAILABLE',
      });

      await expect(repository.list()).resolves.toEqual([previous]);
    });

    it('continua aceitando escritas após uma falha anterior', async () => {
      const repository = new ChromeTaskRepository();
      vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));

      await expect(repository.save(buildTask({ id: 'a' }))).rejects.toThrow();
      await repository.save(buildTask({ id: 'b' }));

      expect((await repository.list()).map((task) => task.id)).toEqual(['b']);
    });
  });
});
