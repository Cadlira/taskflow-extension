<script setup lang="ts">
import { isActiveStatus, TASK_STATUSES, type Task, type TaskStatus } from '@/domain/task';
import { getDueSituation } from '@/domain/task-queries';
import { formatDateTime } from './date-time';
import { DUE_SITUATION_LABELS, PRIORITY_LABELS, STATUS_LABELS } from './task-labels';

const props = defineProps<{
  tasks: readonly Task[];
  now: Date;
  busyTaskId?: string | null;
}>();

const emit = defineEmits<{
  edit: [task: Task];
  'change-status': [task: Task, status: TaskStatus];
  delete: [task: Task];
}>();

function dueSituation(task: Task) {
  return getDueSituation(task, props.now);
}

function handleStatusSelect(task: Task, event: Event): void {
  const status = (event.target as HTMLSelectElement).value as TaskStatus;

  if (status !== task.status) {
    emit('change-status', task, status);
  }
}
</script>

<template>
  <ul class="task-list">
    <li v-for="task in tasks" :key="task.id" :data-task-id="task.id">
      <article
        class="task-card"
        :class="[`status-${task.status.toLowerCase()}`, dueSituation(task)?.toLowerCase()]"
        :aria-labelledby="`task-${task.id}-title`"
      >
        <header class="task-header">
          <h3 :id="`task-${task.id}-title`">{{ task.title }}</h3>
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

        <div class="task-actions">
          <button
            type="button"
            class="button-small button-secondary"
            :disabled="busyTaskId === task.id"
            @click="emit('edit', task)"
          >
            Editar<span class="visually-hidden"> {{ task.title }}</span>
          </button>

          <template v-if="isActiveStatus(task.status)">
            <button
              type="button"
              class="button-small"
              :disabled="busyTaskId === task.id"
              @click="emit('change-status', task, 'DONE')"
            >
              Concluir<span class="visually-hidden"> {{ task.title }}</span>
            </button>
            <button
              type="button"
              class="button-small button-secondary"
              :disabled="busyTaskId === task.id"
              @click="emit('change-status', task, 'CANCELLED')"
            >
              Cancelar tarefa<span class="visually-hidden"> {{ task.title }}</span>
            </button>
          </template>
          <button
            v-else
            type="button"
            class="button-small button-secondary"
            :disabled="busyTaskId === task.id"
            @click="emit('change-status', task, 'TODO')"
          >
            Reabrir<span class="visually-hidden"> {{ task.title }}</span>
          </button>

          <label class="status-select">
            <span class="visually-hidden">Alterar status de {{ task.title }}</span>
            <select
              :value="task.status"
              :disabled="busyTaskId === task.id"
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
            :disabled="busyTaskId === task.id"
            @click="emit('delete', task)"
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

.task-card.status-done,
.task-card.status-cancelled {
  opacity: 0.8;
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
