import type { Clock } from '@/domain/task';
import { pruneTrash, sortTrashForDisplay, type TrashItem } from '@/domain/task-trash';
import type { TaskStorageError, Unsubscribe } from './task-repository';
import type { TaskService } from './task-service';
import type { TaskTrashRepository } from './task-trash-repository';

export interface TrashServiceDependencies {
  trash: TaskTrashRepository;
  /** Restauração com reconciliação de lembretes; deve usar o mesmo repository de `trash`. */
  tasks: Pick<TaskService, 'restoreFromTrash'>;
  clock: Clock;
}

/** Casos de uso da área da lixeira. Falhas de persistência são propagadas como exceção. */
export function createTrashService({ trash, tasks, clock }: TrashServiceDependencies) {
  return {
    /** Itens dentro do prazo, do mais recente para o mais antigo, descartando os vencidos. */
    list: (): Promise<TrashItem[]> => trash.listTrash(clock()),

    restore: (id: string) => tasks.restoreFromTrash(id),

    deletePermanently: (id: string): Promise<void> => trash.deleteFromTrash(id),

    empty: (): Promise<void> => trash.emptyTrash(),

    /** Descarta itens vencidos sem que a área da lixeira seja aberta. */
    purge: (): Promise<void> => trash.purgeTrash(clock()),

    /** Notifica os itens apresentáveis sempre que a lixeira é alterada em qualquer superfície. */
    subscribe(
      onChange: (items: TrashItem[]) => void,
      onError?: (error: TaskStorageError) => void,
    ): Unsubscribe {
      return trash.subscribeTrash(
        (items) => onChange(sortTrashForDisplay(pruneTrash(items, clock()))),
        onError,
      );
    },
  };
}

export type TrashService = ReturnType<typeof createTrashService>;
