import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { AiConfigStorageError } from '@/application/ai/ai-provider-config-repository';
import type { AiProviderConfig } from '@/domain/ai-provider';
import { ChromeAiProviderConfigRepository } from '@/infrastructure/ai/chrome-ai-config-repository';
import { AI_CONFIG_STORAGE_KEY } from '@/infrastructure/storage/stored-ai-config';
import { TASKS_STORAGE_KEY } from '@/infrastructure/storage/stored-task-collection';
import { TRASH_STORAGE_KEY } from '@/infrastructure/storage/stored-trash';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { buildTask, FIXED_NOW } from '../support/task-fixtures';

const CONFIG: AiProviderConfig = {
  provider: 'OPENAI',
  credential: 'sk-secreta',
  model: 'gpt-4o-mini',
};

describe('ChromeAiProviderConfigRepository', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('resolve indefinido quando nenhum provedor foi configurado', async () => {
    await expect(new ChromeAiProviderConfigRepository().read()).resolves.toBeUndefined();
  });

  it('grava no envelope versionado e recupera em uma nova instância', async () => {
    await new ChromeAiProviderConfigRepository().save(CONFIG);

    expect((await fakeBrowser.storage.local.get(AI_CONFIG_STORAGE_KEY))[AI_CONFIG_STORAGE_KEY])
      .toEqual({ schemaVersion: 1, config: CONFIG });
    await expect(new ChromeAiProviderConfigRepository().read()).resolves.toEqual(CONFIG);
  });

  it('grava exclusivamente taskflow.ai e preserva tarefas e lixeira', async () => {
    const tasks = new ChromeTaskRepository();
    const task = buildTask();
    await tasks.save(task);
    await tasks.moveToTrash(task.id, FIXED_NOW);
    const before = await fakeBrowser.storage.local.get([TASKS_STORAGE_KEY, TRASH_STORAGE_KEY]);

    await new ChromeAiProviderConfigRepository().save(CONFIG);

    const after = await fakeBrowser.storage.local.get(null);
    expect(after[TASKS_STORAGE_KEY]).toEqual(before[TASKS_STORAGE_KEY]);
    expect(after[TRASH_STORAGE_KEY]).toEqual(before[TRASH_STORAGE_KEY]);
    expect(Object.keys(after).sort()).toEqual(
      [AI_CONFIG_STORAGE_KEY, TASKS_STORAGE_KEY, TRASH_STORAGE_KEY].sort(),
    );
  });

  it('não grava nada no armazenamento sincronizado', async () => {
    const sync = vi.spyOn(fakeBrowser.storage.sync, 'set');

    await new ChromeAiProviderConfigRepository().save(CONFIG);

    expect(sync).not.toHaveBeenCalled();
    await expect(fakeBrowser.storage.sync.get(null)).resolves.toEqual({});
  });

  it('substitui a configuração anterior por completo', async () => {
    const repository = new ChromeAiProviderConfigRepository();
    await repository.save(CONFIG);

    await repository.save({
      provider: 'CUSTOM',
      apiBase: 'https://gateway.exemplo/v1',
      credential: 'chave-nova',
      model: 'llama3.1',
    });

    expect((await fakeBrowser.storage.local.get(AI_CONFIG_STORAGE_KEY))[AI_CONFIG_STORAGE_KEY])
      .toEqual({
        schemaVersion: 1,
        config: {
          provider: 'CUSTOM',
          apiBase: 'https://gateway.exemplo/v1',
          credential: 'chave-nova',
          model: 'llama3.1',
        },
      });
    expect(JSON.stringify(await fakeBrowser.storage.local.get(null))).not.toContain('sk-secreta');
  });

  it('apaga a chave inteira ao remover, sem tocar nas demais', async () => {
    const tasks = new ChromeTaskRepository();
    await tasks.save(buildTask());
    const repository = new ChromeAiProviderConfigRepository();
    await repository.save(CONFIG);

    await repository.remove();

    const stored = await fakeBrowser.storage.local.get(null);
    expect(AI_CONFIG_STORAGE_KEY in stored).toBe(false);
    expect(JSON.stringify(stored)).not.toContain('sk-secreta');
    await expect(new ChromeTaskRepository().list()).resolves.toHaveLength(1);
  });

  it('recusa configuração persistida incompatível sem sobrescrevê-la', async () => {
    await fakeBrowser.storage.local.set({ [AI_CONFIG_STORAGE_KEY]: { schemaVersion: 99 } });

    await expect(new ChromeAiProviderConfigRepository().read()).rejects.toThrow(
      AiConfigStorageError,
    );
    expect((await fakeBrowser.storage.local.get(AI_CONFIG_STORAGE_KEY))[AI_CONFIG_STORAGE_KEY])
      .toEqual({ schemaVersion: 99 });
  });

  it('sinaliza armazenamento indisponível sem expor a credencial', async () => {
    vi.spyOn(fakeBrowser.storage.local, 'set').mockRejectedValueOnce(new Error('falhou'));

    const failure = await new ChromeAiProviderConfigRepository()
      .save(CONFIG)
      .catch((error: unknown) => error as AiConfigStorageError);

    expect(failure).toBeInstanceOf(AiConfigStorageError);
    expect((failure as AiConfigStorageError).reason).toBe('UNAVAILABLE');
    expect((failure as AiConfigStorageError).message).not.toContain('sk-secreta');
  });
});
