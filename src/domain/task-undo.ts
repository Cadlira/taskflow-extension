import type { Task } from './task';
import { settleElapsedReminders } from './task-reminders';

/** Reversão de uma alteração de status ou edição salva, condicionada à versão produzida pela ação. */
export interface RevertPlan {
  kind: 'REVERT';
  /** Versão persistida imediatamente antes da ação. */
  previous: Task;
  /** `updatedAt` produzido pela ação. */
  expectedUpdatedAt: string;
  /** Ocorrência criada pela ação, removida junto com a reversão. */
  generated?: { id: string; updatedAt: string };
}

/** Descrição pura do que desfazer; existe somente em memória. */
export type UndoPlan = { kind: 'RESTORE_FROM_TRASH'; taskId: string } | RevertPlan;

export type RevertRefusal = 'CHANGED' | 'REMOVED' | 'GENERATED_CHANGED';

export type RevertOutcome =
  | { ok: true; tasks: Task[]; reverted: Task }
  | { ok: false; reason: RevertRefusal };

/**
 * Aplica o plano sobre a coleção mais recente. A condição usa `updatedAt`, que o processamento de
 * lembretes não altera. A tarefa revertida recebe novo `updatedAt` e tem os lembretes vencidos
 * marcados como processados; a ocorrência gerada sai da coleção sem ir para a lixeira.
 */
export function revertTasks(tasks: Task[], plan: RevertPlan, now: Date): RevertOutcome {
  const index = tasks.findIndex((task) => task.id === plan.previous.id);
  const current = tasks[index];

  if (current === undefined) {
    return { ok: false, reason: 'REMOVED' };
  }

  if (current.updatedAt !== plan.expectedUpdatedAt) {
    return { ok: false, reason: 'CHANGED' };
  }

  const { generated } = plan;

  if (
    generated !== undefined &&
    !tasks.some((task) => task.id === generated.id && task.updatedAt === generated.updatedAt)
  ) {
    return { ok: false, reason: 'GENERATED_CHANGED' };
  }

  const reverted = settleElapsedReminders(
    { ...plan.previous, updatedAt: now.toISOString() },
    now,
  );
  const next = tasks
    .with(index, reverted)
    .filter((task) => generated === undefined || task.id !== generated.id);

  return { ok: true, tasks: next, reverted };
}
