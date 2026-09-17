import { describe, expect, it } from 'vitest';
import {
  buildSubtasks,
  countSubtaskProgress,
  MAX_SUBTASKS,
  resetSubtasks,
  setSubtaskDone,
  SUBTASK_TITLE_LIMIT,
  validateSubtaskDrafts,
  type Subtask,
} from '@/domain/task-subtasks';
import { buildTask, FIXED_NOW, hoursFrom, sequentialIds } from '../support/task-fixtures';

function subtask(id: string, title: string, done = false): Subtask {
  return { id, title, done };
}

describe('validateSubtaskDrafts', () => {
  it('aceita lista vazia sem erros', () => {
    expect(validateSubtaskDrafts([])).toEqual({ drafts: [] });
  });

  it('remove espaços nas extremidades do título e preserva identificadores', () => {
    expect(
      validateSubtaskDrafts([{ title: '  Reservar sala ' }, { id: 's-1', title: 'Pauta' }]),
    ).toEqual({ drafts: [{ title: 'Reservar sala' }, { id: 's-1', title: 'Pauta' }] });
  });

  it('exige título não vazio com erro na posição do item', () => {
    const result = validateSubtaskDrafts([{ title: 'A' }, { title: '   ' }]);

    expect(result.itemErrors).toEqual([undefined, 'Informe o título da subtarefa.']);
    expect(result.drafts).toEqual([{ title: 'A' }]);
  });

  it('aceita título no limite e recusa acima dele', () => {
    const result = validateSubtaskDrafts([
      { title: 'a'.repeat(SUBTASK_TITLE_LIMIT) },
      { title: ` ${'b'.repeat(SUBTASK_TITLE_LIMIT + 1)} ` },
    ]);

    expect(result.itemErrors).toEqual([
      undefined,
      'O título da subtarefa deve ter no máximo 200 caracteres.',
    ]);
  });

  it('recusa identificador vazio', () => {
    expect(validateSubtaskDrafts([{ id: ' ', title: 'A' }]).itemErrors).toEqual([
      'A subtarefa precisa de um identificador.',
    ]);
  });

  it('recusa identificador repetido', () => {
    expect(
      validateSubtaskDrafts([
        { id: 's-1', title: 'A' },
        { id: 's-1', title: 'B' },
      ]).itemErrors,
    ).toEqual([undefined, 'As subtarefas não podem repetir o identificador.']);
  });

  it('aceita o limite de itens e recusa acima dele', () => {
    const drafts = Array.from({ length: MAX_SUBTASKS }, (_, index) => ({ title: `Item ${index}` }));

    expect(validateSubtaskDrafts(drafts).listError).toBeUndefined();
    expect(validateSubtaskDrafts([...drafts, { title: 'Extra' }]).listError).toBe(
      'Informe no máximo 20 subtarefas.',
    );
  });
});

describe('buildSubtasks', () => {
  it('gera identificador e começa desmarcada para itens novos', () => {
    expect(buildSubtasks([{ title: 'A' }, { title: 'B' }], [], sequentialIds('s'))).toEqual([
      subtask('s-1', 'A'),
      subtask('s-2', 'B'),
    ]);
  });

  it('renomear mantém identificador e marcação', () => {
    expect(
      buildSubtasks(
        [{ id: 's-1', title: 'Enviar pauta revisada' }],
        [subtask('s-1', 'Enviar pauta', true)],
        sequentialIds('novo'),
      ),
    ).toEqual([subtask('s-1', 'Enviar pauta revisada', true)]);
  });

  it('remover mantém a ordem relativa e as marcações das demais', () => {
    const current = [subtask('a', 'A', true), subtask('b', 'B'), subtask('c', 'C', true)];

    expect(
      buildSubtasks(
        [
          { id: 'a', title: 'A' },
          { id: 'c', title: 'C' },
        ],
        current,
        sequentialIds(),
      ),
    ).toEqual([subtask('a', 'A', true), subtask('c', 'C', true)]);
  });

  it('reordenar segue a ordem do rascunho e acrescenta novos no fim', () => {
    const current = [subtask('a', 'A'), subtask('b', 'B', true)];

    expect(
      buildSubtasks(
        [{ id: 'b', title: 'B' }, { id: 'a', title: 'A' }, { title: 'C' }],
        current,
        sequentialIds('s'),
      ),
    ).toEqual([subtask('b', 'B', true), subtask('a', 'A'), subtask('s-1', 'C')]);
  });

  it('usa a marcação da tarefa atual, mesmo que o formulário a tenha exibido desmarcada', () => {
    const shownWhenOpened = [subtask('a', 'A', false)];
    const reread = [subtask('a', 'A', true)];

    expect(buildSubtasks(shownWhenOpened, reread, sequentialIds())).toEqual([
      subtask('a', 'A', true),
    ]);
  });

  it('item com identificador ausente na tarefa atual fica desmarcado', () => {
    expect(buildSubtasks([{ id: 'sumiu', title: 'A' }], [], sequentialIds())).toEqual([
      subtask('sumiu', 'A'),
    ]);
  });
});

describe('setSubtaskDone', () => {
  const dueAt = hoursFrom(FIXED_NOW, 4);
  const task = buildTask({
    status: 'IN_PROGRESS',
    dueAt,
    reminders: [{ id: 'r-1', type: 'OFFSET', offsetMinutes: 15 }],
    subtasks: [subtask('a', 'A', true), subtask('b', 'B'), subtask('c', 'C')],
  });

  it('marca somente o item e atualiza updatedAt sem mudar status, prazo nem lembretes', () => {
    const updated = setSubtaskDone(task, 'b', true, FIXED_NOW);

    expect(updated).toEqual({
      ...task,
      subtasks: [subtask('a', 'A', true), subtask('b', 'B', true), subtask('c', 'C')],
      updatedAt: FIXED_NOW.toISOString(),
    });
    expect(updated?.completedAt).toBeUndefined();
    expect(task.subtasks[1]?.done).toBe(false);
  });

  it('marcar o último item não conclui a tarefa', () => {
    const allDone = setSubtaskDone(
      setSubtaskDone(task, 'b', true, FIXED_NOW) as typeof task,
      'c',
      true,
      FIXED_NOW,
    );

    expect(allDone?.status).toBe('IN_PROGRESS');
    expect(allDone?.completedAt).toBeUndefined();
  });

  it('desmarca preservando a posição', () => {
    expect(setSubtaskDone(task, 'a', false, FIXED_NOW)?.subtasks.map((item) => item.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('devolve a mesma instância quando não há mudança', () => {
    expect(setSubtaskDone(task, 'a', true, FIXED_NOW)).toBe(task);
  });

  it('devolve undefined para subtarefa inexistente', () => {
    expect(setSubtaskDone(task, 'x', true, FIXED_NOW)).toBeUndefined();
  });

  it('preserva completedAt de tarefa concluída', () => {
    const done = buildTask({
      status: 'DONE',
      completedAt: '2026-09-10T10:00:00.000Z',
      subtasks: [subtask('a', 'A')],
    });

    expect(setSubtaskDone(done, 'a', true, FIXED_NOW)).toMatchObject({
      status: 'DONE',
      completedAt: '2026-09-10T10:00:00.000Z',
    });
  });
});

describe('countSubtaskProgress', () => {
  it('conta itens marcados e total', () => {
    expect(countSubtaskProgress([])).toEqual({ done: 0, total: 0 });
    expect(
      countSubtaskProgress([subtask('a', 'A', true), subtask('b', 'B'), subtask('c', 'C', true)]),
    ).toEqual({ done: 2, total: 3 });
  });
});

describe('resetSubtasks', () => {
  it('copia na mesma ordem, desmarcadas e com novos identificadores, sem alterar a origem', () => {
    const source = [subtask('a', 'A', true), subtask('b', 'B')];

    expect(resetSubtasks(source, sequentialIds('n'))).toEqual([
      subtask('n-1', 'A'),
      subtask('n-2', 'B'),
    ]);
    expect(source).toEqual([subtask('a', 'A', true), subtask('b', 'B')]);
  });
});
