import { describe, expect, it, vi } from 'vitest';
import { openTaskManager, type TaskManagerNavigator } from '@/application/open-task-manager';

describe('openTaskManager', () => {
  it('delega a navegação sem acoplar o caso de uso à API do Chrome', async () => {
    const open = vi.fn<() => Promise<void>>().mockResolvedValue();
    const navigator: TaskManagerNavigator = { open };

    await openTaskManager(navigator);

    expect(open).toHaveBeenCalledOnce();
  });
});
