import type { Task } from '@/domain/task';

export type TaskStorageErrorReason = 'INCOMPATIBLE_DATA' | 'UNAVAILABLE';

export class TaskStorageError extends Error {
  readonly reason: TaskStorageErrorReason;

  constructor(reason: TaskStorageErrorReason, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TaskStorageError';
    this.reason = reason;
  }
}

export type Unsubscribe = () => void;

/** Fonte persistente de tarefas. Implementações não devem expor detalhes do mecanismo local. */
export interface TaskRepository {
  list(): Promise<Task[]>;
  get(id: string): Promise<Task | undefined>;
  /** Cria ou substitui a tarefa com o mesmo `id`. */
  save(task: Task): Promise<void>;
  /** Substitui toda a coleção em uma única gravação. Nunca sobrescreve dados incompatíveis. */
  replaceAll(tasks: Task[]): Promise<void>;
  delete(id: string): Promise<void>;
  /** Notifica a coleção atualizada sempre que outra operação altera os dados persistidos. */
  subscribe(
    onChange: (tasks: Task[]) => void,
    onError?: (error: TaskStorageError) => void,
  ): Unsubscribe;
}
