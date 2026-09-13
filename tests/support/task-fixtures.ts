import type { Task } from '@/domain/task';

export const FIXED_NOW = new Date('2026-09-13T12:00:00.000Z');

export function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    title: 'Revisar proposta',
    status: 'TODO',
    priority: 'MEDIUM',
    reminders: [],
    tags: [],
    createdAt: '2026-09-01T10:00:00.000Z',
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

export function sequentialIds(prefix = 'id'): () => string {
  let counter = 0;
  return () => `${prefix}-${++counter}`;
}

export function hoursFrom(base: Date, hours: number): string {
  return new Date(base.getTime() + hours * 60 * 60 * 1000).toISOString();
}
