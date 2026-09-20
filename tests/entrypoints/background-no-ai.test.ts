import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import background from '@/entrypoints/background';
import { ChromeAiProviderConfigRepository } from '@/infrastructure/ai/chrome-ai-config-repository';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { AI_CONFIG_STORAGE_KEY } from '@/infrastructure/storage/stored-ai-config';
import { resolveReminderTriggerAt } from '@/domain/task-reminders';
import { buildTask, FIXED_NOW, hoursFrom } from '../support/task-fixtures';

const root = join(__dirname, '..', '..');

/** O tipo publicado pelo fake-browser declara retorno vazio; o contrato real resolve booleano. */
const grantsEverything = (async () => true) as unknown as never;

/** Módulos que compõem o caminho de rede da capability de provedores de IA. */
const AI_NETWORK_MODULES = [
  'chrome-ai-service',
  'openai-adapter',
  'anthropic-adapter',
  'ai-probe',
  'ai-connection-tester',
  'ai-generation',
  'ai-subtask-suggester',
  'ai-subtask-suggestion-service',
  'chrome-host-permissions',
  'AiProviderManager',
];

let fetchMock: ReturnType<typeof vi.fn>;
let alarmListeners: Array<(alarm: Browser.alarms.Alarm) => unknown>;

function backgroundSource(): string {
  return readFileSync(join(root, 'src', 'entrypoints', 'background.ts'), 'utf8');
}

describe('service worker sem caminho de rede de IA', () => {
  it('não importa nenhum módulo do caminho de provedores de IA', () => {
    const source = backgroundSource();

    for (const module of AI_NETWORK_MODULES) {
      expect(source, module).not.toContain(module);
    }
    expect(source).not.toMatch(/fetch\(/);
    expect(source).not.toMatch(/permissions\.(request|contains|remove)/);
    expect(source).not.toContain(AI_CONFIG_STORAGE_KEY);
  });

  it('não alcança nenhum módulo de IA por importação transitiva', async () => {
    const seen = new Set<string>();

    async function collect(specifier: string): Promise<void> {
      if (seen.has(specifier)) return;
      seen.add(specifier);

      const source = readFileSync(specifier, 'utf8');

      for (const match of source.matchAll(/from ['"]@\/([^'"]+)['"]/g)) {
        const relative = match[1]!;
        const candidates = [
          join(root, 'src', `${relative}.ts`),
          join(root, 'src', relative, 'index.ts'),
          join(root, 'src', relative),
        ];
        const resolved = candidates.find((path) => {
          try {
            readFileSync(path, 'utf8');
            return true;
          } catch {
            return false;
          }
        });

        if (resolved) await collect(resolved);
      }
    }

    await collect(join(root, 'src', 'entrypoints', 'background.ts'));

    const offenders = [...seen].filter((path) =>
      AI_NETWORK_MODULES.some((module) => path.includes(module)),
    );
    expect(offenders).toEqual([]);
    expect([...seen].some((path) => path.includes(`${'ai'}${'-provider'}`))).toBe(false);
  });

  it('não usa o logFailure genérico em nenhum caminho de IA', () => {
    const source = backgroundSource();
    // `logFailure` repassa o objeto de erro cru; estes são os únicos contextos que o usam, e
    // nenhum deles pertence a um caminho de provedor de IA.
    const allowed = ['reconciliar lembretes', 'registrar o menu de captura', 'processar lembrete'];

    expect(source).toContain('function logFailure');
    const contexts = [...source.matchAll(/logFailure\('([^']+)'\)/g)].map((match) => match[1]);
    expect(contexts.length).toBeGreaterThan(0);
    for (const context of contexts) {
      expect(allowed, context).toContain(context);
    }
  });
});

describe('nenhuma requisição de IA automática', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(FIXED_NOW);
    fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal('fetch', fetchMock);
    alarmListeners = [];
    vi.spyOn(fakeBrowser.alarms.onAlarm, 'addListener').mockImplementation((listener) => {
      alarmListeners.push(listener as (alarm: Browser.alarms.Alarm) => unknown);
    });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(fakeBrowser.contextMenus, 'removeAll').mockResolvedValue(undefined);
    vi.spyOn(fakeBrowser.contextMenus, 'create').mockReturnValue('taskflow:menu');
    vi.spyOn(fakeBrowser.contextMenus.onClicked, 'addListener').mockImplementation(
      () => undefined,
    );
    vi.spyOn(fakeBrowser.contextMenus.onClicked, 'removeListener').mockImplementation(
      () => undefined,
    );
    vi.spyOn(fakeBrowser.commands.onCommand, 'addListener').mockImplementation(() => undefined);

    // Configuração salva e permissão concedida: o pior caso para "nenhuma requisição automática".
    await new ChromeAiProviderConfigRepository().save({
      provider: 'OPENAI',
      credential: 'sk-abc',
      model: 'gpt-4o-mini',
    });
    vi.spyOn(fakeBrowser.permissions, 'contains').mockImplementation(grantsEverything);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('não contata provedor na instalação, na atualização, na inicialização nem no alarme', async () => {
    const due = hoursFrom(FIXED_NOW, 2);
    const task = buildTask({
      id: 'task-1',
      dueAt: due,
      reminders: [{ id: 'r15', type: 'OFFSET', offsetMinutes: 15 }],
    });
    await new ChromeTaskRepository().save(task);

    background.main();

    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'install' });
    await flushPromises();
    await fakeBrowser.runtime.onInstalled.trigger({ reason: 'update', previousVersion: '0.0.1' });
    await flushPromises();
    await fakeBrowser.runtime.onStartup.trigger();
    await flushPromises();

    for (const listener of alarmListeners) {
      await listener({
        name: 'taskflow:reminder:task-1:r15',
        scheduledTime: resolveReminderTriggerAt(task.reminders[0]!, task.dueAt!),
        persistAcrossSessions: false,
      });
    }
    await flushPromises();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserva a configuração de IA durante o trabalho de inicialização', async () => {
    background.main();

    await fakeBrowser.runtime.onStartup.trigger();
    await flushPromises();

    await expect(new ChromeAiProviderConfigRepository().read()).resolves.toEqual({
      provider: 'OPENAI',
      credential: 'sk-abc',
      model: 'gpt-4o-mini',
    });
  });
});
