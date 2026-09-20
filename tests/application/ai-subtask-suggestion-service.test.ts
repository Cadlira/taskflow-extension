import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AiConfigStorageError } from '@/application/ai/ai-provider-config-repository';
import {
  AI_GENERATION_TIMEOUT_MS,
  type AiGenerationFailure,
} from '@/application/ai/ai-subtask-suggester';
import {
  createAiSubtaskSuggestionService,
  type AiSubtaskSuggestionService,
} from '@/application/ai/ai-subtask-suggestion-service';
import type { AiProviderConfig } from '@/domain/ai-provider';
import { SUBTASK_SUGGESTION_OUTPUT_LIMIT } from '@/domain/ai-subtask-suggestion';
import { MAX_SUBTASKS } from '@/domain/task-subtasks';
import {
  FakeAiSubtaskSuggester,
  FakeHostPermissions,
  InMemoryAiProviderConfigRepository,
} from '../support/fakes';

const CONFIG: AiProviderConfig = {
  provider: 'OPENAI',
  credential: 'sk-segredo',
  model: 'gpt-4o-mini',
};

const ORIGIN = 'https://api.openai.com';

const CONTENT = 'Instruções fixas\n\nTítulo: Preparar a demo';

interface Context {
  repository: InMemoryAiProviderConfigRepository;
  permissions: FakeHostPermissions;
  suggester: FakeAiSubtaskSuggester;
  service: AiSubtaskSuggestionService;
}

function createContext(config: AiProviderConfig | undefined, ...granted: string[]): Context {
  const repository = new InMemoryAiProviderConfigRepository(config);
  const permissions = new FakeHostPermissions(...granted);
  const suggester = new FakeAiSubtaskSuggester();

  return {
    repository,
    permissions,
    suggester,
    service: createAiSubtaskSuggestionService({ repository, permissions, suggester }),
  };
}

function ready(config: AiProviderConfig = CONFIG): Context {
  return createContext(config, ORIGIN);
}

function suggest(context: Context, existingSubtaskCount = 0) {
  return context.service.suggest({ content: CONTENT, existingSubtaskCount });
}

describe('createAiSubtaskSuggestionService', () => {
  it('recusa sem enviar quando nenhum provedor está configurado', async () => {
    const context = createContext(undefined);

    await expect(suggest(context)).resolves.toEqual({ ok: false, state: 'NOT_CONFIGURED' });
    expect(context.suggester.requests).toHaveLength(0);
  });

  it('recusa sem enviar quando a permissão de host da origem não foi concedida', async () => {
    const context = createContext(CONFIG);

    await expect(suggest(context)).resolves.toEqual({
      ok: false,
      state: 'FAILED',
      reason: 'PERMISSION_MISSING',
    });
    expect(context.suggester.requests).toHaveLength(0);
    expect(context.permissions.requested).toEqual([]);
  });

  it('bloqueia quando a configuração salva está em formato incompatível', async () => {
    const context = ready();
    context.repository.incompatible = true;

    await expect(suggest(context)).resolves.toEqual({
      ok: false,
      state: 'BLOCKED',
      blocked: 'INCOMPATIBLE',
    });
    expect(context.suggester.requests).toHaveLength(0);
  });

  it('bloqueia quando o armazenamento local está indisponível', async () => {
    const context = ready();
    context.repository.failNext.read = new AiConfigStorageError('UNAVAILABLE', 'Indisponível.');

    await expect(suggest(context)).resolves.toEqual({
      ok: false,
      state: 'BLOCKED',
      blocked: 'UNAVAILABLE',
    });
  });

  it('devolve a proposta validada quando o provedor responde com itens aproveitáveis', async () => {
    const context = ready();
    context.suggester.next = { ok: true, text: '- Montar roteiro\n- Preparar dados\n' };

    await expect(suggest(context)).resolves.toEqual({
      ok: true,
      proposal: {
        drafts: [{ title: 'Montar roteiro' }, { title: 'Preparar dados' }],
        discardedByLimit: false,
      },
    });
  });

  it('considera as vagas restantes a partir dos itens já presentes no formulário', async () => {
    const context = ready();
    context.suggester.next = { ok: true, text: 'Primeira\nSegunda\nTerceira' };

    const outcome = await suggest(context, MAX_SUBTASKS - 1);

    expect(outcome).toEqual({
      ok: true,
      proposal: { drafts: [{ title: 'Primeira' }], discardedByLimit: true },
    });
  });

  it('repassa ao adapter exatamente a string recebida, sem reconstruir nem reformatar', async () => {
    const context = ready();
    const content = 'Linha um\n\nTítulo: Tarefa com  espaços   e acentuação\nDescrição:\n- item';

    await context.service.suggest({ content, existingSubtaskCount: 0 });

    const [request] = context.suggester.requests;
    expect(request?.content).toBe(content);
    expect(request?.config).toEqual(CONFIG);
    expect(request?.maxOutputTokens).toBe(SUBTASK_SUGGESTION_OUTPUT_LIMIT);
  });

  it('produz no máximo uma requisição por acionamento', async () => {
    const context = ready();

    await suggest(context);

    expect(context.suggester.requests).toHaveLength(1);
  });

  it.each<[AiGenerationFailure, number | undefined]>([
    ['INVALID_CREDENTIALS', 401],
    ['ENDPOINT_UNREACHABLE', undefined],
    ['TIMEOUT', undefined],
    ['UNEXPECTED_RESPONSE', 500],
    ['MODEL_LIST_UNSUPPORTED', 404],
    ['PERMISSION_MISSING', undefined],
    ['EMPTY_RESPONSE', undefined],
    ['UNREADABLE_RESPONSE', undefined],
  ])('repassa o motivo %s devolvido pelo adapter', async (reason, status) => {
    const context = ready();
    context.suggester.next = { ok: false, reason, ...(status !== undefined && { status }) };

    await expect(suggest(context)).resolves.toEqual({
      ok: false,
      state: 'FAILED',
      reason,
      ...(status !== undefined && { status }),
    });
  });

  it('devolve NO_VALID_ITEM quando nenhum item sobrevive à validação', async () => {
    const context = ready();
    context.suggester.next = { ok: true, text: '-\n*\n   \n' };

    await expect(suggest(context)).resolves.toEqual({
      ok: false,
      state: 'FAILED',
      reason: 'NO_VALID_ITEM',
    });
  });

  it('não inicia uma segunda requisição enquanto a primeira está em andamento', async () => {
    const context = ready();
    const release = context.suggester.hold();

    const first = suggest(context);
    const second = await suggest(context);

    expect(second).toEqual({ ok: false, state: 'ALREADY_RUNNING' });

    release();
    await expect(first).resolves.toMatchObject({ ok: true });
    // Só o primeiro acionamento alcançou o adapter.
    expect(context.suggester.requests).toHaveLength(1);
  });

  it('libera o acionamento depois que a requisição termina', async () => {
    const context = ready();

    await suggest(context);
    await suggest(context);

    expect(context.suggester.requests).toHaveLength(2);
  });

  it('cancela abortando o sinal e não produz proposta', async () => {
    const context = ready();
    const release = context.suggester.hold();

    const pending = suggest(context);
    await Promise.resolve();
    context.service.cancel();
    release();

    await expect(pending).resolves.toEqual({ ok: false, state: 'CANCELLED' });
    expect(context.service.running()).toBe(false);
  });

  it('ignora o cancelamento quando não há requisição em andamento', () => {
    const context = ready();

    expect(() => context.service.cancel()).not.toThrow();
    expect(context.service.running()).toBe(false);
  });

  describe('limite de tempo', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('devolve TIMEOUT quando o provedor não responde dentro do limite', async () => {
      const context = ready();
      const release = context.suggester.hold();

      const pending = suggest(context);
      await vi.advanceTimersByTimeAsync(AI_GENERATION_TIMEOUT_MS);
      release();

      await expect(pending).resolves.toEqual({
        ok: false,
        state: 'FAILED',
        reason: 'TIMEOUT',
      });
      expect(context.suggester.requests).toHaveLength(1);
    });

    it('não repete a requisição automaticamente depois do tempo excedido', async () => {
      const context = ready();
      const release = context.suggester.hold();

      const pending = suggest(context);
      await vi.advanceTimersByTimeAsync(AI_GENERATION_TIMEOUT_MS * 3);
      release();
      await pending;

      expect(context.suggester.requests).toHaveLength(1);
    });
  });
});
