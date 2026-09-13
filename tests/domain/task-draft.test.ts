import { describe, expect, it } from 'vitest';
import { createTask, TASK_LIMITS, updateTask, validateTaskDraft } from '@/domain/task-draft';
import { buildTask, FIXED_NOW, sequentialIds } from '../support/task-fixtures';

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

  it('aceita todos os campos opcionais e normaliza texto, prazo e URL', () => {
    const result = createTask(
      {
        title: 'Planejar sprint',
        description: '  Definir metas  ',
        requester: ' Ana ',
        assignee: ' Bruno ',
        priority: 'HIGH',
        status: 'IN_PROGRESS',
        dueAt: '2026-09-14T15:30:00-03:00',
        reminderOffsets: [60, 15],
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
      dueAt: '2026-09-14T18:30:00.000Z',
      reminders: [
        { id: 'id-2', offsetMinutes: 15 },
        { id: 'id-3', offsetMinutes: 60 },
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

  it('rejeita lembretes sem prazo', () => {
    const result = validateTaskDraft({ title: 'ok', reminderOffsets: [15] });

    expect(!result.ok && result.errors.reminders).toBe('Lembretes exigem um prazo.');
  });

  it('rejeita deslocamentos de lembrete não oferecidos', () => {
    const result = validateTaskDraft({
      title: 'ok',
      dueAt: '2026-09-20T10:00:00.000Z',
      reminderOffsets: [30],
    });

    expect(!result.ok && result.errors.reminders).toContain('opções de lembrete válidas');
  });
});

describe('updateTask', () => {
  const later = new Date('2026-09-13T13:00:00.000Z');

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
    const dueAt = '2026-09-20T10:00:00.000Z';
    const task = buildTask({
      dueAt,
      reminders: [
        { id: 'r-15', offsetMinutes: 15, lastTriggeredFor: dueAt },
        { id: 'r-60', offsetMinutes: 60 },
      ],
    });

    const result = updateTask(
      task,
      { title: task.title, dueAt, reminderOffsets: [15, 1440, 15] },
      { now: later, generateId: sequentialIds('novo') },
    );

    expect(result.ok && result.value.reminders).toEqual([
      { id: 'r-15', offsetMinutes: 15, lastTriggeredFor: dueAt },
      { id: 'novo-1', offsetMinutes: 1440 },
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
