import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createChromeTaskServices } from '@/composition/chrome-task-service';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { buildTask } from '../support/task-fixtures';

describe('lixeira com armazenamento real (fakeBrowser)', () => {
  const MONDAY = new Date(2026, 8, 14, 9);
  const TUESDAY = new Date(2026, 8, 15, 9);

  beforeEach(() => {
    fakeBrowser.reset();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 8, 14, 7));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('excluir a ocorrência com a regra, restaurá-la sem gerar e concluí-la gerando a próxima', async () => {
    const series = buildTask({
      id: 'serie',
      title: 'Regar as plantas',
      dueAt: MONDAY.toISOString(),
      seriesId: 'serie-1',
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
      reminders: [{ id: 'r-30', type: 'OFFSET', offsetMinutes: 30 }],
    });
    await new ChromeTaskRepository().save(series);
    const { tasks, trash } = createChromeTaskServices();

    await tasks.remove('serie');

    await expect(tasks.list()).resolves.toEqual([]);
    expect((await trash.list()).map((item) => item.task)).toEqual([series]);
    expect(await fakeBrowser.alarms.getAll()).toEqual([]);

    await expect(trash.restore('serie')).resolves.toMatchObject({
      status: 'RESTORED',
      task: series,
    });

    await expect(tasks.list()).resolves.toEqual([series]);
    await expect(trash.list()).resolves.toEqual([]);
    expect((await fakeBrowser.alarms.getAll()).map((alarm) => alarm.name)).toEqual([
      'taskflow:reminder:serie:r-30',
    ]);

    const done = await tasks.changeStatus('serie', 'DONE');

    expect(done.ok).toBe(true);
    const persisted = await tasks.list();
    expect(persisted).toHaveLength(2);
    expect(persisted.find((task) => task.id === 'serie')?.recurrence).toBeUndefined();
    expect(persisted.find((task) => task.id !== 'serie')).toMatchObject({
      seriesId: 'serie-1',
      dueAt: TUESDAY.toISOString(),
      recurrence: { frequency: 'DAILY', intervalDays: 1 },
    });
  });
});
