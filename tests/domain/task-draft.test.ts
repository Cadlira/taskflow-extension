import { describe, expect, it } from 'vitest';
import { createTask, TASK_LIMITS, updateTask, validateTaskDraft } from '@/domain/task-draft';
import { buildTask, FIXED_NOW, hoursFrom, sequentialIds } from '../support/task-fixtures';

const UUID = '3f2b8c1e-6a4d-4f7e-9b2a-1c5d8e9f0a7b';

function context(ids: () => string = () => UUID) {
  return { now: FIXED_NOW, generateId: ids };
}

describe('createTask', () => {
  it('gera identidade e auditoria sem completedAt, usando valores padrão', () => {
    const result = createTask({ title: '  Enviar relatório  ' }, context());

    expect(result).toEqual({
      ok: true,
      value: {
        id: UUID,
        title: 'Enviar relatório',
        status: 'TODO',
        priority: 'MEDIUM',
        reminders: [],
        tags: [],
        createdAt: FIXED_NOW.toISOString(),
        updatedAt: FIXED_NOW.toISOString(),
      },
    });
  });

  it('aceita todos os campos opcionais e normaliza texto, prazo, lembretes e URL', () => {
    const at = '2026-09-14T15:30:00-03:00';
    const result = createTask(
      {
        title: 'Planejar sprint',
        description: '  Definir metas  ',
        requester: ' Ana ',
        assignee: ' Bruno ',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        dueAt: '2026-09-14T18:30:00-03:00',
        reminders: [
          { type: 'OFFSET', offsetMinutes: 60 },
          { type: 'AT', at },
        ],
        tags: ['Trabalho'],
        sourceUrl: 'https://example.com/tarefa',
      },
      context(sequentialIds()),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toMatchObject({
      id: 'id-1',
      description: 'Definir metas',
      requester: 'Ana',
      assignee: 'Bruno',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      dueAt: '2026-09-14T21:30:00.000Z',
      reminders: [
        { id: 'id-2', type: 'OFFSET', offsetMinutes: 60 },
        { id: 'id-3', type: 'AT', at: '2026-09-14T18:30:00.000Z' },
      ],
      tags: ['Trabalho'],
      sourceUrl: 'https://example.com/tarefa',
    });
    expect(result.value.completedAt).toBeUndefined();
  });

  it('omite campos opcionais vazios', () => {
    const result = createTask(
      { title: 'Tarefa', description: '   ', requester: '', dueAt: '', sourceUrl: ' ' },
      context(),
    );

    expect(result.ok && Object.keys(result.value).sort()).toEqual(
      ['createdAt', 'id', 'priority', 'reminders', 'status', 'tags', 'title', 'updatedAt'].sort(),
    );
  });

  it('registra completedAt quando criada diretamente como concluída', () => {
    const result = createTask({ title: 'Feita', status: 'DONE' }, context());

    expect(result.ok && result.value.completedAt).toBe(FIXED_NOW.toISOString());
  });

  it('rejeita lembrete novo cujo instante efetivo já passou', () => {
    const result = createTask(
      {
        title: 'Atrasada',
        dueAt: hoursFrom(FIXED_NOW, 1),
        reminders: [{ type: 'OFFSET', offsetMinutes: 120 }],
      },
      context(),
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.reminderItems).toEqual(['O horário do lembrete já passou.']);
    }
  });
});

describe('validateTaskDraft', () => {
  it('rejeita título composto somente por espaços', () => {
    const result = validateTaskDraft({ title: '    ' });

    expect(result).toEqual({ ok: false, errors: { title: 'Informe um título.' } });
  });

  it.each([
    ['title', { title: 'a'.repeat(TASK_LIMITS.title + 1) }],
    ['description', { title: 'ok', description: 'a'.repeat(TASK_LIMITS.description + 1) }],
    ['requester', { title: 'ok', requester: 'a'.repeat(TASK_LIMITS.person + 1) }],
    ['assignee', { title: 'ok', assignee: 'a'.repeat(TASK_LIMITS.person + 1) }],
    ['tags', { title: 'ok', tags: ['a'.repeat(TASK_LIMITS.tag + 1)] }],
    ['tags', { title: 'ok', tags: Array.from({ length: 11 }, (_, index) => `tag${index}`) }],
  ] as const)('identifica o campo %s quando excede o limite', (field, draft) => {
    const result = validateTaskDraft(draft);

    expect(result.ok).toBe(false);
    expect(!result.ok && Object.keys(result.errors)).toEqual([field]);
  });

  it('aceita campos exatamente no limite', () => {
    const result = validateTaskDraft({
      title: 'a'.repeat(TASK_LIMITS.title),
      description: 'a'.repeat(TASK_LIMITS.description),
      requester: 'a'.repeat(TASK_LIMITS.person),
      assignee: 'a'.repeat(TASK_LIMITS.person),
      tags: Array.from({ length: TASK_LIMITS.tags }, (_, index) => `${index}`.padEnd(30, 'x')),
    });

    expect(result.ok).toBe(true);
  });

  it('normaliza tags que diferem por caixa ou espaços para uma única ocorrência', () => {
    const result = validateTaskDraft({
      title: 'ok',
      tags: [' Trabalho', 'trabalho ', 'TRABALHO', '', 'Casa'],
    });

    expect(result.ok && result.value.tags).toEqual(['Trabalho', 'Casa']);
  });

  it('conta o limite de tags após remover duplicadas', () => {
    const tags = Array.from({ length: 10 }, (_, index) => `tag${index}`);
    const result = validateTaskDraft({ title: 'ok', tags: [...tags, 'TAG0', ' tag1 '] });

    expect(result.ok).toBe(true);
  });

  it.each(['ftp://example.com', 'javascript:alert(1)', 'example.com', 'http//quebrada'])(
    'rejeita URL de origem %s',
    (sourceUrl) => {
      const result = validateTaskDraft({ title: 'ok', sourceUrl });

      expect(result.ok).toBe(false);
      expect(!result.ok && result.errors.sourceUrl).toContain('URL válida');
    },
  );

  it.each(['http://example.com', 'https://example.com/a?b=c'])('aceita URL %s', (sourceUrl) => {
    expect(validateTaskDraft({ title: 'ok', sourceUrl }).ok).toBe(true);
  });

  it('rejeita data inválida', () => {
    const result = validateTaskDraft({ title: 'ok', dueAt: '2026-13-45T99:00' });

    expect(!result.ok && result.errors.dueAt).toBe('Informe uma data e hora válidas.');
  });

  it('rejeita status e prioridade fora dos valores permitidos', () => {
    const result = validateTaskDraft({
      title: 'ok',
      status: 'ARCHIVED' as never,
      priority: 'CRITICAL' as never,
    });

    expect(!result.ok && Object.keys(result.errors).sort()).toEqual(['priority', 'status']);
  });

  describe('lembretes', () => {
    const dueAt = hoursFrom(FIXED_NOW, 48);

    function itemErrors(draft: Parameters<typeof validateTaskDraft>[0]): unknown {
      const result = validateTaskDraft(draft, { now: FIXED_NOW });

      expect(result.ok).toBe(false);
      return !result.ok ? result.errors.reminderItems : undefined;
    }

    it('rejeita lembretes sem prazo', () => {
      const result = validateTaskDraft({ title: 'ok', reminders: [{ type: 'OFFSET', offsetMinutes: 15 }] });

      expect(!result.ok && result.errors.reminders).toBe('Lembretes exigem um prazo.');
    });

    it('rejeita mais de dez lembretes distintos', () => {
      const reminders = Array.from({ length: 11 }, (_, index) => ({
        type: 'OFFSET' as const,
        offsetMinutes: index * 5,
      }));
      const result = validateTaskDraft({ title: 'ok', dueAt, reminders });

      expect(!result.ok && result.errors.reminders).toBe('Informe no máximo 10 lembretes distintos.');
    });

    it.each([
      ['negativo', -5],
      ['fracionário', 1.5],
      ['fora do intervalo seguro', Number.MAX_SAFE_INTEGER + 1],
    ])('rejeita deslocamento %s', (_label, offsetMinutes) => {
      expect(
        itemErrors({ title: 'ok', dueAt, reminders: [{ type: 'OFFSET', offsetMinutes }] }),
      ).toEqual(['Informe um deslocamento em minutos inteiro e não negativo.']);
    });

    it('rejeita deslocamento seguro que produz instante fora do intervalo de datas', () => {
      expect(
        itemErrors({
          title: 'ok',
          dueAt,
          reminders: [{ type: 'OFFSET', offsetMinutes: Number.MAX_SAFE_INTEGER }],
        }),
      ).toEqual(['O horário do lembrete está fora do intervalo de datas suportado.']);
    });

    it('rejeita horário absoluto posterior ao prazo', () => {
      expect(
        itemErrors({
          title: 'ok',
          dueAt,
          reminders: [{ type: 'AT', at: hoursFrom(new Date(dueAt), 1) }],
        }),
      ).toEqual(['O lembrete deve ocorrer até o prazo.']);
    });

    it('rejeita horário absoluto inválido', () => {
      expect(
        itemErrors({ title: 'ok', dueAt, reminders: [{ type: 'AT', at: 'ontem' }] }),
      ).toEqual(['Informe uma data e hora válidas.']);
    });

    it('rejeita lembretes com o mesmo instante efetivo, ainda que de tipos diferentes', () => {
      expect(
        itemErrors({
          title: 'ok',
          dueAt,
          reminders: [
            { type: 'OFFSET', offsetMinutes: 60 },
            { type: 'AT', at: new Date(Date.parse(dueAt) - 60 * 60_000).toISOString() },
          ],
        }),
      ).toEqual([undefined, 'Os horários dos lembretes não podem se repetir.']);
    });

    it('rejeita identificador de lembrete repetido', () => {
      expect(
        itemErrors({
          title: 'ok',
          dueAt,
          reminders: [
            { id: 'r', type: 'OFFSET', offsetMinutes: 15 },
            { id: 'r', type: 'OFFSET', offsetMinutes: 60 },
          ],
        }),
      ).toEqual([undefined, 'Os lembretes não podem repetir o identificador.']);
    });

    it('normaliza horário absoluto para ISO canônico', () => {
      const result = validateTaskDraft({
        title: 'ok',
        dueAt,
        reminders: [{ type: 'AT', at: '2026-09-14T15:30:00-03:00' }],
      });

      expect(result.ok && result.value.reminders).toEqual([
        { type: 'AT', at: '2026-09-14T18:30:00.000Z' },
      ]);
    });

    it('aceita itens mantidos mesmo que o instante efetivo já tenha passado', () => {
      const reminder = { id: 'r', type: 'OFFSET' as const, offsetMinutes: 60 };
      const result = validateTaskDraft(
        { title: 'ok', dueAt: hoursFrom(FIXED_NOW, 1), reminders: [reminder] },
        { now: FIXED_NOW, existing: [{ ...reminder, processedFor: '2026-01-01T00:00:00.000Z' }] },
      );

      expect(result.ok).toBe(true);
    });

    it('rejeita item alterado que já venceu mesmo quando o identificador é preservado', () => {
      const result = validateTaskDraft(
        {
          title: 'ok',
          dueAt: hoursFrom(FIXED_NOW, 1),
          reminders: [{ id: 'r', type: 'OFFSET', offsetMinutes: 120 }],
        },
        { now: FIXED_NOW, existing: [{ id: 'r', type: 'OFFSET', offsetMinutes: 60 }] },
      );

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.reminderItems).toEqual(['O horário do lembrete já passou.']);
      }
    });
  });
});

describe('updateTask', () => {
  const later = new Date('2026-09-13T13:00:00.000Z');
  const dueAt = '2026-09-20T10:00:00.000Z';

  it('preserva identidade e criação, substitui campos editáveis e atualiza updatedAt', () => {
    const task = buildTask({ description: 'Antiga', tags: ['velha'] });

    const result = updateTask(
      task,
      { title: 'Novo título', priority: 'URGENT', tags: ['nova'] },
      { now: later, generateId: sequentialIds() },
    );

    expect(result).toEqual({
      ok: true,
      value: {
        id: task.id,
        title: 'Novo título',
        status: 'TODO',
        priority: 'URGENT',
        reminders: [],
        tags: ['nova'],
        createdAt: task.createdAt,
        updatedAt: later.toISOString(),
      },
    });
  });

  it('mantém prioridade atual quando não informada', () => {
    const task = buildTask({ priority: 'LOW' });

    const result = updateTask(task, { title: 'x' }, { now: later, generateId: sequentialIds() });

    expect(result.ok && result.value.priority).toBe('LOW');
  });

  it('preserva identidade e ocorrência processada dos lembretes mantidos', () => {
    const task = buildTask({
      dueAt,
      reminders: [
        { id: 'r-15', type: 'OFFSET', offsetMinutes: 15, processedFor: dueAt },
        { id: 'r-60', type: 'OFFSET', offsetMinutes: 60 },
      ],
    });

    const result = updateTask(
      task,
      {
        title: task.title,
        dueAt,
        reminders: [
          { id: 'r-15', type: 'OFFSET', offsetMinutes: 15 },
          { id: 'r-60', type: 'OFFSET', offsetMinutes: 60 },
          { type: 'OFFSET', offsetMinutes: 1440 },
        ],
      },
      { now: later, generateId: sequentialIds('novo') },
    );

    expect(result.ok && result.value.reminders).toEqual([
      { id: 'r-15', type: 'OFFSET', offsetMinutes: 15, processedFor: dueAt },
      { id: 'r-60', type: 'OFFSET', offsetMinutes: 60 },
      { id: 'novo-1', type: 'OFFSET', offsetMinutes: 1440 },
    ]);
  });

  it('remove lembrete desmarcado', () => {
    const task = buildTask({
      dueAt,
      reminders: [
        { id: 'r-15', type: 'OFFSET', offsetMinutes: 15 },
        { id: 'r-60', type: 'OFFSET', offsetMinutes: 60 },
      ],
    });

    const result = updateTask(
      task,
      { title: task.title, dueAt, reminders: [{ id: 'r-60', type: 'OFFSET', offsetMinutes: 60 }] },
      { now: later, generateId: sequentialIds() },
    );

    expect(result.ok && result.value.reminders).toEqual([
      { id: 'r-60', type: 'OFFSET', offsetMinutes: 60 },
    ]);
  });

  it('aplica regras de conclusão e reabertura ao alterar status pelo formulário', () => {
    const task = buildTask();
    const completed = updateTask(
      task,
      { title: task.title, status: 'DONE' },
      { now: later, generateId: sequentialIds() },
    );
    expect(completed.ok && completed.value.completedAt).toBe(later.toISOString());

    if (!completed.ok) return;
    const reopened = updateTask(
      completed.value,
      { title: task.title, status: 'IN_PROGRESS' },
      { now: later, generateId: sequentialIds() },
    );
    expect(reopened.ok && reopened.value.status).toBe('IN_PROGRESS');
    expect(reopened.ok && 'completedAt' in reopened.value).toBe(false);
  });

  it('não altera a tarefa quando a validação falha', () => {
    const task = buildTask();

    const result = updateTask(task, { title: '' }, { now: later, generateId: sequentialIds() });

    expect(result.ok).toBe(false);
    expect(task).toEqual(buildTask());
  });
});
