import { describe, expect, it, vi } from 'vitest';
import { backupFileName, encodeBackupFile } from '@/application/backup/backup-file';
import {
  BACKUP_ISSUES_PREVIEW,
  BACKUP_MAX_BYTES,
  createBackupService,
  type BackupSource,
} from '@/application/backup/backup-service';
import { TaskStorageError } from '@/application/task-repository';
import type { Task } from '@/domain/task';
import { FakeReminderScheduler, InMemoryTaskRepository } from '../support/fakes';
import { buildTask, FIXED_NOW, hoursFrom } from '../support/task-fixtures';

const EXPORTED_AT = '2026-09-13T12:00:00.000Z';

function setup(tasks: Task[] = [buildTask()]) {
  const repository = new InMemoryTaskRepository(tasks);
  const scheduler = new FakeReminderScheduler();
  const service = createBackupService({
    repository,
    scheduler,
    clock: () => FIXED_NOW,
    appVersion: '0.1.0',
  });

  return { repository, scheduler, service };
}

function sourceOf(tasks: Task[]): BackupSource {
  const text = encodeBackupFile(tasks, { exportedAt: EXPORTED_AT, appVersion: '0.1.0' });
  return { size: text.length, text: () => Promise.resolve(text) };
}

function rawSource(value: string): BackupSource {
  return { size: value.length, text: () => Promise.resolve(value) };
}

async function preparedFrom(tasks: Task[]) {
  const context = setup([]);
  const result = await context.service.prepareRestore(sourceOf(tasks));

  if (!result.ok) {
    throw new Error('O backup de teste deveria ser válido.');
  }

  return { context, prepared: result.prepared };
}

describe('exportBackup', () => {
  it('exporta todas as tarefas com metadados, nome e contagem', async () => {
    const tasks = [buildTask({ id: 'a' }), buildTask({ id: 'b', title: 'Segunda' })];
    const { service } = setup(tasks);

    const result = await service.exportBackup();

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.fileName).toBe(backupFileName(FIXED_NOW));
      expect(result.taskCount).toBe(2);
      expect(JSON.parse(result.content)).toEqual({
        format: 'taskflow-backup',
        formatVersion: 3,
        exportedAt: FIXED_NOW.toISOString(),
        app: { version: '0.1.0' },
        tasks,
      });
    }
  });

  it('exporta arquivo válido sem tarefas', async () => {
    const { service } = setup([]);

    const result = await service.exportBackup();

    expect(result).toMatchObject({ ok: true, taskCount: 0 });
    if (result.ok) {
      expect(JSON.parse(result.content).tasks).toEqual([]);
    }
  });

  it('bloqueia sem gerar conteúdo quando os dados locais são incompatíveis', async () => {
    const { service, repository } = setup();
    repository.failNext.list = new TaskStorageError('INCOMPATIBLE_DATA', 'formato desconhecido');

    const result = await service.exportBackup();

    expect(result).toEqual({ ok: false, reason: 'LOCAL_DATA_INCOMPATIBLE' });
    expect(result).not.toHaveProperty('content');
  });

  it('informa indisponibilidade quando o armazenamento falha', async () => {
    const { service, repository } = setup();
    repository.failNext.list = new TaskStorageError('UNAVAILABLE', 'sem acesso');

    await expect(service.exportBackup()).resolves.toEqual({
      ok: false,
      reason: 'STORAGE_UNAVAILABLE',
    });
  });
});

describe('prepareRestore', () => {
  it('apresenta a prévia com data, versões e totais', async () => {
    const local = [buildTask({ id: 'a' }), buildTask({ id: 'b' }), buildTask({ id: 'c' })];
    const fileTasks = [
      buildTask({ id: 'x' }),
      buildTask({ id: 'y' }),
      buildTask({ id: 'z' }),
      buildTask({ id: 'w' }),
      buildTask({ id: 'v' }),
    ];
    const { service } = setup(local);

    const result = await service.prepareRestore(sourceOf(fileTasks));

    expect(result).toEqual({
      ok: true,
      prepared: {
        tasks: fileTasks,
        exportedAt: EXPORTED_AT,
        formatVersion: 3,
        appVersion: '0.1.0',
        fileTaskCount: 5,
        localTaskCount: 3,
      },
    });
  });

  it('recusa arquivo acima de 20 MiB sem lê-lo e sem gravar', async () => {
    const { service, repository } = setup();
    const text = vi.fn(() => Promise.resolve('{}'));
    const replaceAll = vi.spyOn(repository, 'replaceAll');

    const result = await service.prepareRestore({ size: BACKUP_MAX_BYTES + 1, text });

    expect(result).toEqual({ ok: false, reason: 'FILE_TOO_LARGE' });
    expect(text).not.toHaveBeenCalled();
    expect(replaceAll).not.toHaveBeenCalled();
  });

  it('aceita arquivo exatamente no limite', async () => {
    const { service } = setup([]);
    const source = sourceOf([buildTask()]);

    const result = await service.prepareRestore({ ...source, size: BACKUP_MAX_BYTES });

    expect(result.ok).toBe(true);
  });

  it('bloqueia por dados locais incompatíveis antes de ler o arquivo', async () => {
    const { service, repository } = setup();
    repository.failNext.list = new TaskStorageError('INCOMPATIBLE_DATA', 'formato desconhecido');
    const text = vi.fn(() => Promise.resolve('{}'));

    const result = await service.prepareRestore({ size: 10, text });

    expect(result).toEqual({ ok: false, reason: 'LOCAL_DATA_INCOMPATIBLE' });
    expect(text).not.toHaveBeenCalled();
  });

  it('informa indisponibilidade quando o armazenamento falha', async () => {
    const { service, repository } = setup();
    repository.failNext.list = new TaskStorageError('UNAVAILABLE', 'sem acesso');
    const text = vi.fn(() => Promise.resolve('{}'));

    const result = await service.prepareRestore({ size: 10, text });

    expect(result).toEqual({ ok: false, reason: 'STORAGE_UNAVAILABLE' });
    expect(text).not.toHaveBeenCalled();
  });

  it.each([
    ['JSON inválido', '{', 'INVALID_JSON'],
    ['JSON que não é backup', '{"a":1}', 'NOT_TASKFLOW_BACKUP'],
    [
      'versão ausente',
      JSON.stringify({ format: 'taskflow-backup', exportedAt: EXPORTED_AT, app: { version: '1' }, tasks: [] }),
      'INVALID_FORMAT_VERSION',
    ],
    [
      'versão mais nova',
      JSON.stringify({
        format: 'taskflow-backup',
        formatVersion: 4,
        exportedAt: EXPORTED_AT,
        app: { version: '1' },
        tasks: [],
      }),
      'NEWER_FORMAT_VERSION',
    ],
    [
      'estrutura inválida',
      JSON.stringify({
        format: 'taskflow-backup',
        formatVersion: 1,
        exportedAt: EXPORTED_AT,
        app: { version: '1' },
        tasks: 'x',
      }),
      'INVALID_STRUCTURE',
    ],
  ] as const)('informa o motivo de recusa: %s', async (_label, text, reason) => {
    const { service, repository } = setup();
    const replaceAll = vi.spyOn(repository, 'replaceAll');

    const result = await service.prepareRestore(rawSource(text));

    expect(result).toEqual({ ok: false, reason });
    expect(replaceAll).not.toHaveBeenCalled();
  });

  it('limita a prévia de erros aos primeiros cinco e informa quantos restam', async () => {
    const { service } = setup();
    const invalid = {
      ...buildTask(),
      title: 'x'.repeat(201),
      description: 'y'.repeat(4001),
      requester: 'r'.repeat(121),
      assignee: 'a'.repeat(121),
      status: 'X',
      priority: 'Y',
      sourceUrl: 'ftp://example.com',
      tags: Array.from({ length: 11 }, (_, index) => `t${index}`),
    };
    const text = JSON.stringify({
      format: 'taskflow-backup',
      formatVersion: 1,
      exportedAt: EXPORTED_AT,
      app: { version: '0.1.0' },
      tasks: [invalid],
    });

    const result = await service.prepareRestore(rawSource(text));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('INVALID_TASKS');
      expect(result.issues).toHaveLength(BACKUP_ISSUES_PREVIEW);
      expect(result.extraIssueCount).toBe(3);
    }
  });
});

describe('restore', () => {
  it('substitui todas as tarefas preservando identificadores e timestamps', async () => {
    const due = hoursFrom(FIXED_NOW, 48);
    const restored = buildTask({
      id: 'nova',
      title: 'Nova',
      dueAt: due,
      reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 60 }],
      tags: ['casa'],
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-02T00:00:00.000Z',
    });
    const { context, prepared } = await preparedFrom([restored]);
    context.repository.tasks = [buildTask({ id: 'antiga' })];

    const result = await context.service.restore(prepared);

    expect(result).toEqual({
      ok: true,
      restoredCount: 1,
      remindersPending: false,
      verified: true,
    });
    expect(context.repository.tasks).toEqual([restored]);
    expect(context.scheduler.alarmsFor('nova')).toEqual([
      { taskId: 'nova', reminderId: 'r1', triggerAt: Date.parse(due) - 60 * 60_000 },
    ]);
  });

  it('preserva lembrete absoluto e programa o alarme no instante escolhido', async () => {
    const at = hoursFrom(FIXED_NOW, 30);
    const { context, prepared } = await preparedFrom([
      buildTask({
        id: 'nova',
        dueAt: hoursFrom(FIXED_NOW, 48),
        reminders: [{ id: 'r-at', type: 'AT', at }],
      }),
    ]);

    const result = await context.service.restore(prepared);

    expect(result).toMatchObject({ ok: true, remindersPending: false });
    expect(context.repository.tasks[0]?.reminders).toEqual([{ id: 'r-at', type: 'AT', at }]);
    expect(context.scheduler.alarmsFor('nova')).toEqual([
      { taskId: 'nova', reminderId: 'r-at', triggerAt: Date.parse(at) },
    ]);
  });

  it('remove alarmes das tarefas substituídas e cria os das restauradas', async () => {
    const oldDue = hoursFrom(FIXED_NOW, 24);
    const { context, prepared } = await preparedFrom([
      buildTask({
        id: 'nova',
        dueAt: hoursFrom(FIXED_NOW, 48),
        reminders: [{ id: 'r-new', type: 'OFFSET', offsetMinutes: 15 }],
      }),
    ]);
    await context.scheduler.reconcileAll([
      { taskId: 'antiga', reminderId: 'r-old', triggerAt: Date.parse(oldDue) },
    ]);

    await context.service.restore(prepared);

    expect(context.scheduler.alarmsFor('antiga')).toEqual([]);
    expect(context.scheduler.alarmsFor('nova')).toHaveLength(1);
  });

  it('marca lembrete vencido como processado sem notificação retroativa', async () => {
    const due = hoursFrom(FIXED_NOW, -1);
    const { context, prepared } = await preparedFrom([
      buildTask({ id: 'atrasada', dueAt: due, reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 0 }] }),
    ]);

    const result = await context.service.restore(prepared);

    expect(result).toMatchObject({ ok: true, remindersPending: false });
    expect(context.repository.tasks[0]?.reminders).toEqual([
      { id: 'r1', type: 'OFFSET', offsetMinutes: 0, processedFor: due },
    ]);
    expect(context.scheduler.alarms.size).toBe(0);
  });

  it('mantém tudo como estava quando a gravação falha', async () => {
    const { context, prepared } = await preparedFrom([buildTask({ id: 'nova' })]);
    const previous = buildTask({ id: 'antiga' });
    context.repository.tasks = [previous];
    context.repository.failNext.replaceAll = new TaskStorageError('UNAVAILABLE', 'sem espaço');

    const result = await context.service.restore(prepared);

    expect(result).toEqual({ ok: false, reason: 'STORAGE_UNAVAILABLE' });
    expect(context.repository.tasks).toEqual([previous]);
    expect(context.scheduler.alarms.size).toBe(0);
  });

  it('informa bloqueio quando a gravação encontra dados incompatíveis', async () => {
    const { context, prepared } = await preparedFrom([buildTask({ id: 'nova' })]);
    context.repository.failNext.replaceAll = new TaskStorageError(
      'INCOMPATIBLE_DATA',
      'formato desconhecido',
    );

    await expect(context.service.restore(prepared)).resolves.toEqual({
      ok: false,
      reason: 'LOCAL_DATA_INCOMPATIBLE',
    });
  });

  it('avisa lembretes pendentes sem desfazer a restauração', async () => {
    const { context, prepared } = await preparedFrom([
      buildTask({
        id: 'nova',
        dueAt: hoursFrom(FIXED_NOW, 24),
        reminders: [{ id: 'r1', type: 'OFFSET', offsetMinutes: 15 }],
      }),
    ]);
    context.scheduler.failNext = true;

    const result = await context.service.restore(prepared);

    expect(result).toMatchObject({ ok: true, remindersPending: true, restoredCount: 1 });
    await expect(context.repository.get('nova')).resolves.toBeDefined();
  });

  it('não sinaliza pendência quando não havia lembretes a agendar', async () => {
    const { context, prepared } = await preparedFrom([buildTask({ id: 'nova' })]);
    context.scheduler.failNext = true;

    const result = await context.service.restore(prepared);

    expect(result).toMatchObject({ ok: true, remindersPending: false });
  });

  it('marca verified falso quando outra alteração concorre com a gravação', async () => {
    const { context, prepared } = await preparedFrom([buildTask({ id: 'nova' })]);
    vi.spyOn(context.repository, 'list').mockResolvedValueOnce([buildTask({ id: 'outra' })]);

    const result = await context.service.restore(prepared);

    expect(result).toMatchObject({ ok: true, verified: false, restoredCount: 1 });
  });

  it('marca verified falso quando a releitura falha após a gravação aceita', async () => {
    const { context, prepared } = await preparedFrom([buildTask({ id: 'nova' })]);
    vi.spyOn(context.repository, 'list').mockRejectedValueOnce(new Error('indisponível'));

    const result = await context.service.restore(prepared);

    expect(result).toMatchObject({ ok: true, verified: false });
  });

  it('remove todas as tarefas locais com um backup vazio', async () => {
    const { context, prepared } = await preparedFrom([]);
    context.repository.tasks = [buildTask({ id: 'a' }), buildTask({ id: 'b' })];

    const result = await context.service.restore(prepared);

    expect(result).toEqual({
      ok: true,
      restoredCount: 0,
      remindersPending: false,
      verified: true,
    });
    expect(context.repository.tasks).toEqual([]);
  });
});
