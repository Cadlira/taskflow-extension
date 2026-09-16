import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TaskStorageError } from '@/application/task-repository';
import type { Task } from '@/domain/task';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { TASKS_STORAGE_KEY } from '@/infrastructure/storage/stored-task-collection';
import { buildTask, FIXED_NOW } from '../support/task-fixtures';

async function storedValue(): Promise<unknown> {
  return (await fakeBrowser.storage.local.get(TASKS_STORAGE_KEY))[TASKS_STORAGE_KEY];
}

describe('ChromeTaskRepository', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('persistência e recuperação', () => {
    it('retorna coleção vazia quando não há dados salvos', async () => {
      await expect(new ChromeTaskRepository().list()).resolves.toEqual([]);
    });

    it('salva no envelope versionado e recupera em uma nova instância', async () => {
      const task = buildTask({
        dueAt: '2026-09-20T10:00:00.000Z',
        reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }],
        tags: ['casa'],
      });

      await new ChromeTaskRepository().save(task);

      expect(await storedValue()).toEqual({ schemaVersion: 3, tasks: [task] });
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

  describe('substituição atômica', () => {
    it('grava a coleção inteira em uma única escrita no envelope versionado', async () => {
      const repository = new ChromeTaskRepository();
      const set = vi.spyOn(fakeBrowser.storage.local, 'set');
      const tasks = [buildTask({ id: 'a' }), buildTask({ id: 'b' })];

      await repository.replaceAll(tasks);

      expect(set).toHaveBeenCalledTimes(1);
      expect(set).toHaveBeenCalledWith({ [TASKS_STORAGE_KEY]: { schemaVersion: 3, tasks } });
      expect(await storedValue()).toEqual({ schemaVersion: 3, tasks });
    });

    it('substitui toda a coleção anterior, inclusive com lista vazia', async () => {
      const repository = new ChromeTaskRepository();
      await repository.save(buildTask({ id: 'a' }));
      await repository.save(buildTask({ id: 'b' }));

      await repository.replaceAll([buildTask({ id: 'c' })]);

      expect((await repository.list()).map((task) => task.id)).toEqual(['c']);

      await repository.replaceAll([]);

      await expect(repository.list()).resolves.toEqual([]);
    });

    it('notifica os assinantes com a coleção substituída', async () => {
      const listener = vi.fn<(tasks: Task[]) => void>();
      const unsubscribe = new ChromeTaskRepository().subscribe(listener);
      const task = buildTask({ id: 'nova' });

      await new ChromeTaskRepository().replaceAll([task]);

      expect(listener).toHaveBeenCalledWith([task]);
      unsubscribe();
    });

    it('recusa sem gravar quando os dados atuais são incompatíveis', async () => {
      const original = { schemaVersion: 4, tasks: [{ futuro: true }] };
      await fakeBrowser.storage.local.set({ [TASKS_STORAGE_KEY]: original });

      await expect(new ChromeTaskRepository().replaceAll([buildTask()])).rejects.toMatchObject({
        reason: 'INCOMPATIBLE_DATA',
      });

      expect(await storedValue()).toEqual(original);
    });

    it('mantém os dados anteriores quando a gravação falha', async () => {
      const repository = new ChromeTaskRepository();
      const previous = buildTask({ id: 'anterior' });
      await repository.save(previous);
      vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));

      await expect(repository.replaceAll([buildTask({ id: 'nova' })])).rejects.toMatchObject({
        reason: 'UNAVAILABLE',
      });

      await expect(repository.list()).resolves.toEqual([previous]);
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

  describe('migração da versão 1', () => {
    const DUE = '2026-09-20T10:00:00.000Z';

    it('migra lembretes preservando identificador e deslocamento e mantém pendente', async () => {
      await fakeBrowser.storage.local.set({
        [TASKS_STORAGE_KEY]: {
          schemaVersion: 1,
          tasks: [
            {
              ...buildTask({ dueAt: DUE }),
              reminders: [{ id: 'r', offsetMinutes: 15 }],
            },
          ],
        },
      });

      await expect(new ChromeTaskRepository().list()).resolves.toEqual([
        buildTask({
          dueAt: DUE,
          reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }],
        }),
      ]);
    });

    it('converte lastTriggeredFor no instante efetivo processado', async () => {
      await fakeBrowser.storage.local.set({
        [TASKS_STORAGE_KEY]: {
          schemaVersion: 1,
          tasks: [
            {
              ...buildTask({ dueAt: DUE }),
              reminders: [{ id: 'r', offsetMinutes: 1440, lastTriggeredFor: DUE }],
            },
          ],
        },
      });

      await expect(new ChromeTaskRepository().list()).resolves.toEqual([
        buildTask({
          dueAt: DUE,
          reminders: [
            {
              id: 'r',
              type: 'OFFSET',
              offsetMinutes: 1440,
              processedFor: '2026-09-19T10:00:00.000Z',
            },
          ],
        }),
      ]);
    });

    it('preserva qualquer deslocamento inteiro não negativo aceito pela versão 1', async () => {
      await fakeBrowser.storage.local.set({
        [TASKS_STORAGE_KEY]: {
          schemaVersion: 1,
          tasks: [
            {
              ...buildTask({ dueAt: DUE }),
              reminders: [{ id: 'r', offsetMinutes: 30 }],
            },
          ],
        },
      });

      await expect(new ChromeTaskRepository().list()).resolves.toEqual([
        buildTask({ dueAt: DUE, reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 30 }] }),
      ]);
    });

    it('grava o envelope v3 após uma edição sobre dados v1', async () => {
      await fakeBrowser.storage.local.set({
        [TASKS_STORAGE_KEY]: {
          schemaVersion: 1,
          tasks: [
            {
              ...buildTask({ id: 'a', dueAt: DUE }),
              reminders: [{ id: 'r', offsetMinutes: 15 }],
            },
          ],
        },
      });

      await new ChromeTaskRepository().save(buildTask({ id: 'b' }));

      expect(await storedValue()).toEqual({
        schemaVersion: 3,
        tasks: [
          buildTask({
            id: 'a',
            dueAt: DUE,
            reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }],
          }),
          buildTask({ id: 'b' }),
        ],
      });
    });
  });

  describe('migração da versão 2', () => {
    const DUE = '2026-09-20T10:00:00.000Z';

    it('lê coleção da versão 2 sem recorrência nem identificador de série', async () => {
      const task = buildTask({
        dueAt: DUE,
        reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }],
      });
      await fakeBrowser.storage.local.set({
        [TASKS_STORAGE_KEY]: { schemaVersion: 2, tasks: [task] },
      });

      await expect(new ChromeTaskRepository().list()).resolves.toEqual([task]);
    });

    it('grava o envelope v3 após uma edição sobre dados v2', async () => {
      const existing = buildTask({ id: 'a' });
      await fakeBrowser.storage.local.set({
        [TASKS_STORAGE_KEY]: { schemaVersion: 2, tasks: [existing] },
      });

      await new ChromeTaskRepository().save(buildTask({ id: 'b' }));

      expect(await storedValue()).toEqual({
        schemaVersion: 3,
        tasks: [existing, buildTask({ id: 'b' })],
      });
    });
  });

  describe('persistência da recorrência', () => {
    const DUE = '2026-09-20T10:00:00.000Z';
    const recurrence = { frequency: 'WEEKLY' as const, weekdays: [1, 4] };

    it('lê e devolve a regra e a série persistidas na versão 3', async () => {
      const task = buildTask({
        dueAt: DUE,
        seriesId: 'serie-1',
        recurrence,
        reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 60 }],
      });
      await fakeBrowser.storage.local.set({
        [TASKS_STORAGE_KEY]: { schemaVersion: 3, tasks: [task] },
      });

      await expect(new ChromeTaskRepository().list()).resolves.toEqual([task]);
    });

    it('aceita duas ocorrências do mesmo série com apenas uma carregando a regra', async () => {
      const rule = buildTask({
        id: 'aberta',
        dueAt: DUE,
        seriesId: 'serie-1',
        recurrence,
      });
      const closed = buildTask({
        id: 'fechada',
        status: 'DONE',
        completedAt: DUE,
        dueAt: '2026-09-13T10:00:00.000Z',
        seriesId: 'serie-1',
      });
      await fakeBrowser.storage.local.set({
        [TASKS_STORAGE_KEY]: { schemaVersion: 3, tasks: [closed, rule] },
      });

      await expect(new ChromeTaskRepository().list()).resolves.toEqual([closed, rule]);
    });
  });

  describe('gravação múltipla', () => {
    it('insere e substitui tarefas em uma única escrita', async () => {
      const repository = new ChromeTaskRepository();
      await repository.save(buildTask({ id: 'a' }));
      const set = vi.spyOn(fakeBrowser.storage.local, 'set');

      await repository.saveMany([
        buildTask({ id: 'a', title: 'Atualizada' }),
        buildTask({ id: 'b' }),
      ]);

      expect(set).toHaveBeenCalledTimes(1);
      expect((await repository.list()).map((task) => [task.id, task.title])).toEqual([
        ['a', 'Atualizada'],
        ['b', 'Revisar proposta'],
      ]);
    });

    it('não persiste nenhuma das tarefas quando a gravação falha', async () => {
      const repository = new ChromeTaskRepository();
      const previous = buildTask({ id: 'anterior' });
      await repository.save(previous);
      vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));

      await expect(
        repository.saveMany([buildTask({ id: 'a' }), buildTask({ id: 'b' })]),
      ).rejects.toMatchObject({ reason: 'UNAVAILABLE' });

      await expect(repository.list()).resolves.toEqual([previous]);
    });
  });

  describe('claim condicional de ocorrência', () => {
    const DUE = '2026-09-20T10:00:00.000Z';
    const TRIGGER_AT = '2026-09-20T09:00:00.000Z';
    const task = buildTask({
      id: 'a',
      dueAt: DUE,
      reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 60 }],
    });

    it('registra a ocorrência pendente e resolve verdadeiro', async () => {
      const repository = new ChromeTaskRepository();
      await repository.save(task);

      await expect(
        repository.claimReminderOccurrence({
          taskId: 'a',
          reminderId: 'r',
          processedFor: TRIGGER_AT,
        }),
      ).resolves.toBe(true);

      await expect(repository.get('a')).resolves.toEqual({
        ...task,
        reminders: [
          { id: 'r', type: 'OFFSET', offsetMinutes: 60, processedFor: TRIGGER_AT },
        ],
      });
    });

    it('não grava e resolve falso para evento repetido', async () => {
      const repository = new ChromeTaskRepository();
      await repository.save(task);
      const claim = { taskId: 'a', reminderId: 'r', processedFor: TRIGGER_AT };

      await repository.claimReminderOccurrence(claim);
      const before = await storedValue();

      await expect(repository.claimReminderOccurrence(claim)).resolves.toBe(false);
      expect(await storedValue()).toEqual(before);
    });

    it('não grava quando a edição concorrente alterou o instante efetivo', async () => {
      const repository = new ChromeTaskRepository();
      await repository.save({
        ...task,
        reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 30 }],
      });

      await expect(
        repository.claimReminderOccurrence({
          taskId: 'a',
          reminderId: 'r',
          processedFor: TRIGGER_AT,
        }),
      ).resolves.toBe(false);

      await expect(repository.get('a')).resolves.toEqual({
        ...task,
        reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 30 }],
      });
    });

    it.each([
      ['tarefa inexistente', 'inexistente'],
      ['tarefa terminal', 'a'],
    ])('não grava para %s', async (_label, taskId) => {
      const repository = new ChromeTaskRepository();
      await repository.save({
        ...task,
        status: 'DONE',
        completedAt: FIXED_NOW.toISOString(),
      });

      await expect(
        repository.claimReminderOccurrence({
          taskId,
          reminderId: 'r',
          processedFor: TRIGGER_AT,
        }),
      ).resolves.toBe(false);
    });

    it('propaga falha de gravação sem alterar os dados', async () => {
      const repository = new ChromeTaskRepository();
      await repository.save(task);
      vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('quota'));

      await expect(
        repository.claimReminderOccurrence({
          taskId: 'a',
          reminderId: 'r',
          processedFor: TRIGGER_AT,
        }),
      ).rejects.toMatchObject({ reason: 'UNAVAILABLE' });

      await expect(repository.get('a')).resolves.toEqual(task);
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
    const DUE_AT = '2026-09-20T10:00:00.000Z';

    const incompatibleValues: [string, unknown][] = [
      ['versão futura', { schemaVersion: 4, tasks: [] }],
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
      [
        'identificador de tarefa repetido',
        {
          schemaVersion: 2,
          tasks: [buildTask({ id: 'a' }), buildTask({ id: 'a', title: 'Duplicada' })],
        },
      ],
      [
        'mais de dez lembretes',
        {
          schemaVersion: 2,
          tasks: [
            buildTask({
              dueAt: DUE_AT,
              reminders: Array.from({ length: 11 }, (_, index) => ({
                id: `r${index}`,
                type: 'OFFSET',
                offsetMinutes: index * 5,
              })),
            }),
          ],
        },
      ],
      [
        'lembrete sem prazo',
        {
          schemaVersion: 2,
          tasks: [
            buildTask({ reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 15 }] }),
          ],
        },
      ],
      [
        'identificador de lembrete repetido',
        {
          schemaVersion: 2,
          tasks: [
            buildTask({
              dueAt: DUE_AT,
              reminders: [
                { id: 'r', type: 'OFFSET', offsetMinutes: 15 },
                { id: 'r', type: 'OFFSET', offsetMinutes: 60 },
              ],
            }),
          ],
        },
      ],
      [
        'instante efetivo repetido',
        {
          schemaVersion: 2,
          tasks: [
            buildTask({
              dueAt: DUE_AT,
              reminders: [
                { id: 'r1', type: 'OFFSET', offsetMinutes: 15 },
                { id: 'r2', type: 'OFFSET', offsetMinutes: 15 },
              ],
            }),
          ],
        },
      ],
      [
        'horário absoluto posterior ao prazo',
        {
          schemaVersion: 2,
          tasks: [
            buildTask({
              dueAt: DUE_AT,
              reminders: [
                { id: 'r', type: 'AT', at: '2026-09-20T11:00:00.000Z' },
              ],
            }),
          ],
        },
      ],
      [
        'deslocamento não seguro',
        {
          schemaVersion: 2,
          tasks: [
            buildTask({
              dueAt: DUE_AT,
              reminders: [
                { id: 'r', type: 'OFFSET', offsetMinutes: Number.MAX_SAFE_INTEGER + 1 },
              ],
            }),
          ],
        },
      ],
      [
        'instante efetivo fora do intervalo de datas',
        {
          schemaVersion: 2,
          tasks: [
            buildTask({
              dueAt: DUE_AT,
              reminders: [
                { id: 'r', type: 'OFFSET', offsetMinutes: Number.MAX_SAFE_INTEGER },
              ],
            }),
          ],
        },
      ],
      [
        'recorrência com frequência desconhecida',
        {
          schemaVersion: 3,
          tasks: [
            {
              ...buildTask({ dueAt: DUE_AT, seriesId: 'serie-1' }),
              recurrence: { frequency: 'YEARLY', intervalDays: 1 } as never,
            },
          ],
        },
      ],
      [
        'recorrência com intervalo diário fora do limite',
        {
          schemaVersion: 3,
          tasks: [
            {
              ...buildTask({ dueAt: DUE_AT, seriesId: 'serie-1' }),
              recurrence: { frequency: 'DAILY', intervalDays: 0 },
            },
          ],
        },
      ],
      [
        'recorrência com dia da semana repetido',
        {
          schemaVersion: 3,
          tasks: [
            {
              ...buildTask({ dueAt: DUE_AT, seriesId: 'serie-1' }),
              recurrence: { frequency: 'WEEKLY', weekdays: [1, 1] },
            },
          ],
        },
      ],
      [
        'recorrência com instante limite inválido',
        {
          schemaVersion: 3,
          tasks: [
            {
              ...buildTask({ dueAt: DUE_AT, seriesId: 'serie-1' }),
              recurrence: { frequency: 'DAILY', intervalDays: 1, until: 'ontem' } as never,
            },
          ],
        },
      ],
      [
        'recorrência sem prazo',
        {
          schemaVersion: 3,
          tasks: [
            {
              ...buildTask({ seriesId: 'serie-1' }),
              recurrence: { frequency: 'DAILY', intervalDays: 1 },
            },
          ],
        },
      ],
      [
        'recorrência sem identificador de série',
        {
          schemaVersion: 3,
          tasks: [
            {
              ...buildTask({ dueAt: DUE_AT }),
              recurrence: { frequency: 'DAILY', intervalDays: 1 },
            },
          ],
        },
      ],
      [
        'recorrência com lembrete absoluto',
        {
          schemaVersion: 3,
          tasks: [
            {
              ...buildTask({
                dueAt: DUE_AT,
                seriesId: 'serie-1',
                reminders: [{ id: 'r', type: 'AT', at: DUE_AT }],
              }),
              recurrence: { frequency: 'DAILY', intervalDays: 1 },
            },
          ],
        },
      ],
      ['identificador de série vazio', { schemaVersion: 3, tasks: [buildTask({ seriesId: '' })] }],
    ];

    it.each(incompatibleValues)('rejeita leitura de %s', async (_label, value) => {
      await fakeBrowser.storage.local.set({ [TASKS_STORAGE_KEY]: value });

      const error = await new ChromeTaskRepository().list().catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(TaskStorageError);
      expect((error as TaskStorageError).reason).toBe('INCOMPATIBLE_DATA');
    });

    it('não sobrescreve dados incompatíveis ao salvar ou excluir', async () => {
      const original = { schemaVersion: 4, tasks: [{ futuro: true }] };
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

    it('não sobrescreve coleção v2 semanticamente inválida', async () => {
      const invalid = {
        schemaVersion: 2,
        tasks: [
          buildTask({
            dueAt: DUE_AT,
            reminders: [
              { id: 'r', type: 'OFFSET', offsetMinutes: 15 },
              { id: 'r', type: 'OFFSET', offsetMinutes: 60 },
            ],
          }),
        ],
      };
      await fakeBrowser.storage.local.set({ [TASKS_STORAGE_KEY]: invalid });
      const repository = new ChromeTaskRepository();

      await expect(repository.save(buildTask({ id: 'nova' }))).rejects.toMatchObject({
        reason: 'INCOMPATIBLE_DATA',
      });
      await expect(repository.replaceAll([])).rejects.toMatchObject({
        reason: 'INCOMPATIBLE_DATA',
      });
      await expect(repository.delete('task-1')).rejects.toMatchObject({
        reason: 'INCOMPATIBLE_DATA',
      });

      expect(await storedValue()).toEqual(invalid);
    });

    it('recusa migração v1 com instante não representável sem sobrescrever', async () => {
      const original = {
        schemaVersion: 1,
        tasks: [
          {
            ...buildTask({ dueAt: DUE_AT }),
            reminders: [{ id: 'r', offsetMinutes: Number.MAX_SAFE_INTEGER }],
          },
        ],
      };
      await fakeBrowser.storage.local.set({ [TASKS_STORAGE_KEY]: original });

      await expect(new ChromeTaskRepository().list()).rejects.toMatchObject({
        reason: 'INCOMPATIBLE_DATA',
      });
      await expect(new ChromeTaskRepository().save(buildTask({ id: 'nova' }))).rejects.toMatchObject(
        {
          reason: 'INCOMPATIBLE_DATA',
        },
      );

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
