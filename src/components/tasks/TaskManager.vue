<script setup lang="ts">
import { nextTick, ref, watch } from 'vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import type { Task, TaskStatus } from '@/domain/task';
import type { TaskDraft, TaskFieldErrors } from '@/domain/task-draft';
import { useConnectedTaskStore } from '@/stores/task-store';
import TaskFilters from './TaskFilters.vue';
import TaskForm from './TaskForm.vue';
import TaskList from './TaskList.vue';
import { REMINDERS_PENDING_MESSAGE, STATUS_LABELS } from './task-labels';

type Feedback = { tone: 'success' | 'warning'; text: string };

const store = useConnectedTaskStore();

const mode = ref<'list' | 'create' | 'edit'>('list');
const editingTask = ref<Task | null>(null);
const formErrors = ref<TaskFieldErrors>({});
const formMessage = ref<string | null>(null);
const saving = ref(false);
const feedback = ref<Feedback | null>(null);
const actionError = ref<string | null>(null);
const busyTaskId = ref<string | null>(null);
const pendingDeletion = ref<Task | null>(null);
const deleting = ref(false);

const newTaskButton = ref<HTMLButtonElement | null>(null);
const retryButton = ref<HTMLButtonElement | null>(null);

watch(retryButton, (button) => button?.focus());

function resetMessages(): void {
  feedback.value = null;
  actionError.value = null;
  formMessage.value = null;
  formErrors.value = {};
}

function openCreate(): void {
  resetMessages();
  editingTask.value = null;
  store.select(null);
  mode.value = 'create';
}

function openEdit(task: Task): void {
  resetMessages();
  editingTask.value = task;
  store.select(task.id);
  mode.value = 'edit';
}

async function closeForm(): Promise<void> {
  mode.value = 'list';
  editingTask.value = null;
  store.select(null);
  formErrors.value = {};
  formMessage.value = null;
  await nextTick();
  newTaskButton.value?.focus();
}

function successFeedback(remindersPending: boolean, text: string): Feedback {
  return remindersPending
    ? { tone: 'warning', text: REMINDERS_PENDING_MESSAGE }
    : { tone: 'success', text };
}

async function handleSubmit(draft: TaskDraft): Promise<void> {
  saving.value = true;
  formMessage.value = null;

  const editing = editingTask.value;
  const result = editing ? await store.update(editing.id, draft) : await store.create(draft);
  saving.value = false;

  if (result.ok) {
    await closeForm();
    feedback.value = successFeedback(
      result.remindersPending,
      editing ? 'Alterações salvas.' : 'Tarefa criada.',
    );
  } else {
    formErrors.value = result.errors;
    formMessage.value = result.message ?? 'Revise os campos destacados.';
  }
}

async function handleChangeStatus(task: Task, status: TaskStatus): Promise<void> {
  resetMessages();
  busyTaskId.value = task.id;
  const result = await store.changeStatus(task.id, status);
  busyTaskId.value = null;

  if (result.ok) {
    feedback.value = successFeedback(
      result.remindersPending,
      `Status de “${task.title}” alterado para ${STATUS_LABELS[status]}.`,
    );
  } else {
    actionError.value = result.message ?? 'O status não foi alterado.';
  }
}

function requestDeletion(task: Task): void {
  resetMessages();
  pendingDeletion.value = task;
}

async function confirmDeletion(): Promise<void> {
  const task = pendingDeletion.value;
  if (!task) return;

  deleting.value = true;
  const result = await store.remove(task.id);
  deleting.value = false;
  pendingDeletion.value = null;

  if (result.ok) {
    feedback.value = { tone: 'success', text: `Tarefa “${task.title}” excluída.` };
  } else {
    actionError.value = result.message;
  }
}
</script>

<template>
  <main class="task-manager">
    <header class="manager-header">
      <h1>Tarefas</h1>
      <button v-if="mode === 'list'" ref="newTaskButton" type="button" @click="openCreate">
        Nova tarefa
      </button>
    </header>

    <div aria-live="polite" class="live-region">
      <p v-if="feedback" class="feedback" :class="`feedback-${feedback.tone}`">
        {{ feedback.text }}
      </p>
    </div>
    <p v-if="actionError" class="feedback feedback-error" role="alert">{{ actionError }}</p>
    <p v-if="store.syncError" class="feedback feedback-error" role="alert">
      {{ store.syncError }}
    </p>

    <template v-if="mode !== 'list'">
      <p v-if="formMessage" class="feedback feedback-error" role="alert">{{ formMessage }}</p>
      <TaskForm
        :key="editingTask?.id ?? 'new'"
        :task="editingTask"
        :errors="formErrors"
        :saving="saving"
        @submit="handleSubmit"
        @cancel="closeForm"
      />
    </template>

    <template v-else>
      <p v-if="!store.loaded && !store.loadError" class="state" role="status">
        Carregando tarefas…
      </p>

      <section v-else-if="store.loadError && !store.loaded" class="state state-error" role="alert">
        <p>{{ store.loadError }}</p>
        <button ref="retryButton" type="button" :disabled="store.loading" @click="store.load()">
          Tentar novamente
        </button>
      </section>

      <section v-else-if="store.loaded && store.tasks.length === 0" class="state">
        <h2>Nenhuma tarefa ainda</h2>
        <p>Crie sua primeira tarefa para começar a organizar o que precisa ser feito.</p>
        <button type="button" @click="openCreate">Criar primeira tarefa</button>
      </section>

      <template v-else-if="store.loaded">
        <TaskFilters
          :filters="store.filters"
          :sort-key="store.sortKey"
          :has-active-filters="store.hasActiveFilters"
          @update:filters="store.setFilters"
          @update:sort-key="store.setSortKey"
          @clear="store.clearFilters"
        />

        <p class="result-count" role="status">
          {{ store.visibleTasks.length }} de {{ store.tasks.length }}
          {{ store.tasks.length === 1 ? 'tarefa' : 'tarefas' }}
        </p>

        <section v-if="store.visibleTasks.length === 0" class="state">
          <h2>Nenhuma tarefa encontrada</h2>
          <p>Nenhuma tarefa corresponde à pesquisa e aos filtros atuais.</p>
          <button type="button" class="button-secondary" @click="store.clearFilters">
            Limpar filtros
          </button>
        </section>

        <TaskList
          v-else
          :tasks="store.visibleTasks"
          :now="store.now"
          :busy-task-id="busyTaskId"
          @edit="openEdit"
          @change-status="handleChangeStatus"
          @delete="requestDeletion"
        />
      </template>
    </template>

    <ConfirmDialog
      v-if="pendingDeletion"
      title="Excluir tarefa?"
      :message="`A tarefa “${pendingDeletion.title}” será excluída definitivamente.`"
      confirm-label="Excluir"
      :busy="deleting"
      @confirm="confirmDeletion"
      @cancel="pendingDeletion = null"
    />
  </main>
</template>

<style scoped>
.task-manager {
  display: grid;
  gap: 1rem;
  padding: 1.25rem;
}

.manager-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.manager-header h1 {
  margin: 0;
  font-size: 1.35rem;
}

.live-region:empty {
  position: absolute;
}

.state {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
  margin: 0;
  padding: 1rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.9rem;
  background: var(--color-surface);
}

.state h2,
.state p {
  margin: 0;
}

.state h2 {
  font-size: 1rem;
}

.state p {
  color: var(--color-muted);
  line-height: 1.45;
}

.state-error {
  border-color: var(--color-danger);
}

.state-error p {
  color: var(--color-danger);
}

.result-count {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}
</style>
