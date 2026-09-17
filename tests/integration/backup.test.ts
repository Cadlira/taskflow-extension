import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createBackupService, type BackupSource } from '@/application/backup/backup-service';
import { encodeBackupFile, readBackupFile } from '@/application/backup/backup-file';
import { ChromeReminderScheduler } from '@/infrastructure/chrome/chrome-reminder-scheduler';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { TASKS_STORAGE_KEY } from '@/infrastructure/storage/stored-task-collection';
import { buildTask, FIXED_NOW, hoursFrom } from '../support/task-fixtures';

const SENTINEL_KEY = 'taskflow.test-secret';
const SENTINEL_VALUE = 'valor-sentinela-nao-exportar';

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

async function allStoredKeys(): Promise<string[]> {
  return Object.keys(await fakeBrowser.storage.local.get(null)).sort();
}

describe('backup com armazenamento real (fakeBrowser)', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  it('exporta e restaura isolando dados que não são tarefas', async () => {
    const service = createService();
    const due = hoursFrom(FIXED_NOW, 48);
    const original = buildTask({
      id: 'original',
      title: 'Original',
      dueAt: due,
      reminders: [{ id: 'r-original', type: 'OFFSET', offsetMinutes: 60 }],
    });

    await fakeBrowser.storage.local.set({
      [TASKS_STORAGE_KEY]: { schemaVersion: 2, tasks: [original] },
      [SENTINEL_KEY]: SENTINEL_VALUE,
    });

    const exported = await service.exportBackup();
    expect(exported.ok).toBe(true);
    if (!exported.ok) return;

    expect(exported.content).not.toContain(SENTINEL_KEY);
    expect(exported.content).not.toContain(SENTINEL_VALUE);

    const fileText = JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 1,
      exportedAt: '2026-09-10T12:00:00.000Z',
      app: { version: '0.1.0' },
      extraTopLevel: 'descartar',
      tasks: [
        {
          ...buildTask({
            id: 'restaurada',
            title: 'Restaurada',
            dueAt: hoursFrom(FIXED_NOW, 72),
          }),
          reminders: [{ id: 'r-nova', offsetMinutes: 15 }],
          extraTaskField: 'descartar',
        },
      ],
    });

    const prepared = await service.prepareRestore(sourceOf(fileText));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const restored = await service.restore(prepared.prepared);
    expect(restored).toEqual({
      ok: true,
      restoredCount: 1,
      remindersPending: false,
      verified: true,
    });

    expect(await allStoredKeys()).toEqual([SENTINEL_KEY, TASKS_STORAGE_KEY].sort());
    expect((await fakeBrowser.storage.local.get(SENTINEL_KEY))[SENTINEL_KEY]).toBe(SENTINEL_VALUE);

    const persisted = await new ChromeTaskRepository().list();
    expect(persisted).toEqual([
      buildTask({
        id: 'restaurada',
        title: 'Restaurada',
        dueAt: hoursFrom(FIXED_NOW, 72),
        reminders: [{ id: 'r-nova', type: 'OFFSET', offsetMinutes: 15 }],
      }),
    ]);

    const alarms = await fakeBrowser.alarms.getAll();
    expect(alarms.map((alarm) => alarm.name)).toEqual(['taskflow:reminder:restaurada:r-nova']);
  });

  it('mantém as demais chaves intactas ao restaurar um backup vazio', async () => {
    const service = createService();
    await fakeBrowser.storage.local.set({
      [TASKS_STORAGE_KEY]: {
        schemaVersion: 1,
        tasks: [buildTask({ id: 'a' }), buildTask({ id: 'b' })],
      },
      [SENTINEL_KEY]: SENTINEL_VALUE,
    });
    const emptyFile = encodeBackupFile([], {
      exportedAt: '2026-09-10T12:00:00.000Z',
      appVersion: '0.1.0',
    });

    const prepared = await service.prepareRestore(sourceOf(emptyFile));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    await service.restore(prepared.prepared);

    await expect(new ChromeTaskRepository().list()).resolves.toEqual([]);
    expect((await fakeBrowser.storage.local.get(SENTINEL_KEY))[SENTINEL_KEY]).toBe(SENTINEL_VALUE);
  });
});

describe('restauração dos arquivos de referência', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  function fixture(name: string): string {
    return readFileSync(join(__dirname, '..', 'fixtures', 'backups', name), 'utf8');
  }

  it.each([
    'taskflow-backup-v1.json',
    'taskflow-backup-v2.json',
    'taskflow-backup-v3.json',
    'taskflow-backup-v4.json',
  ])('restaura %s produzindo exatamente as tarefas esperadas', async (name) => {
    const service = createService();
    const parsed = readBackupFile(fixture(name));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const prepared = await service.prepareRestore(sourceOf(fixture(name)));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    const restored = await service.restore(prepared.prepared);

    expect(restored).toEqual({
      ok: true,
      restoredCount: parsed.backup.tasks.length,
      remindersPending: false,
      verified: true,
    });
    await expect(new ChromeTaskRepository().list()).resolves.toEqual(parsed.backup.tasks);
  });

  it('preserva as subtarefas ao restaurar o arquivo da versão 4', async () => {
    const service = createService();
    const prepared = await service.prepareRestore(sourceOf(fixture('taskflow-backup-v4.json')));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    await service.restore(prepared.prepared);

    const persisted = await new ChromeTaskRepository().list();

    expect(persisted.map((task) => task.subtasks.map(({ title, done }) => [title, done]))).toEqual([
      [],
      [
        ['Reservar sala', true],
        ['Enviar pauta', false],
        ['Revisar os números', true],
      ],
      [
        ['Atualizar o quadro', true],
        ['Arquivar e-mails', false],
      ],
      [
        ['Atualizar o quadro', false],
        ['Arquivar e-mails', false],
      ],
    ]);
    expect(persisted[1]?.subtasks[1]).not.toHaveProperty('unknownSubtaskField');
  });

  it('restaura o arquivo da versão 3 com todas as tarefas sem subtarefas', async () => {
    const service = createService();
    const prepared = await service.prepareRestore(sourceOf(fixture('taskflow-backup-v3.json')));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    await service.restore(prepared.prepared);

    const persisted = await new ChromeTaskRepository().list();
    expect(persisted).toHaveLength(3);
    expect(persisted.every((task) => task.subtasks.length === 0)).toBe(true);
  });

  it('preserva série e regra ao restaurar o arquivo da versão 3', async () => {
    const service = createService();
    const prepared = await service.prepareRestore(sourceOf(fixture('taskflow-backup-v3.json')));
    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;

    await service.restore(prepared.prepared);

    const persisted = await new ChromeTaskRepository().list();
    const withRule = persisted.filter((task) => task.recurrence !== undefined);

    expect(withRule).toHaveLength(2);
    expect(withRule.every((task) => task.seriesId !== undefined)).toBe(true);
    expect(persisted.some((task) => task.seriesId === 'serie-energia')).toBe(true);
  });
});
