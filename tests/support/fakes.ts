import type { ActivePageReader, PendingCaptureInbox } from '@/application/page-capture';
import type { ReminderScheduler } from '@/application/reminder-scheduler';
import {
  type ReminderOccurrenceClaim,
  type TaskRepository,
  type TaskStorageError,
} from '@/application/task-repository';
import type {
  TaskTrashRepository,
  TrashRestoreResult,
} from '@/application/task-trash-repository';
import { isPendingCaptureValid, type PendingCapture } from '@/domain/page-capture';
import type { Task } from '@/domain/task';
import { claimReminderOccurrence, type PlannedReminder } from '@/domain/task-reminders';
import { addToTrash, pruneTrash, sortTrashForDisplay, type TrashItem } from '@/domain/task-trash';

type Listener = { onChange: (tasks: Task[]) => void; onError?: (error: TaskStorageError) => void };
type TrashListener = {
  onChange: (items: TrashItem[]) => void;
  onError?: (error: TaskStorageError) => void;
};

/** Repository em memória que imita as notificações de alteração do armazenamento. */
export class InMemoryTaskRepository implements TaskRepository, TaskTrashRepository {
  tasks: Task[];
  trash: TrashItem[] = [];
  readonly listeners = new Set<Listener>();
  readonly trashListeners = new Set<TrashListener>();
  failNext: {
    list?: Error;
    save?: Error;
    saveMany?: Error;
    replaceAll?: Error;
    delete?: Error;
    claimReminderOccurrence?: Error;
    updateTaskConditionally?: Error;
    revertConditionally?: Error;
    moveToTrash?: Error;
    listTrash?: Error;
    restoreFromTrash?: Error;
    deleteFromTrash?: Error;
    emptyTrash?: Error;
    purgeTrash?: Error;
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

  async updateTaskConditionally(
    id: string,
    change: (task: Task) => Task | undefined,
  ): Promise<Task | undefined> {
    this.throwIfFailing('updateTaskConditionally');
    const index = this.tasks.findIndex((task) => task.id === id);
    const current = this.tasks[index];

    if (current === undefined) {
      return undefined;
    }

    const snapshot = structuredClone(current);
    const updated = change(snapshot);

    if (updated === undefined || updated === snapshot) {
      return undefined;
    }

    this.tasks = this.tasks.with(index, updated);
    this.emit();
    return structuredClone(updated);
  }

  async revertConditionally<T>(
    change: (tasks: Task[]) => { next?: Task[]; result: T },
  ): Promise<T> {
    this.throwIfFailing('revertConditionally');
    const { next, result } = change(structuredClone(this.tasks));

    if (next !== undefined) {
      this.tasks = structuredClone(next);
      this.emit();
    }

    return result;
  }

  async moveToTrash(id: string, deletedAt: Date): Promise<Task | undefined> {
    this.throwIfFailing('moveToTrash');
    const task = this.tasks.find((candidate) => candidate.id === id);

    if (task === undefined) {
      return undefined;
    }

    this.tasks = this.tasks.filter((candidate) => candidate.id !== id);
    this.trash = addToTrash(this.trash, task, deletedAt);
    this.emit();
    this.emitTrash();
    return structuredClone(task);
  }

  async listTrash(now: Date): Promise<TrashItem[]> {
    this.throwIfFailing('listTrash');
    const kept = pruneTrash(this.trash, now);

    if (kept !== this.trash) {
      this.trash = kept;
      this.emitTrash();
    }

    return structuredClone(sortTrashForDisplay(kept));
  }

  async restoreFromTrash(id: string, prepare: (task: Task) => Task): Promise<TrashRestoreResult> {
    this.throwIfFailing('restoreFromTrash');
    const item = this.trash.find((candidate) => candidate.task.id === id);

    if (item === undefined) {
      return { status: 'NOT_IN_TRASH' };
    }

    if (this.tasks.some((task) => task.id === id)) {
      return { status: 'ID_EXISTS' };
    }

    const task = prepare(structuredClone(item.task));
    this.tasks = [...this.tasks, task];
    this.trash = this.trash.filter((candidate) => candidate !== item);
    this.emit();
    this.emitTrash();
    return { status: 'RESTORED', task: structuredClone(task) };
  }

  async deleteFromTrash(id: string): Promise<void> {
    this.throwIfFailing('deleteFromTrash');
    this.trash = this.trash.filter((item) => item.task.id !== id);
    this.emitTrash();
  }

  async emptyTrash(): Promise<void> {
    this.throwIfFailing('emptyTrash');
    this.trash = [];
    this.emitTrash();
  }

  async purgeTrash(now: Date): Promise<void> {
    this.throwIfFailing('purgeTrash');
    const kept = pruneTrash(this.trash, now);

    if (kept !== this.trash) {
      this.trash = kept;
      this.emitTrash();
    }
  }

  subscribeTrash(
    onChange: TrashListener['onChange'],
    onError?: TrashListener['onError'],
  ): () => void {
    const listener: TrashListener = onError ? { onChange, onError } : { onChange };
    this.trashListeners.add(listener);
    return () => this.trashListeners.delete(listener);
  }

  /** Simula uma alteração da lixeira feita por outra superfície. */
  replaceTrashExternally(items: TrashItem[]): void {
    this.trash = structuredClone(items);
    this.emitTrash();
  }

  emitTrashError(error: TaskStorageError): void {
    this.trashListeners.forEach((listener) => listener.onError?.(error));
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

  private emitTrash(): void {
    this.trashListeners.forEach((listener) => listener.onChange(structuredClone(this.trash)));
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
