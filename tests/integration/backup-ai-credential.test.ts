import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { encodeBackupFile } from '@/application/backup/backup-file';
import { createBackupService, type BackupSource } from '@/application/backup/backup-service';
import type { AiProviderConfig } from '@/domain/ai-provider';
import { ChromeAiProviderConfigRepository } from '@/infrastructure/ai/chrome-ai-config-repository';
import { ChromeReminderScheduler } from '@/infrastructure/chrome/chrome-reminder-scheduler';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { AI_CONFIG_STORAGE_KEY } from '@/infrastructure/storage/stored-ai-config';
import { TASKS_STORAGE_KEY } from '@/infrastructure/storage/stored-task-collection';
import { buildTask, FIXED_NOW } from '../support/task-fixtures';

const CONFIG: AiProviderConfig = {
  provider: 'CUSTOM',
  apiBase: 'https://gateway-secreto.exemplo/v1',
  credential: 'sk-credencial-que-nao-pode-vazar',
  model: 'modelo-secreto-x9',
};

function createService() {
  return createBackupService({
    repository: new ChromeTaskRepository(),
    scheduler: new ChromeReminderScheduler(),
    clock: () => FIXED_NOW,
    appVersion: '0.1.0',
  });
}

function sourceOf(text: string): BackupSource {
  return { size: text.length, text: () => Promise.resolve(text) };
}

async function storedAiEnvelope(): Promise<unknown> {
  return (await fakeBrowser.storage.local.get(AI_CONFIG_STORAGE_KEY))[AI_CONFIG_STORAGE_KEY];
}

describe('credencial de IA fora das exportações', () => {
  beforeEach(async () => {
    fakeBrowser.reset();
    await new ChromeAiProviderConfigRepository().save(CONFIG);
  });

  it('não inclui credencial, modelo, base nem o nome da chave no arquivo exportado', async () => {
    const tasks = new ChromeTaskRepository();
    await tasks.save(buildTask({ id: 'a', title: 'Revisar proposta' }));
    await tasks.save(buildTask({ id: 'b', title: 'Enviar relatório' }));

    const result = await createService().exportBackup();

    expect(result.ok).toBe(true);
    const content = result.ok ? result.content : '';
    expect(content).not.toContain(CONFIG.credential);
    expect(content).not.toContain(CONFIG.model);
    expect(content).not.toContain(CONFIG.apiBase);
    expect(content).not.toContain('gateway-secreto.exemplo');
    expect(content).not.toContain(AI_CONFIG_STORAGE_KEY);
    expect(content).not.toContain('provider');
    expect(content).not.toContain('credential');
  });

  it('exporta apenas as tarefas e os metadados previstos pelo formato', async () => {
    await new ChromeTaskRepository().save(buildTask({ id: 'a' }));

    const result = await createService().exportBackup();
    const parsed = JSON.parse(result.ok ? result.content : '{}') as Record<string, unknown>;

    // Falha se a exportação passar a incluir qualquer outra chave do armazenamento.
    expect(Object.keys(parsed).sort()).toEqual([
      'app',
      'exportedAt',
      'format',
      'formatVersion',
      'tasks',
    ]);
    expect(Object.keys(await fakeBrowser.storage.local.get(null))).toContain(
      AI_CONFIG_STORAGE_KEY,
    );
  });

  it('preserva a configuração de provedor ao restaurar um backup válido', async () => {
    await new ChromeTaskRepository().save(buildTask({ id: 'antiga' }));
    const before = await storedAiEnvelope();
    const service = createService();
    const file = encodeBackupFile([buildTask({ id: 'nova', title: 'Do arquivo' })], {
      exportedAt: FIXED_NOW.toISOString(),
      appVersion: '0.1.0',
    });

    const prepared = await service.prepareRestore(sourceOf(file));
    expect(prepared.ok).toBe(true);
    const restored = prepared.ok ? await service.restore(prepared.prepared) : { ok: false };

    expect(restored.ok).toBe(true);
    expect(await storedAiEnvelope()).toEqual(before);
    await expect(new ChromeAiProviderConfigRepository().read()).resolves.toEqual(CONFIG);
    const tasks = await new ChromeTaskRepository().list();
    expect(tasks.map((task) => task.id)).toEqual(['nova']);
  });

  it('não injeta configuração de provedor a partir de propriedades desconhecidas do arquivo', async () => {
    await fakeBrowser.storage.local.remove(AI_CONFIG_STORAGE_KEY);
    const service = createService();
    const base = JSON.parse(
      encodeBackupFile([buildTask({ id: 'a' })], {
        exportedAt: FIXED_NOW.toISOString(),
        appVersion: '0.1.0',
      }),
    ) as Record<string, unknown>;
    const file = JSON.stringify({
      ...base,
      ai: { provider: 'CUSTOM', apiBase: 'https://invasor.exemplo/v1', credential: 'sk-injetada' },
      [AI_CONFIG_STORAGE_KEY]: { schemaVersion: 1, config: CONFIG },
    });

    const prepared = await service.prepareRestore(sourceOf(file));
    expect(prepared.ok).toBe(true);
    if (prepared.ok) {
      await service.restore(prepared.prepared);
    }

    await expect(new ChromeAiProviderConfigRepository().read()).resolves.toBeUndefined();
    const stored = await fakeBrowser.storage.local.get(null);
    expect(Object.keys(stored)).toEqual([TASKS_STORAGE_KEY]);
    expect(JSON.stringify(stored)).not.toContain('sk-injetada');
    expect(JSON.stringify(stored)).not.toContain('invasor.exemplo');
  });
});
