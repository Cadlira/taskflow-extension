import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { createChromeTaskServices } from '@/composition/chrome-task-service';
import { ChromeTaskRepository } from '@/infrastructure/chrome/chrome-task-repository';
import { buildTask } from '../support/task-fixtures';

describe('createChromeTaskServices', () => {
  beforeEach(() => {
    fakeBrowser.reset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('usa a mesma instância de ChromeTaskRepository para tarefas e lixeira', async () => {
    await new ChromeTaskRepository().save(buildTask());
    const moveToTrash = vi.spyOn(ChromeTaskRepository.prototype, 'moveToTrash');
    const listTrash = vi.spyOn(ChromeTaskRepository.prototype, 'listTrash');
    const deleteFromTrash = vi.spyOn(ChromeTaskRepository.prototype, 'deleteFromTrash');
    const { tasks, trash } = createChromeTaskServices();

    await tasks.remove('task-1');
    const items = await trash.list();
    await trash.deletePermanently('task-1');

    expect(items.map((item) => item.task.id)).toEqual(['task-1']);
    const [repository] = moveToTrash.mock.contexts;
    expect(repository).toBeInstanceOf(ChromeTaskRepository);
    expect(listTrash.mock.contexts[0]).toBe(repository);
    expect(deleteFromTrash.mock.contexts[0]).toBe(repository);
  });

  it('restaura pela lixeira com a mesma fila da exclusão', async () => {
    await new ChromeTaskRepository().save(buildTask());
    const restoreFromTrash = vi.spyOn(ChromeTaskRepository.prototype, 'restoreFromTrash');
    const moveToTrash = vi.spyOn(ChromeTaskRepository.prototype, 'moveToTrash');
    const { tasks, trash } = createChromeTaskServices();

    await tasks.remove('task-1');
    await expect(trash.restore('task-1')).resolves.toMatchObject({ status: 'RESTORED' });

    expect(restoreFromTrash.mock.contexts[0]).toBe(moveToTrash.mock.contexts[0]);
    await expect(tasks.list()).resolves.toEqual([buildTask()]);
  });
});
