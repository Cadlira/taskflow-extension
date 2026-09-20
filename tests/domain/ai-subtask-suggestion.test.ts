import { describe, expect, it } from 'vitest';
import {
  buildSubtaskSuggestionContent,
  buildSubtaskSuggestionProposal,
  parseSubtaskSuggestionLines,
  SUBTASK_SUGGESTION_DESCRIPTION_LIMIT,
} from '@/domain/ai-subtask-suggestion';
import { MAX_SUBTASKS, SUBTASK_TITLE_LIMIT } from '@/domain/task-subtasks';
import { buildTask } from '../support/task-fixtures';

describe('buildSubtaskSuggestionContent', () => {
  it('é determinística: a mesma entrada produz sempre a mesma string', () => {
    const first = buildSubtaskSuggestionContent('Preparar a demo', 'Roteiro e dados');
    const second = buildSubtaskSuggestionContent('Preparar a demo', 'Roteiro e dados');

    expect(first).toEqual(second);
    expect(first.content).toContain('Título: Preparar a demo');
    expect(first.content).toContain('Descrição:\nRoteiro e dados');
    expect(first.descriptionTruncated).toBe(false);
  });

  it('normaliza espaços em volta e quebras de linha do Windows', () => {
    const normalized = buildSubtaskSuggestionContent(
      '  Preparar a demo \n',
      '\r\nPrimeira linha\r\nSegunda linha\r\n',
    );

    expect(normalized.content).toContain('Título: Preparar a demo');
    expect(normalized.content).toContain('Descrição:\nPrimeira linha\nSegunda linha');
    expect(normalized.content).not.toContain('\r');
  });

  it('corta a descrição no limite e sinaliza o corte ao chamador', () => {
    const longDescription = 'a'.repeat(SUBTASK_SUGGESTION_DESCRIPTION_LIMIT + 50);

    const cut = buildSubtaskSuggestionContent('Preparar a demo', longDescription);

    expect(cut.descriptionTruncated).toBe(true);
    expect(cut.content).toContain('a'.repeat(SUBTASK_SUGGESTION_DESCRIPTION_LIMIT));
    expect(cut.content).not.toContain('a'.repeat(SUBTASK_SUGGESTION_DESCRIPTION_LIMIT + 1));
  });

  it('não sinaliza corte quando a descrição cabe exatamente no limite', () => {
    const exact = 'a'.repeat(SUBTASK_SUGGESTION_DESCRIPTION_LIMIT);

    expect(buildSubtaskSuggestionContent('Preparar a demo', exact).descriptionTruncated).toBe(
      false,
    );
  });

  it('omite qualquer marcador de descrição quando a tarefa não tem descrição', () => {
    const empty = buildSubtaskSuggestionContent('Preparar a demo', '   \n  ');

    expect(empty.content).not.toContain('Descrição');
    expect(empty.content).toContain('Título: Preparar a demo');
    expect(empty.content.trimEnd()).toBe(empty.content);
    expect(empty.descriptionTruncated).toBe(false);
  });

  it('transmite apenas o título, a descrição e as instruções fixas', () => {
    const task = buildTask({
      id: 'task-42',
      title: 'Preparar a demo',
      description: 'Roteiro e dados',
      requester: 'Ana Solicitante',
      assignee: 'Bruno Responsável',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      dueAt: '2026-10-01T12:00:00.000Z',
      tags: ['cliente', 'demo'],
      sourceUrl: 'https://exemplo.invalido/pagina',
      subtasks: [{ id: 'sub-1', title: 'Subtarefa já existente', done: false }],
      reminders: [{ id: 'rem-1', type: 'OFFSET', offsetMinutes: 60 }],
    });

    const { content } = buildSubtaskSuggestionContent(task.title, task.description ?? '');

    for (const forbidden of [
      task.id,
      'Ana Solicitante',
      'Bruno Responsável',
      'HIGH',
      'IN_PROGRESS',
      '2026-10-01',
      'cliente',
      'exemplo.invalido',
      'Subtarefa já existente',
      'sub-1',
      'rem-1',
    ]) {
      expect(content, forbidden).not.toContain(forbidden);
    }

    expect(content).toContain('Preparar a demo');
    expect(content).toContain('Roteiro e dados');
  });
});

describe('parseSubtaskSuggestionLines', () => {
  it('quebra por linha e descarta linhas vazias', () => {
    expect(parseSubtaskSuggestionLines('Primeira\n\n  \nSegunda\n')).toEqual([
      'Primeira',
      'Segunda',
    ]);
  });

  it('remove hífen, asterisco, marcador e numeração do início da linha', () => {
    const text = '- Com hífen\n* Com asterisco\n+ Com mais\n• Com marcador\n1. Numerada\n2) Entre parênteses';

    expect(parseSubtaskSuggestionLines(text)).toEqual([
      'Com hífen',
      'Com asterisco',
      'Com mais',
      'Com marcador',
      'Numerada',
      'Entre parênteses',
    ]);
  });

  it('reduz repetições a uma única ocorrência, preservando a primeira', () => {
    expect(parseSubtaskSuggestionLines('Montar roteiro\n- Montar roteiro\nMONTAR ROTEIRO\nOutra')).toEqual(
      ['Montar roteiro', 'Outra'],
    );
  });

  it('devolve lista vazia quando nada é aproveitável', () => {
    expect(parseSubtaskSuggestionLines('\n   \n-\n*\n')).toEqual([]);
  });
});

describe('buildSubtaskSuggestionProposal', () => {
  it('descarta item vazio e item acima do limite de título sem impedir os demais', () => {
    const text = ['Primeira', '-', 'b'.repeat(SUBTASK_TITLE_LIMIT + 1), 'Segunda'].join('\n');

    const proposal = buildSubtaskSuggestionProposal(text, 0);

    expect(proposal.drafts).toEqual([{ title: 'Primeira' }, { title: 'Segunda' }]);
    expect(proposal.discardedByLimit).toBe(false);
  });

  it('nunca excede as vagas restantes e sinaliza o descarte por limite', () => {
    const text = Array.from({ length: MAX_SUBTASKS }, (_, index) => `Item ${index + 1}`).join('\n');

    const proposal = buildSubtaskSuggestionProposal(text, MAX_SUBTASKS - 2);

    expect(proposal.drafts).toEqual([{ title: 'Item 1' }, { title: 'Item 2' }]);
    expect(proposal.discardedByLimit).toBe(true);
  });

  it('não propõe nada quando o limite de subtarefas já foi atingido', () => {
    const proposal = buildSubtaskSuggestionProposal('Item 1\nItem 2', MAX_SUBTASKS);

    expect(proposal.drafts).toEqual([]);
    expect(proposal.discardedByLimit).toBe(true);
  });

  it('devolve proposta vazia sem descarte por limite quando nada é aproveitável', () => {
    expect(buildSubtaskSuggestionProposal('\n  \n', 0)).toEqual({
      drafts: [],
      discardedByLimit: false,
    });
  });

  it('produz rascunhos sem identificador, como os incluídos manualmente', () => {
    const [draft] = buildSubtaskSuggestionProposal('Montar roteiro', 0).drafts;

    expect(draft).toEqual({ title: 'Montar roteiro' });
    expect(draft && 'id' in draft).toBe(false);
  });
});
