import type { ReminderScheduler } from '@/application/reminder-scheduler';
import type { TaskRepository, TaskStorageError } from '@/application/task-repository';
import type { Task } from '@/domain/task';
import type { PlannedReminder } from '@/domain/task-reminders';

type Listener = { onChange: (tasks: Task[]) => void; onError?: (error: TaskStorageError) => void };

/** Repository em memória que imita as notificações de alteração do armazenamento. */
export class InMemoryTaskRepository implements TaskRepository {
  tasks: Task[];
  readonly listeners = new Set<Listener>();
  failNext: { list?: Error; save?: Error; replaceAll?: Error; delete?: Error } = {};

  constructor(tasks: Task[] = []) {
    this.tasks = structuredClone(tasks);
  }

  async list(): Promise<Task[]> {
    this.throwIfFailing('list');
    return structuredClone(this.tasks);
  }

  async get(id: string): Promise<Task | undefined> {
    return (await this.list()).find((task) => task.id === id);
  }

  async save(task: Task): Promise<void> {
    this.throwIfFailing('save');
    const index = this.tasks.findIndex((candidate) => candidate.id === task.id);
    this.tasks = index === -1 ? [...this.tasks, task] : this.tasks.with(index, task);
    this.emit();
  }

  async replaceAll(tasks: Task[]): Promise<void> {
    this.throwIfFailing('replaceAll');
    this.tasks = structuredClone(tasks);
    this.emit();
  }

  async delete(id: string): Promise<void> {
    this.throwIfFailing('delete');
    this.tasks = this.tasks.filter((task) => task.id !== id);
    this.emit();
  }

  subscribe(onChange: Listener['onChange'], onError?: Listener['onError']): () => void {
    const listener: Listener = onError ? { onChange, onError } : { onChange };
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Simula uma alteração feita por outra superfície. */
  replaceExternally(tasks: Task[]): void {
    this.tasks = structuredClone(tasks);
    this.emit();
  }

  emitError(error: TaskStorageError): void {
    this.listeners.forEach((listener) => listener.onError?.(error));
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener.onChange(structuredClone(this.tasks)));
  }

  private throwIfFailing(operation: keyof InMemoryTaskRepository['failNext']): void {
    const error = this.failNext[operation];
    if (error) {
      delete this.failNext[operation];
      throw error;
    }
  }
}

export class FakeReminderScheduler implements ReminderScheduler {
  readonly alarms = new Map<string, PlannedReminder>();
  failNext = false;

  async reconcileTask(taskId: string, planned: readonly PlannedReminder[]): Promise<void> {
    this.throwIfFailing();
    for (const [key, alarm] of this.alarms) {
      if (alarm.taskId === taskId) this.alarms.delete(key);
    }
    planned.forEach((alarm) => this.alarms.set(`${alarm.taskId}:${alarm.reminderId}`, alarm));
  }

  async reconcileAll(planned: readonly PlannedReminder[]): Promise<void> {
    this.throwIfFailing();
    this.alarms.clear();
    planned.forEach((alarm) => this.alarms.set(`${alarm.taskId}:${alarm.reminderId}`, alarm));
  }

  alarmsFor(taskId: string): PlannedReminder[] {
    return [...this.alarms.values()].filter((alarm) => alarm.taskId === taskId);
  }

  private throwIfFailing(): void {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('alarms indisponível');
    }
  }
}
