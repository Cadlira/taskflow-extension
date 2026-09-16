import type { ActivePageReader, PendingCaptureInbox } from '@/application/page-capture';
import type { ReminderScheduler } from '@/application/reminder-scheduler';
import {
  type ReminderOccurrenceClaim,
  type TaskRepository,
  type TaskStorageError,
} from '@/application/task-repository';
import { isPendingCaptureValid, type PendingCapture } from '@/domain/page-capture';
import type { Task } from '@/domain/task';
import { claimReminderOccurrence, type PlannedReminder } from '@/domain/task-reminders';

type Listener = { onChange: (tasks: Task[]) => void; onError?: (error: TaskStorageError) => void };

/** Repository em memória que imita as notificações de alteração do armazenamento. */
export class InMemoryTaskRepository implements TaskRepository {
  tasks: Task[];
  readonly listeners = new Set<Listener>();
  failNext: {
    list?: Error;
    save?: Error;
    saveMany?: Error;
    replaceAll?: Error;
    delete?: Error;
    claimReminderOccurrence?: Error;
  } = {};

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

  async saveMany(tasks: Task[]): Promise<void> {
    this.throwIfFailing('saveMany');
    let next = this.tasks;

    for (const task of tasks) {
      const index = next.findIndex((candidate) => candidate.id === task.id);
      next = index === -1 ? [...next, task] : next.with(index, task);
    }

    this.tasks = next;
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

  async claimReminderOccurrence({
    taskId,
    reminderId,
    processedFor,
  }: ReminderOccurrenceClaim): Promise<boolean> {
    this.throwIfFailing('claimReminderOccurrence');
    const index = this.tasks.findIndex((task) => task.id === taskId);

    if (index === -1) {
      return false;
    }

    const claimed = claimReminderOccurrence(this.tasks[index]!, reminderId, processedFor);

    if (claimed === undefined) {
      return false;
    }

    this.tasks = this.tasks.with(index, claimed);
    this.emit();
    return true;
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

/** Reader falso da aba ativa, controlável por teste. */
export class FakeActivePageReader implements ActivePageReader {
  current: { title?: string; url?: string } = {};
  failNext = false;
  calls = 0;

  async read(): Promise<{ title?: string; url?: string }> {
    this.calls += 1;

    if (this.failNext) {
      this.failNext = false;
      throw new Error('leitura indisponível');
    }

    return this.current;
  }
}

/** Inbox falso que emula o contrato de validade e janela da captura pendente. */
export class FakePendingCaptureInbox implements PendingCaptureInbox {
  takeResult: PendingCapture | null = null;
  readonly saved: PendingCapture[] = [];
  private readonly listeners = new Set<(capture: PendingCapture) => void>();

  async save(capture: PendingCapture): Promise<void> {
    this.saved.push(capture);
  }

  async take(): Promise<PendingCapture | null> {
    const result = this.takeResult;
    this.takeResult = null;

    return result && isPendingCaptureValid(result, new Date()) ? result : null;
  }

  subscribe(listener: (capture: PendingCapture) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(capture: PendingCapture): void {
    if (!isPendingCaptureValid(capture, new Date())) return;
    this.takeResult = capture;
    this.listeners.forEach((listener) => listener(capture));
  }

  get listenerCount(): number {
    return this.listeners.size;
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
