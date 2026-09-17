import type { Task } from '@/domain/task';
import type { TrashItem } from '@/domain/task-trash';
import type { TaskStorageError, Unsubscribe } from './task-repository';

/** Resultado de devolver um item da lixeira à coleção de tarefas. */
export type TrashRestoreResult =
  | { status: 'RESTORED'; task: Task }
  | { status: 'NOT_IN_TRASH' }
  | { status: 'ID_EXISTS' };

/**
 * Lixeira local das tarefas excluídas. Toda operação relê as chaves envolvidas antes de gravar,
 * nunca sobrescreve dados incompatíveis e move tarefas entre coleção e lixeira em uma única
 * gravação.
 */
export interface TaskTrashRepository {
  /**
   * Remove a tarefa da coleção e a adiciona à lixeira com retenção e limite aplicados. Resolve a
   * tarefa movida ou `undefined`, sem gravar, quando ela não existe.
   */
  moveToTrash(id: string, deletedAt: Date): Promise<Task | undefined>;
  /** Itens dentro do prazo, do mais recente para o mais antigo; grava só se descartou vencidos. */
  listTrash(now: Date): Promise<TrashItem[]>;
  /**
   * Devolve a tarefa à coleção aplicando `prepare`, removendo-a da lixeira. Recusa sem gravar
   * quando o item não está na lixeira ou quando o identificador já existe na coleção.
   */
  restoreFromTrash(id: string, prepare: (task: Task) => Task): Promise<TrashRestoreResult>;
  /** Exclui definitivamente um item da lixeira. */
  deleteFromTrash(id: string): Promise<void>;
  /** Exclui definitivamente todos os itens da lixeira. */
  emptyTrash(): Promise<void>;
  /** Descarta itens vencidos; não grava quando nada venceu. */
  purgeTrash(now: Date): Promise<void>;
  /** Notifica os itens persistidos sempre que a lixeira é alterada. */
  subscribeTrash(
    onChange: (items: TrashItem[]) => void,
    onError?: (error: TaskStorageError) => void,
  ): Unsubscribe;
}
