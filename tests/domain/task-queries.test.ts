import { describe, expect, it } from 'vitest';
import {
  EMPTY_TASK_FILTERS,
  filterTasks,
  getDueSituation,
  matchesSearch,
  sortTasks,
} from '@/domain/task-queries';
import { buildTask, FIXED_NOW, hoursFrom } from '../support/task-fixtures';

describe('getDueSituation', () => {
  it.each([
    ['um milissegundo atrás', new Date(FIXED_NOW.getTime() - 1).toISOString(), 'OVERDUE'],
    ['exatamente agora', FIXED_NOW.toISOString(), 'DUE_SOON'],
    ['em 23 horas', hoursFrom(FIXED_NOW, 23), 'DUE_SOON'],
    ['em exatamente 24 horas', hoursFrom(FIXED_NOW, 24), 'DUE_SOON'],
    [
      '24 horas e 1 milissegundo',
      new Date(FIXED_NOW.getTime() + 86_400_001).toISOString(),
      undefined,
    ],
  ])('classifica prazo %s', (_label, dueAt, expected) => {
    expect(getDueSituation(buildTask({ dueAt }), FIXED_NOW)).toBe(expected);
  });

  it('classifica tarefas em andamento', () => {
    const task = buildTask({ status: 'IN_PROGRESS', dueAt: hoursFrom(FIXED_NOW, -2) });

    expect(getDueSituation(task, FIXED_NOW)).toBe('OVERDUE');
  });

  it('não classifica tarefa sem prazo', () => {
    expect(getDueSituation(buildTask(), FIXED_NOW)).toBeUndefined();
  });

  it.each(['DONE', 'CANCELLED'] as const)('não classifica tarefa %s', (status) => {
    expect(getDueSituation(buildTask({ status, dueAt: hoursFrom(FIXED_NOW, -5) }), FIXED_NOW)).toBe(
      undefined,
    );
    expect(getDueSituation(buildTask({ status, dueAt: hoursFrom(FIXED_NOW, 1) }), FIXED_NOW)).toBe(
      undefined,
    );
  });
});

describe('matchesSearch', () => {
  const task = buildTask({
    title: 'Preparar Apresentação',
    description: 'Slides do trimestre',
    requester: 'Carla Souza',
    assignee: 'Diego',
    tags: ['Financeiro'],
  });

  it.each(['apresentação', 'TRIMESTRE', 'carla', 'dieg', 'financeiro', '  slides '])(
    'encontra "%s" sem diferenciar caixa',
    (term) => {
      expect(matchesSearch(task, term)).toBe(true);
    },
  );

  it('não encontra termo ausente e aceita pesquisa vazia', () => {
    expect(matchesSearch(task, 'marketing')).toBe(false);
    expect(matchesSearch(task, '   ')).toBe(true);
  });

  it('encontra a tarefa pelo título de uma subtarefa', () => {
    const meeting = buildTask({
      title: 'Preparar reunião',
      subtasks: [
        { id: 's-1', title: 'Enviar pauta', done: true },
        { id: 's-2', title: 'Reservar Sala', done: false },
      ],
    });

    expect(matchesSearch(meeting, 'sala')).toBe(true);
    expect(matchesSearch(meeting, 'pauta')).toBe(true);
    expect(matchesSearch(meeting, 'projetor')).toBe(false);
  });
});

describe('filterTasks', () => {
  const tasks = [
    buildTask({ id: 'a', status: 'TODO', priority: 'HIGH', dueAt: hoursFrom(FIXED_NOW, -1) }),
    buildTask({ id: 'b', status: 'TODO', priority: 'HIGH', dueAt: hoursFrom(FIXED_NOW, 3) }),
    buildTask({
      id: 'c',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueAt: hoursFrom(FIXED_NOW, -1),
    }),
    buildTask({ id: 'd', status: 'TODO', priority: 'LOW', dueAt: hoursFrom(FIXED_NOW, -1) }),
    buildTask({ id: 'e', status: 'DONE', priority: 'HIGH', dueAt: hoursFrom(FIXED_NOW, -1) }),
    buildTask({ id: 'f', status: 'TODO', priority: 'HIGH', title: 'Outro assunto' }),
  ];

  const ids = (result: { id: string }[]) => result.map((task) => task.id);

  it('retorna todas as tarefas sem filtros ativos', () => {
    expect(ids(filterTasks(tasks, EMPTY_TASK_FILTERS, FIXED_NOW))).toEqual([
      'a',
      'b',
      'c',
      'd',
      'e',
      'f',
    ]);
  });

  it('combina status, prioridade e situação de prazo', () => {
    const result = filterTasks(
      tasks,
      { ...EMPTY_TASK_FILTERS, status: 'TODO', priority: 'HIGH', dueSituation: 'OVERDUE' },
      FIXED_NOW,
    );

    expect(ids(result)).toEqual(['a']);
  });

  it('filtra tarefas próximas do vencimento', () => {
    const result = filterTasks(
      tasks,
      { ...EMPTY_TASK_FILTERS, dueSituation: 'DUE_SOON' },
      FIXED_NOW,
    );

    expect(ids(result)).toEqual(['b']);
  });

  it('combina pesquisa com filtros', () => {
    const result = filterTasks(
      tasks,
      { ...EMPTY_TASK_FILTERS, search: 'outro', priority: 'HIGH' },
      FIXED_NOW,
    );

    expect(ids(result)).toEqual(['f']);
  });

  it('filtros de status, prioridade e prazo ignoram as marcações das subtarefas', () => {
    const allDone = [
      { id: 's-1', title: 'A', done: true },
      { id: 's-2', title: 'B', done: true },
    ];
    const pending = [{ id: 's-1', title: 'A', done: false }];
    const withSubtasks = [
      buildTask({
        id: 'todo-feita',
        status: 'TODO',
        priority: 'HIGH',
        dueAt: hoursFrom(FIXED_NOW, -1),
        subtasks: allDone,
      }),
      buildTask({
        id: 'done-pendente',
        status: 'DONE',
        priority: 'HIGH',
        dueAt: hoursFrom(FIXED_NOW, -1),
        subtasks: pending,
      }),
    ];

    expect(
      ids(
        filterTasks(
          withSubtasks,
          { ...EMPTY_TASK_FILTERS, status: 'TODO', priority: 'HIGH', dueSituation: 'OVERDUE' },
          FIXED_NOW,
        ),
      ),
    ).toEqual(['todo-feita']);
    expect(
      ids(filterTasks(withSubtasks, { ...EMPTY_TASK_FILTERS, status: 'DONE' }, FIXED_NOW)),
    ).toEqual(['done-pendente']);
  });
});

describe('sortTasks', () => {
  const ids = (result: { id: string }[]) => result.map((task) => task.id);

  it('ordena por prazo crescente, sem prazo por último e createdAt mais recente no empate', () => {
    const tasks = [
      buildTask({ id: 'sem-prazo-antiga', createdAt: '2026-09-01T00:00:00.000Z' }),
      buildTask({ id: 'depois', dueAt: hoursFrom(FIXED_NOW, 5) }),
      buildTask({ id: 'sem-prazo-nova', createdAt: '2026-09-05T00:00:00.000Z' }),
      buildTask({
        id: 'antes-antiga',
        dueAt: hoursFrom(FIXED_NOW, 1),
        createdAt: '2026-09-01T00:00:00.000Z',
      }),
      buildTask({
        id: 'antes-nova',
        dueAt: hoursFrom(FIXED_NOW, 1),
        createdAt: '2026-09-02T00:00:00.000Z',
      }),
    ];

    expect(ids(sortTasks(tasks, 'DUE_DATE'))).toEqual([
      'antes-nova',
      'antes-antiga',
      'depois',
      'sem-prazo-nova',
      'sem-prazo-antiga',
    ]);
  });

  it('ordena por prioridade URGENT, HIGH, MEDIUM, LOW com createdAt mais recente no empate', () => {
    const tasks = [
      buildTask({ id: 'low', priority: 'LOW' }),
      buildTask({ id: 'medium', priority: 'MEDIUM' }),
      buildTask({ id: 'high-antiga', priority: 'HIGH', createdAt: '2026-09-01T00:00:00.000Z' }),
      buildTask({ id: 'urgent', priority: 'URGENT' }),
      buildTask({ id: 'high-nova', priority: 'HIGH', createdAt: '2026-09-03T00:00:00.000Z' }),
    ];

    expect(ids(sortTasks(tasks, 'PRIORITY'))).toEqual([
      'urgent',
      'high-nova',
      'high-antiga',
      'medium',
      'low',
    ]);
  });

  it('agrupa por status TODO, IN_PROGRESS, DONE, CANCELLED com prazo no desempate', () => {
    const tasks = [
      buildTask({ id: 'cancelled', status: 'CANCELLED' }),
      buildTask({ id: 'done', status: 'DONE' }),
      buildTask({ id: 'todo-sem-prazo', status: 'TODO' }),
      buildTask({ id: 'progress', status: 'IN_PROGRESS' }),
      buildTask({ id: 'todo-tarde', status: 'TODO', dueAt: hoursFrom(FIXED_NOW, 10) }),
      buildTask({ id: 'todo-cedo', status: 'TODO', dueAt: hoursFrom(FIXED_NOW, 2) }),
    ];

    expect(ids(sortTasks(tasks, 'STATUS'))).toEqual([
      'todo-cedo',
      'todo-tarde',
      'todo-sem-prazo',
      'progress',
      'done',
      'cancelled',
    ]);
  });

  it('não modifica a coleção original', () => {
    const tasks = [
      buildTask({ id: 'b', priority: 'LOW' }),
      buildTask({ id: 'a', priority: 'URGENT' }),
    ];

    sortTasks(tasks, 'PRIORITY');

    expect(ids(tasks)).toEqual(['b', 'a']);
  });
});
