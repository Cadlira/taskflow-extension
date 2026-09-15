<script setup lang="ts">
import { computed, inject, nextTick, ref, watch } from 'vue';
import BackupManager from '@/components/backup/BackupManager.vue';
import { pendingCaptureKey } from '@/components/capture/pending-capture-key';
import { usePendingCapture } from '@/components/capture/use-pending-capture';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import type { CapturedDraft } from '@/domain/page-capture';
import type { Task, TaskStatus } from '@/domain/task';
import type { TaskDraft, TaskFieldErrors } from '@/domain/task-draft';
import { useConnectedTaskStore } from '@/stores/task-store';
import TaskFilters from './TaskFilters.vue';
import TaskForm from './TaskForm.vue';
import TaskList from './TaskList.vue';
import { REMINDERS_PENDING_MESSAGE, STATUS_LABELS } from './task-labels';
import type { StatusChangeOrigin, TaskStatusAction } from './task-status-origin';

type Feedback = { tone: 'success' | 'warning'; text: string };
type ListAction = TaskStatusAction | 'delete';

interface PendingListAction {
  taskId: string;
  position: number;
  action: ListAction;
  fromFocusout: boolean;
}

const CAPTURE_WAITING_MESSAGE = 'Há uma captura da página aguardando revisão.';

const store = useConnectedTaskStore();
const pendingCaptureInbox = inject(pendingCaptureKey, null);
const { heldCapture, review, discard } = usePendingCapture(pendingCaptureInbox);

const mode = ref<'list' | 'create' | 'edit' | 'backup'>('list');
const editingTask = ref<Task | null>(null);
const capturedDraft = ref<CapturedDraft | null>(null);
const captureNotice = ref<string | null>(null);
const formKey = ref(0);
const formErrors = ref<TaskFieldErrors>({});
const formMessage = ref<string | null>(null);
const saving = ref(false);
const feedback = ref<Feedback | null>(null);
const actionError = ref<string | null>(null);
const busyTaskId = ref<string | null>(null);
const pendingDeletion = ref<Task | null>(null);
const deleting = ref(false);

const offerReview = computed(() => mode.value === 'list' && pendingDeletion.value === null);

watch(heldCapture, (pending) => {
  if (!pending) {
    captureNotice.value = null;
    return;
  }

  if (mode.value === 'list' && pendingDeletion.value === null) {
    const consumed = review();
    if (consumed) openCapturedCreate(consumed.draft);
    return;
  }

  captureNotice.value = CAPTURE_WAITING_MESSAGE;
});

const newTaskButton = ref<HTMLButtonElement | null>(null);
const backupButton = ref<HTMLButtonElement | null>(null);
const retryButton = ref<HTMLButtonElement | null>(null);
const createFirstButton = ref<HTMLButtonElement | null>(null);
const clearFiltersButton = ref<HTMLButtonElement | null>(null);
const taskList = ref<InstanceType<typeof TaskList> | null>(null);
const taskForm = ref<InstanceType<typeof TaskForm> | null>(null);
const formMessageAlert = ref<HTMLElement | null>(null);

watch(retryButton, (button) => button?.focus());

function listPosition(taskId: string): number {
  return store.visibleTasks.findIndex((task) => task.id === taskId);
}

/** Controle equivalente no cartão depois da ação: `complete`/`cancel` levam a `reopen`. */
function equivalentAction(action: ListAction): TaskStatusAction {
  if (action === 'complete' || action === 'cancel') return 'reopen';
  if (action === 'reopen') return 'complete';
  return 'status';
}

async function focusAfterListAction(pending: PendingListAction): Promise<void> {
  await nextTick();

  if (pending.fromFocusout) {
    const active = document.activeElement;
    if (active && active !== document.body && active.isConnected) return;
  }

  const task = store.visibleTasks.find((candidate) => candidate.id === pending.taskId);

  if (task) {
    taskList.value?.focusControl(task.id, equivalentAction(pending.action));
    return;
  }

  const neighbor = store.visibleTasks[pending.position] ?? store.visibleTasks.at(-1);

  if (neighbor) {
    taskList.value?.focusControl(neighbor.id, 'edit');
    return;
  }

  if (store.tasks.length === 0) {
    createFirstButton.value?.focus();
  } else {
    clearFiltersButton.value?.focus();
  }
}

async function focusOriginControl(pending: PendingListAction): Promise<void> {
  await nextTick();
  taskList.value?.focusControl(pending.taskId, pending.action);
}

function resetMessages(): void {
  feedback.value = null;
  actionError.value = null;
  formMessage.value = null;
  formErrors.value = {};
}

function openCreate(): void {
  resetMessages();
  editingTask.value = null;
  capturedDraft.value = null;
  formKey.value += 1;
  store.select(null);
  mode.value = 'create';
}

function openCapturedCreate(draft: CapturedDraft): void {
  resetMessages();
  editingTask.value = null;
  capturedDraft.value = draft;
  formKey.value += 1;
  store.select(null);
  mode.value = 'create';
}

function openEdit(task: Task): void {
  resetMessages();
  editingTask.value = task;
  capturedDraft.value = null;
  formKey.value += 1;
  store.select(task.id);
  mode.value = 'edit';
}

function reviewCapture(): void {
  const consumed = review();
  if (consumed) openCapturedCreate(consumed.draft);
}

function discardCapture(): void {
  discard();
  captureNotice.value = null;
}

async function closeForm(): Promise<void> {
  mode.value = 'list';
  editingTask.value = null;
  capturedDraft.value = null;
  store.select(null);
  formErrors.value = {};
  formMessage.value = null;
  await nextTick();
  newTaskButton.value?.focus();
}

function openBackup(): void {
  resetMessages();
  store.select(null);
  mode.value = 'backup';
}

async function closeBackup(): Promise<void> {
  mode.value = 'list';
  await nextTick();
  backupButton.value?.focus();
}

async function handleRestored(restoredFeedback: Feedback): Promise<void> {
  mode.value = 'list';
  feedback.value = restoredFeedback;
  await store.load();
  await nextTick();
  backupButton.value?.focus();
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
    await nextTick();

    if (Object.keys(result.errors).length > 0) {
      taskForm.value?.focusFirstInvalid();
    } else {
      formMessageAlert.value?.focus();
    }
  }
}

async function handleChangeStatus(
  task: Task,
  status: TaskStatus,
  origin: StatusChangeOrigin,
): Promise<void> {
  resetMessages();
  const pending: PendingListAction = {
    taskId: task.id,
    position: listPosition(task.id),
    action: origin.action,
    fromFocusout: origin.fromFocusout,
  };
  busyTaskId.value = task.id;
  const result = await store.changeStatus(task.id, status);
  busyTaskId.value = null;

  if (result.ok) {
    feedback.value = successFeedback(
      result.remindersPending,
      `Status de “${task.title}” alterado para ${STATUS_LABELS[status]}.`,
    );
    await focusAfterListAction(pending);
  } else {
    actionError.value = result.message ?? 'O status não foi alterado.';
    await focusOriginControl(pending);
  }
}

function requestDeletion(task: Task): void {
  resetMessages();
  pendingDeletion.value = task;
}

async function confirmDeletion(): Promise<void> {
  const task = pendingDeletion.value;
  if (!task) return;

  const pending: PendingListAction = {
    taskId: task.id,
    position: listPosition(task.id),
    action: 'delete',
    fromFocusout: false,
  };
  deleting.value = true;
  const result = await store.remove(task.id);
  deleting.value = false;
  pendingDeletion.value = null;

  if (result.ok) {
    feedback.value = { tone: 'success', text: `Tarefa “${task.title}” excluída.` };
    await focusAfterListAction(pending);
  } else {
    actionError.value = result.message;
    await focusOriginControl(pending);
  }
}
</script>

<template>
  <main class="task-manager">
    <header v-if="mode !== 'backup'" class="manager-header">
      <h1>Tarefas</h1>
      <div v-if="mode === 'list'" class="header-actions">
        <button ref="backupButton" type="button" class="button-secondary" @click="openBackup">
          Backup
        </button>
        <button ref="newTaskButton" type="button" @click="openCreate">Nova tarefa</button>
      </div>
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

    <section class="capture-notice" :class="{ 'capture-notice-visible': captureNotice }">
      <template v-if="captureNotice">
        <p class="feedback feedback-warning">{{ captureNotice }}</p>
        <button v-if="offerReview" type="button" @click="reviewCapture">Revisar captura</button>
        <button type="button" class="button-secondary" @click="discardCapture">
          Descartar captura
        </button>
      </template>
    </section>
    <p class="visually-hidden" role="status">{{ captureNotice }}</p>

    <template v-if="mode === 'backup'">
      <BackupManager @close="closeBackup" @restored="handleRestored" />
    </template>

    <template v-else-if="mode !== 'list'">
      <p v-if="capturedDraft" class="capture-review-note">
        Dados capturados da página. Revise antes de salvar.
      </p>
      <p
        v-if="formMessage"
        ref="formMessageAlert"
        tabindex="-1"
        class="feedback feedback-error"
        role="alert"
      >
        {{ formMessage }}
      </p>
      <TaskForm
        ref="taskForm"
        :key="formKey"
        :task="editingTask"
        :initial-draft="capturedDraft"
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
        <button ref="createFirstButton" type="button" @click="openCreate">
          Criar primeira tarefa
        </button>
        <button type="button" class="button-secondary" @click="openBackup">
          Restaurar backup
        </button>
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
          <button
            ref="clearFiltersButton"
            type="button"
            class="button-secondary"
            @click="store.clearFilters"
          >
            Limpar filtros
          </button>
        </section>

        <section v-else aria-labelledby="task-list-heading">
          <h2 id="task-list-heading" class="visually-hidden">Lista de tarefas</h2>
          <TaskList
            ref="taskList"
            :tasks="store.visibleTasks"
            :now="store.now"
            :busy-task-id="busyTaskId"
            @edit="openEdit"
            @change-status="handleChangeStatus"
            @delete="requestDeletion"
          />
        </section>
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

.header-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
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

.capture-notice {
  display: none;
}

.capture-notice-visible {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
  padding: 0.75rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.9rem;
  background: var(--color-surface);
}

.capture-notice p {
  margin: 0;
}

.capture-review-note {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.85rem;
}

.result-count {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}
</style>
