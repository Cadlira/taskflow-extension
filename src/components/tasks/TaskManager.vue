<script setup lang="ts">
import { computed, inject, nextTick, ref, shallowRef, watch } from 'vue';
import BackupManager from '@/components/backup/BackupManager.vue';
import { pendingCaptureKey } from '@/components/capture/pending-capture-key';
import { usePendingCapture } from '@/components/capture/use-pending-capture';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import TrashManager from '@/components/trash/TrashManager.vue';
import type { RecurrenceCancellation } from '@/application/task-service';
import type { CapturedDraft } from '@/domain/page-capture';
import type { Task, TaskStatus } from '@/domain/task';
import type { TaskDraft, TaskFieldErrors } from '@/domain/task-draft';
import type { Subtask } from '@/domain/task-subtasks';
import { TRASH_RETENTION_DAYS } from '@/domain/task-trash';
import type { UndoPlan } from '@/domain/task-undo';
import { useConnectedTaskStore } from '@/stores/task-store';
import TaskFilters from './TaskFilters.vue';
import TaskForm from './TaskForm.vue';
import TaskList from './TaskList.vue';
import { REMINDERS_PENDING_MESSAGE, STATUS_LABELS } from './task-labels';
import {
  subtaskKey,
  type StatusChangeOrigin,
  type TaskStatusAction,
} from './task-status-origin';

/** Mensagem da listagem; `undo` oferece desfazer a última ação bem-sucedida desta superfície. */
type Feedback = { tone: 'success' | 'warning' | 'error'; text: string; undo?: UndoPlan };
type ListAction = TaskStatusAction | 'delete';

interface PendingListAction {
  taskId: string;
  position: number;
  action: ListAction;
  fromFocusout: boolean;
}

interface PendingRecurrenceCancellation {
  task: Task;
  pending: PendingListAction;
}

const CAPTURE_WAITING_MESSAGE = 'Há uma captura da página aguardando revisão.';

const store = useConnectedTaskStore();
const pendingCaptureInbox = inject(pendingCaptureKey, null);
const { heldCapture, review, discard } = usePendingCapture(pendingCaptureInbox);

const mode = ref<'list' | 'create' | 'edit' | 'backup' | 'trash'>('list');
const editingTask = ref<Task | null>(null);
const capturedDraft = ref<CapturedDraft | null>(null);
const captureNotice = ref<string | null>(null);
const formKey = ref(0);
const formErrors = ref<TaskFieldErrors>({});
const formMessage = ref<string | null>(null);
const saving = ref(false);
// Raso: o plano de desfazer precisa continuar clonável para chegar ao armazenamento.
const feedback = shallowRef<Feedback | null>(null);
const actionError = ref<string | null>(null);
const busyTaskId = ref<string | null>(null);
/** Subtarefas com gravação em andamento; independentes de `busyTaskId`. */
const busySubtaskKeys = ref(new Set<string>());
const pendingDeletion = ref<Task | null>(null);
const deleting = ref(false);
const pendingRecurrenceCancellation = ref<PendingRecurrenceCancellation | null>(null);
const resolvingRecurrence = ref(false);
const pendingFormCancellation = ref<{ task: Task; draft: TaskDraft } | null>(null);
const undoing = ref(false);

const recurrenceActions = [
  { id: 'SKIP', label: 'Pular esta ocorrência', tone: 'secondary' as const },
  { id: 'END', label: 'Encerrar a série', tone: 'danger' as const },
];

const recurrenceDialogMessage = computed(() => {
  const pending = pendingRecurrenceCancellation.value;

  return pending === null
    ? ''
    : `A ocorrência “${pending.task.title}” pertence a uma série. Você quer pular esta ocorrência ou encerrar a série?`;
});

const offerReview = computed(
  () =>
    mode.value === 'list' &&
    pendingDeletion.value === null &&
    pendingRecurrenceCancellation.value === null,
);

const deletionMessage = computed(() => {
  const task = pendingDeletion.value;

  if (!task) {
    return '';
  }

  const base = `A tarefa “${task.title}” irá para a lixeira e poderá ser restaurada por ${TRASH_RETENTION_DAYS} dias.`;

  return task.recurrence === undefined
    ? base
    : `${base} A série será encerrada e nenhuma ocorrência nova será criada.`;
});

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
const trashButton = ref<HTMLButtonElement | null>(null);
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

function openTrash(): void {
  resetMessages();
  store.select(null);
  mode.value = 'trash';
}

async function closeTrash(): Promise<void> {
  mode.value = 'list';
  await nextTick();
  trashButton.value?.focus();
}

async function handleRestored(restoredFeedback: Feedback): Promise<void> {
  mode.value = 'list';
  feedback.value = restoredFeedback;
  await store.load();
  await nextTick();
  backupButton.value?.focus();
}

function successFeedback(remindersPending: boolean, text: string, undo?: UndoPlan): Feedback {
  const feedback: Feedback = remindersPending
    ? { tone: 'warning', text: REMINDERS_PENDING_MESSAGE }
    : { tone: 'success', text };

  return undo === undefined ? feedback : { ...feedback, undo };
}

async function showFormErrors(errors: TaskFieldErrors, message: string | undefined): Promise<void> {
  formErrors.value = errors;
  formMessage.value = message ?? 'Revise os campos destacados.';
  await nextTick();

  if (Object.keys(errors).length > 0) {
    taskForm.value?.focusFirstInvalid();
  } else {
    formMessageAlert.value?.focus();
  }
}

async function submitUpdate(
  task: Task,
  draft: TaskDraft,
  cancellation?: RecurrenceCancellation,
): Promise<void> {
  saving.value = true;
  formMessage.value = null;

  const result = await store.update(task.id, draft, cancellation);
  saving.value = false;

  if (result.ok) {
    await closeForm();
    feedback.value = successFeedback(result.remindersPending, 'Alterações salvas.', result.undo);
    return;
  }

  await showFormErrors(result.errors, result.message);
}

async function handleSubmit(draft: TaskDraft): Promise<void> {
  const editing = editingTask.value;

  if (editing && draft.status === 'CANCELLED' && editing.recurrence !== undefined) {
    pendingFormCancellation.value = { task: editing, draft };
    return;
  }

  if (editing) {
    await submitUpdate(editing, draft);
    return;
  }

  saving.value = true;
  formMessage.value = null;
  const result = await store.create(draft);
  saving.value = false;

  if (result.ok) {
    await closeForm();
    feedback.value = successFeedback(result.remindersPending, 'Tarefa criada.');
    return;
  }

  await showFormErrors(result.errors, result.message);
}

async function resolveFormCancellation(actionId: string): Promise<void> {
  const pending = pendingFormCancellation.value;
  if (!pending) return;

  pendingFormCancellation.value = null;
  await submitUpdate(pending.task, pending.draft, actionId === 'END' ? 'END' : 'SKIP');
}

function abandonFormCancellation(): void {
  pendingFormCancellation.value = null;
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

  if (status === 'CANCELLED' && task.recurrence !== undefined) {
    if (origin.fromFocusout) {
      taskList.value?.resetStatus(task.id);
      return;
    }

    pendingRecurrenceCancellation.value = { task, pending };
    return;
  }

  busyTaskId.value = task.id;
  const result = await store.changeStatus(task.id, status);
  busyTaskId.value = null;

  if (result.ok) {
    feedback.value = successFeedback(
      result.remindersPending,
      `Status de “${task.title}” alterado para ${STATUS_LABELS[status]}.`,
      result.undo,
    );
    await focusAfterListAction(pending);
  } else {
    actionError.value = result.message ?? 'O status não foi alterado.';
    await focusOriginControl(pending);
  }
}

async function resolveRecurrenceCancellation(actionId: string): Promise<void> {
  const pendingCancellation = pendingRecurrenceCancellation.value;
  if (!pendingCancellation) return;

  const { task, pending } = pendingCancellation;
  resolvingRecurrence.value = true;
  const result = await store.changeStatus(
    task.id,
    'CANCELLED',
    actionId === 'END' ? 'END' : 'SKIP',
  );
  resolvingRecurrence.value = false;
  pendingRecurrenceCancellation.value = null;

  if (result.ok) {
    feedback.value = successFeedback(
      result.remindersPending,
      `Status de “${task.title}” alterado para ${STATUS_LABELS.CANCELLED}.`,
      result.undo,
    );
    await focusAfterListAction(pending);
    return;
  }

  actionError.value = result.message ?? 'O status não foi alterado.';
  taskList.value?.resetStatus(task.id);
  await focusOriginControl(pending);
}

async function abandonRecurrenceCancellation(): Promise<void> {
  const pendingCancellation = pendingRecurrenceCancellation.value;
  pendingRecurrenceCancellation.value = null;
  if (!pendingCancellation) return;

  taskList.value?.resetStatus(pendingCancellation.task.id);
  await focusOriginControl(pendingCancellation.pending);
}

async function handleToggleSubtask(task: Task, subtask: Subtask, done: boolean): Promise<void> {
  const key = subtaskKey(task.id, subtask.id);

  if (busySubtaskKeys.value.has(key)) {
    return;
  }

  resetMessages();
  busySubtaskKeys.value = new Set(busySubtaskKeys.value).add(key);
  const result = await store.setSubtaskDone(task.id, subtask.id, done);
  const remaining = new Set(busySubtaskKeys.value);
  remaining.delete(key);
  busySubtaskKeys.value = remaining;

  if (!result.ok) {
    actionError.value = result.message;
  }

  await nextTick();
  taskList.value?.syncSubtask(task.id, subtask.id);
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
    feedback.value = successFeedback(
      false,
      `Tarefa “${task.title}” movida para a lixeira.`,
      result.undo,
    );
    await focusAfterListAction(pending);
  } else {
    actionError.value = result.message;
    await focusOriginControl(pending);
  }
}

/** Foco depois de desfazer: Editar do cartão visível ou a ação principal do estado apresentado. */
async function focusAfterUndo(taskId: string): Promise<void> {
  await nextTick();

  if (store.visibleTasks.some((task) => task.id === taskId)) {
    taskList.value?.focusControl(taskId, 'edit');
  } else if (store.tasks.length === 0) {
    createFirstButton.value?.focus();
  } else if (store.visibleTasks.length === 0) {
    clearFiltersButton.value?.focus();
  } else {
    newTaskButton.value?.focus();
  }
}

async function undoLastAction(): Promise<void> {
  const plan = feedback.value?.undo;

  if (plan === undefined || undoing.value) {
    return;
  }

  undoing.value = true;
  const result = await store.undo(plan);
  undoing.value = false;
  actionError.value = null;
  feedback.value = result.ok
    ? successFeedback(result.remindersPending, `Ação desfeita em “${result.task.title}”.`)
    : { tone: 'error', text: result.message };

  await focusAfterUndo(plan.kind === 'REVERT' ? plan.previous.id : plan.taskId);
}
</script>

<template>
  <main class="task-manager">
    <header v-if="mode !== 'backup' && mode !== 'trash'" class="manager-header">
      <h1>Tarefas</h1>
      <div v-if="mode === 'list'" class="header-actions">
        <button ref="trashButton" type="button" class="button-secondary" @click="openTrash">
          Lixeira
        </button>
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
    <div v-if="feedback?.undo && mode === 'list'" class="undo-offer">
      <button
        type="button"
        class="button-secondary"
        :aria-disabled="undoing ? 'true' : undefined"
        @click="undoLastAction"
      >
        Desfazer
      </button>
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

    <template v-else-if="mode === 'trash'">
      <TrashManager @close="closeTrash" />
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
        <button type="button" class="button-secondary" @click="openTrash">Abrir lixeira</button>
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
            :busy-subtask-keys="busySubtaskKeys"
            @edit="openEdit"
            @change-status="handleChangeStatus"
            @delete="requestDeletion"
            @toggle-subtask="handleToggleSubtask"
          />
        </section>
      </template>
    </template>

    <ConfirmDialog
      v-if="pendingDeletion"
      title="Excluir tarefa?"
      :message="deletionMessage"
      confirm-label="Excluir"
      :busy="deleting"
      @confirm="confirmDeletion"
      @cancel="pendingDeletion = null"
    />

    <ConfirmDialog
      v-if="pendingRecurrenceCancellation"
      title="Cancelar tarefa recorrente?"
      :message="recurrenceDialogMessage"
      :actions="recurrenceActions"
      :busy="resolvingRecurrence"
      @action="resolveRecurrenceCancellation"
      @cancel="abandonRecurrenceCancellation"
    />

    <ConfirmDialog
      v-if="pendingFormCancellation"
      title="Cancelar tarefa recorrente?"
      message="A ocorrência pertence a uma série. Você quer pular esta ocorrência ou encerrar a série?"
      :actions="recurrenceActions"
      :busy="saving"
      @action="resolveFormCancellation"
      @cancel="abandonFormCancellation"
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

.undo-offer {
  display: flex;
  justify-content: flex-start;
  margin-top: -0.5rem;
}

.result-count {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}
</style>
