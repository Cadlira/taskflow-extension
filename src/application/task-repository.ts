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

/** Ocorrência de lembrete a registrar de forma condicional nos dados mais recentes. */
export interface ReminderOccurrenceClaim {
  taskId: string;
  reminderId: string;
  /** Instante efetivo (ISO 8601 UTC) que deve ser registrado como processado. */
  processedFor: string;
}

/** Fonte persistente de tarefas. Implementações não devem expor detalhes do mecanismo local. */
export interface TaskRepository {
  list(): Promise<Task[]>;
  get(id: string): Promise<Task | undefined>;
  /** Cria ou substitui a tarefa com o mesmo `id`. */
  save(task: Task): Promise<void>;
  /** Cria ou substitui várias tarefas em uma única gravação; falha sem persistir nenhuma. */
  saveMany(tasks: Task[]): Promise<void>;
  /** Substitui toda a coleção em uma única gravação. Nunca sobrescreve dados incompatíveis. */
  replaceAll(tasks: Task[]): Promise<void>;
  delete(id: string): Promise<void>;
  /**
   * Relê a tarefa e registra `processedFor` somente se a mesma ocorrência ainda estiver válida e
   * pendente. Resolve `true` quando a gravação foi aplicada; `false` sem gravar caso contrário.
   */
  claimReminderOccurrence(claim: ReminderOccurrenceClaim): Promise<boolean>;
  /**
   * Relê a tarefa e aplica `change` sobre a versão persistida mais recente, sem sobrescrever
   * alterações concorrentes dos demais campos. Grava somente quando `change` devolve uma nova
   * instância e resolve a tarefa gravada; resolve `undefined` sem gravar quando a tarefa não existe
   * ou `change` devolve `undefined` ou a mesma instância.
   */
  updateTaskConditionally(
    id: string,
    change: (task: Task) => Task | undefined,
  ): Promise<Task | undefined>;
  /** Notifica a coleção atualizada sempre que outra operação altera os dados persistidos. */
  subscribe(
    onChange: (tasks: Task[]) => void,
    onError?: (error: TaskStorageError) => void,
  ): Unsubscribe;
}
