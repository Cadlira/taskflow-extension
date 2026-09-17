<script setup lang="ts">
import { reactive, ref, watch } from 'vue';
import { isActiveStatus, TASK_STATUSES, type Task, type TaskStatus } from '@/domain/task';
import { getDueSituation } from '@/domain/task-queries';
import { countSubtaskProgress, type Subtask } from '@/domain/task-subtasks';
import { formatDateTime } from './date-time';
import {
  DUE_SITUATION_LABELS,
  PRIORITY_LABELS,
  RECURRENCE_BADGE_LABEL,
  STATUS_LABELS,
  SUBTASKS_TOGGLE_LABEL,
  subtaskProgressLabel,
} from './task-labels';
import {
  subtaskKey,
  type StatusChangeOrigin,
  type TaskStatusAction,
} from './task-status-origin';

const props = defineProps<{
  tasks: readonly Task[];
  now: Date;
  busyTaskId?: string | null;
  /** Subtarefas com gravação em andamento, identificadas por `taskId:subtaskId`. */
  busySubtaskKeys?: ReadonlySet<string>;
}>();

const emit = defineEmits<{
  edit: [task: Task];
  'change-status': [task: Task, status: TaskStatus, origin: StatusChangeOrigin];
  delete: [task: Task];
  'toggle-subtask': [task: Task, subtask: Subtask, done: boolean];
}>();

const listElement = ref<HTMLUListElement | null>(null);

function dueSituation(task: Task) {
  return getDueSituation(task, props.now);
}

/** Foca o controle `action` do cartão `taskId`; devolve se o cartão e o controle existem. */
function focusControl(taskId: string, action: string): boolean {
  const control = listElement.value?.querySelector<HTMLElement>(
    `[data-task-id="${taskId}"] [data-action="${action}"]`,
  );

  if (!control) return false;

  control.focus();
  return true;
}

/** Descarta a escolha pendente do seletor sem gravar, voltando a exibir o status persistido. */
function resetStatus(taskId: string): void {
  pendingStatuses.delete(taskId);
  keyboardNavigations.delete(taskId);
}

/** Tarefas com as subtarefas expandidas; mantido enquanto a superfície estiver aberta. */
const expandedTaskIds = reactive(new Set<string>());

function subtaskListId(task: Task): string {
  return `task-${task.id}-subtasks`;
}

function progressLabel(task: Task): string {
  const { done, total } = countSubtaskProgress(task.subtasks);
  return subtaskProgressLabel(done, total);
}

function toggleSubtasks(task: Task): void {
  if (expandedTaskIds.has(task.id)) {
    expandedTaskIds.delete(task.id);
  } else {
    expandedTaskIds.add(task.id);
  }
}

function isSubtaskBusy(task: Task, subtask: Subtask): boolean {
  return props.busySubtaskKeys?.has(subtaskKey(task.id, subtask.id)) ?? false;
}

function subtaskCheckbox(taskId: string, subtaskId: string): HTMLInputElement | null {
  return (
    listElement.value?.querySelector<HTMLInputElement>(
      `[data-task-id="${taskId}"] [data-subtask-id="${CSS.escape(subtaskId)}"]`,
    ) ?? null
  );
}

/**
 * Faz a caixa refletir a marcação persistida. O foco permanece na caixa; se a subtarefa deixou de
 * existir e o foco se perdeu, ele passa ao controle que expande as subtarefas do mesmo cartão.
 * Um controle focado pelo usuário durante a gravação não perde o foco.
 */
function syncSubtask(taskId: string, subtaskId: string): void {
  const checkbox = subtaskCheckbox(taskId, subtaskId);
  const persisted = props.tasks
    .find((task) => task.id === taskId)
    ?.subtasks.find((subtask) => subtask.id === subtaskId);
  const active = document.activeElement;
  const focusLost = !active || active === document.body || !active.isConnected;

  if (checkbox && persisted) {
    checkbox.checked = persisted.done;
    if (focusLost) checkbox.focus();
    return;
  }

  if (focusLost) focusControl(taskId, 'subtasks');
}

/** Durante a gravação a caixa continua focável, mas ignora novos acionamentos. */
function handleSubtaskClick(task: Task, subtask: Subtask, event: MouseEvent): void {
  if (isSubtaskBusy(task, subtask)) {
    event.preventDefault();
    return;
  }

  emit('toggle-subtask', task, subtask, (event.target as HTMLInputElement).checked);
}

defineExpose({ focusControl, resetStatus, syncSubtask });

function isBusy(task: Task): boolean {
  return props.busyTaskId === task.id;
}

function handleEdit(task: Task): void {
  if (isBusy(task)) return;
  emit('edit', task);
}

function handleQuickStatus(task: Task, status: TaskStatus, action: TaskStatusAction): void {
  if (isBusy(task)) return;
  emit('change-status', task, status, { action, fromFocusout: false });
}

function handleDelete(task: Task): void {
  if (isBusy(task)) return;
  emit('delete', task);
}

const STATUS_NAVIGATION_KEYS = new Set([
  'ArrowUp',
  'ArrowDown',
  'Home',
  'End',
  'PageUp',
  'PageDown',
]);

/** Status escolhido no seletor e ainda não confirmado, por tarefa. */
const pendingStatuses = reactive(new Map<string, TaskStatus>());
/** Tarefas cujo seletor foi percorrido pelo teclado desde a última confirmação. */
const keyboardNavigations = new Set<string>();

watch(
  () => props.tasks,
  () => {
    pendingStatuses.clear();
    keyboardNavigations.clear();
  },
);

watch(
  () => props.busyTaskId,
  (busyTaskId, previousTaskId) => {
    if (previousTaskId && previousTaskId !== busyTaskId) {
      pendingStatuses.delete(previousTaskId);
      keyboardNavigations.delete(previousTaskId);
    }
  },
);

function displayedStatus(task: Task): TaskStatus {
  return pendingStatuses.get(task.id) ?? task.status;
}

function handleStatusSelect(task: Task, event: Event): void {
  const select = event.target as HTMLSelectElement;
  const status = select.value as TaskStatus;

  if (isBusy(task)) {
    select.value = displayedStatus(task);
    return;
  }

  if (status === task.status) {
    pendingStatuses.delete(task.id);
    return;
  }

  pendingStatuses.set(task.id, status);

  if (!keyboardNavigations.has(task.id)) {
    emit('change-status', task, status, { action: 'status', fromFocusout: false });
  }
}

function handleStatusKeydown(task: Task, event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    keyboardNavigations.delete(task.id);
    pendingStatuses.delete(task.id);
    return;
  }

  if (event.key === 'Enter') {
    const pending = pendingStatuses.get(task.id);

    if (pending !== undefined && pending !== task.status && !isBusy(task)) {
      emit('change-status', task, pending, { action: 'status', fromFocusout: false });
    }

    keyboardNavigations.delete(task.id);
    return;
  }

  if (STATUS_NAVIGATION_KEYS.has(event.key)) {
    keyboardNavigations.add(task.id);
  }
}

function handleStatusFocusout(task: Task): void {
  const pending = pendingStatuses.get(task.id);

  if (pending !== undefined && pending !== task.status && !isBusy(task)) {
    pendingStatuses.delete(task.id);
    emit('change-status', task, pending, { action: 'status', fromFocusout: true });
  }

  keyboardNavigations.delete(task.id);
}
</script>

<template>
  <ul ref="listElement" class="task-list">
    <li v-for="task in tasks" :key="task.id" :data-task-id="task.id">
      <article
        class="task-card"
        :class="[`status-${task.status.toLowerCase()}`, dueSituation(task)?.toLowerCase()]"
        :aria-labelledby="`task-${task.id}-title`"
      >
        <header class="task-header">
          <h3 :id="`task-${task.id}-title`">{{ task.title }}</h3>
          <span v-if="task.recurrence" class="badge badge-recurrence" data-test="recurrence-badge">
            {{ RECURRENCE_BADGE_LABEL }}
          </span>
          <span
            v-if="dueSituation(task)"
            class="badge"
            :class="`badge-${dueSituation(task)?.toLowerCase()}`"
            data-test="due-situation"
          >
            {{ DUE_SITUATION_LABELS[dueSituation(task)!] }}
          </span>
        </header>

        <dl class="task-meta">
          <div>
            <dt>Status</dt>
            <dd data-test="status">{{ STATUS_LABELS[task.status] }}</dd>
          </div>
          <div>
            <dt>Prioridade</dt>
            <dd data-test="priority" :class="`priority-${task.priority.toLowerCase()}`">
              {{ PRIORITY_LABELS[task.priority] }}
            </dd>
          </div>
          <div v-if="task.dueAt">
            <dt>Prazo</dt>
            <dd data-test="due-at">
              <time :datetime="task.dueAt">{{ formatDateTime(task.dueAt) }}</time>
            </dd>
          </div>
        </dl>

        <div v-if="task.subtasks.length > 0" class="task-subtasks">
          <button
            type="button"
            class="button-small button-secondary subtasks-toggle"
            data-action="subtasks"
            :aria-expanded="expandedTaskIds.has(task.id) ? 'true' : 'false'"
            :aria-controls="subtaskListId(task)"
            @click="toggleSubtasks(task)"
          >
            {{ SUBTASKS_TOGGLE_LABEL
            }}<span class="visually-hidden"> de {{ task.title }}</span>,
            <span data-test="subtask-progress">{{ progressLabel(task) }}</span>
          </button>

          <ul v-show="expandedTaskIds.has(task.id)" :id="subtaskListId(task)" class="subtask-list">
            <li v-for="subtask in task.subtasks" :key="subtask.id">
              <label class="subtask-checkbox" :class="{ 'subtask-done': subtask.done }">
                <input
                  type="checkbox"
                  :checked="subtask.done"
                  :data-subtask-id="subtask.id"
                  :aria-disabled="isSubtaskBusy(task, subtask) ? 'true' : undefined"
                  @click="handleSubtaskClick(task, subtask, $event)"
                />
                <span>{{ subtask.title }}</span>
              </label>
            </li>
          </ul>
        </div>

        <div class="task-actions">
          <button
            type="button"
            class="button-small button-secondary"
            data-action="edit"
            :aria-disabled="busyTaskId === task.id ? 'true' : undefined"
            @click="handleEdit(task)"
          >
            Editar<span class="visually-hidden"> {{ task.title }}</span>
          </button>

          <template v-if="isActiveStatus(task.status)">
            <button
              type="button"
              class="button-small"
              data-action="complete"
              :aria-disabled="busyTaskId === task.id ? 'true' : undefined"
              @click="handleQuickStatus(task, 'DONE', 'complete')"
            >
              Concluir<span class="visually-hidden"> {{ task.title }}</span>
            </button>
            <button
              type="button"
              class="button-small button-secondary"
              data-action="cancel"
              :aria-disabled="busyTaskId === task.id ? 'true' : undefined"
              @click="handleQuickStatus(task, 'CANCELLED', 'cancel')"
            >
              Cancelar tarefa<span class="visually-hidden"> {{ task.title }}</span>
            </button>
          </template>
          <button
            v-else
            type="button"
            class="button-small button-secondary"
            data-action="reopen"
            :aria-disabled="busyTaskId === task.id ? 'true' : undefined"
            @click="handleQuickStatus(task, 'TODO', 'reopen')"
          >
            Reabrir<span class="visually-hidden"> {{ task.title }}</span>
          </button>

          <label class="status-select">
            <span class="visually-hidden">Alterar status de {{ task.title }}</span>
            <select
              :value="displayedStatus(task)"
              data-action="status"
              :aria-disabled="busyTaskId === task.id ? 'true' : undefined"
              @keydown="handleStatusKeydown(task, $event)"
              @focusout="handleStatusFocusout(task)"
              @change="handleStatusSelect(task, $event)"
            >
              <option v-for="status in TASK_STATUSES" :key="status" :value="status">
                {{ STATUS_LABELS[status] }}
              </option>
            </select>
          </label>

          <button
            type="button"
            class="button-small button-danger"
            data-action="delete"
            :aria-disabled="busyTaskId === task.id ? 'true' : undefined"
            @click="handleDelete(task)"
          >
            Excluir<span class="visually-hidden"> {{ task.title }}</span>
          </button>
        </div>
      </article>
    </li>
  </ul>
</template>

<style scoped>
.task-list {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.task-card {
  display: grid;
  gap: 0.6rem;
  padding: 0.9rem;
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-border-strong);
  border-radius: 0.8rem;
  background: var(--color-surface);
}

.task-card.overdue {
  border-left-color: var(--color-danger);
}

.task-card.due_soon {
  border-left-color: #dc6803;
}

.task-card.status-done h3,
.task-card.status-cancelled h3 {
  text-decoration: line-through;
}

.task-header {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.task-header h3 {
  margin: 0;
  font-size: 0.98rem;
  overflow-wrap: anywhere;
}

.badge {
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
}

.badge-overdue {
  color: #ffffff;
  background: var(--color-danger);
}

.badge-due_soon {
  color: #7a2e0e;
  background: #fef0c7;
}

.badge-recurrence {
  color: var(--color-primary-strong);
  background: var(--color-primary-soft);
}

.task-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem 1rem;
  margin: 0;
  font-size: 0.8rem;
}

.task-meta div {
  display: flex;
  gap: 0.3rem;
}

.task-meta dt {
  color: var(--color-muted);
}

.task-meta dd {
  margin: 0;
  font-weight: 600;
}

.priority-urgent {
  color: var(--color-danger);
}

.task-subtasks {
  display: grid;
  gap: 0.4rem;
  justify-items: start;
}

.subtask-list {
  display: grid;
  gap: 0.3rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.subtask-checkbox {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  font-size: 0.85rem;
  font-weight: 400;
  overflow-wrap: anywhere;
}

.subtask-checkbox input {
  flex: none;
  width: auto;
  margin-top: 0.15rem;
}

.subtask-done span {
  color: var(--color-muted);
  text-decoration: line-through;
}

.task-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.status-select select {
  width: auto;
  padding: 0.35rem 0.5rem;
  font-size: 0.8rem;
}
</style>
