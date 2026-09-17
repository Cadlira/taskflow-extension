<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { TaskStorageError } from '@/application/task-repository';
import type { TrashService } from '@/application/trash-service';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { formatDateTime } from '@/components/tasks/date-time';
import { TRASH_RETENTION_DAYS, type TrashItem } from '@/domain/task-trash';
import { trashServiceKey } from './trash-service-key';

type Feedback = { tone: 'success' | 'warning'; text: string };
type State = 'loading' | 'ready' | 'incompatible' | 'unavailable';
type ItemAction = 'restore' | 'delete';

const INCOMPATIBLE_MESSAGE =
  'A lixeira não pôde ser lida porque está em um formato incompatível. Os dados foram preservados e nenhuma alteração foi feita.';

const emit = defineEmits<{ close: [] }>();

function injectTrashService(): TrashService {
  const injected = inject(trashServiceKey);
  if (!injected) {
    throw new Error('TrashService não foi fornecido para a aplicação.');
  }

  return injected;
}

const service = injectTrashService();

const state = ref<State>('loading');
const items = shallowRef<TrashItem[]>([]);
const loadError = ref<string | null>(null);
const feedback = ref<Feedback | null>(null);
const actionError = ref<string | null>(null);
const busy = ref(false);
const pendingDeletion = ref<TrashItem | null>(null);
const emptyConfirmOpen = ref(false);

const heading = ref<HTMLElement | null>(null);
const backButton = ref<HTMLButtonElement | null>(null);
const listElement = ref<HTMLElement | null>(null);
const actionAlert = ref<HTMLElement | null>(null);

const deletionMessage = computed(() =>
  pendingDeletion.value === null
    ? ''
    : `A tarefa “${pendingDeletion.value.task.title}” será excluída definitivamente. Esta ação não pode ser desfeita.`,
);

const emptyMessage = computed(() => {
  const count = items.value.length;
  const subject = count === 1 ? 'A tarefa da lixeira será excluída' : `As ${count} tarefas da lixeira serão excluídas`;
  return `${subject} definitivamente. Esta ação não pode ser desfeita.`;
});

function applyFailure(error: unknown): void {
  if (error instanceof TaskStorageError && error.reason === 'INCOMPATIBLE_DATA') {
    state.value = 'incompatible';
    return;
  }

  state.value = 'unavailable';
  loadError.value =
    error instanceof TaskStorageError
      ? `Não foi possível carregar a lixeira. ${error.message}`
      : 'Não foi possível carregar a lixeira.';
}

async function load(): Promise<void> {
  loadError.value = null;

  try {
    items.value = await service.list();
    state.value = 'ready';
  } catch (error) {
    applyFailure(error);
  }
}

let unsubscribe: (() => void) | null = null;

onMounted(() => {
  heading.value?.focus();
  unsubscribe = service.subscribe(
    (next) => {
      items.value = next;
      state.value = 'ready';
    },
    (error) => {
      state.value = error.reason === 'INCOMPATIBLE_DATA' ? 'incompatible' : state.value;
    },
  );
  void load();
});

onBeforeUnmount(() => {
  unsubscribe?.();
});

function resetMessages(): void {
  feedback.value = null;
  actionError.value = null;
}

function itemPosition(item: TrashItem): number {
  return items.value.findIndex((candidate) => candidate.task.id === item.task.id);
}

async function focusItemAction(taskId: string, action: ItemAction): Promise<void> {
  await nextTick();
  listElement.value
    ?.querySelector<HTMLElement>(`[data-trash-task-id="${taskId}"] [data-action="${action}"]`)
    ?.focus();
}

/** Após remover um item: Restaurar do item na mesma posição, do novo último ou Voltar. */
async function focusAfterRemoval(position: number): Promise<void> {
  const next = items.value[position] ?? items.value.at(-1);

  if (next) {
    await focusItemAction(next.task.id, 'restore');
    return;
  }

  await nextTick();
  backButton.value?.focus();
}

async function showActionError(message: string, focus: () => Promise<void>): Promise<void> {
  actionError.value = message;
  await focus();
}

function describeStorageFailure(prefix: string, error: unknown): string {
  return error instanceof TaskStorageError ? `${prefix} ${error.message}` : prefix;
}

async function restore(item: TrashItem): Promise<void> {
  if (busy.value) return;

  resetMessages();
  const { title, id } = item.task;
  const position = itemPosition(item);
  busy.value = true;

  try {
    const result = await service.restore(id);

    if (result.status === 'RESTORED') {
      items.value = await service.list();
      feedback.value = result.remindersPending
        ? {
            tone: 'warning',
            text: `Tarefa “${title}” restaurada, mas os lembretes ficaram pendentes. O TaskFlow tentará agendá-los novamente ao reiniciar a extensão ou ao salvar a tarefa.`,
          }
        : { tone: 'success', text: `Tarefa “${title}” restaurada.` };
      await focusAfterRemoval(position);
      return;
    }

    if (result.status === 'ID_EXISTS') {
      await showActionError(
        `A tarefa “${title}” não foi restaurada porque já existe na listagem. O item continua na lixeira.`,
        () => focusItemAction(id, 'restore'),
      );
      return;
    }

    items.value = await service.list();
    await showActionError(`A tarefa “${title}” não está mais na lixeira.`, () =>
      focusAfterRemoval(position),
    );
  } catch (error) {
    await showActionError(
      describeStorageFailure(`A tarefa “${title}” não foi restaurada.`, error),
      () => focusItemAction(id, 'restore'),
    );
  } finally {
    busy.value = false;
  }
}

function requestDeletion(item: TrashItem): void {
  resetMessages();
  pendingDeletion.value = item;
}

async function confirmDeletion(): Promise<void> {
  const item = pendingDeletion.value;
  if (!item || busy.value) return;

  const position = itemPosition(item);
  busy.value = true;

  try {
    await service.deletePermanently(item.task.id);
    items.value = await service.list();
    pendingDeletion.value = null;
    feedback.value = { tone: 'success', text: `Tarefa “${item.task.title}” excluída definitivamente.` };
    await focusAfterRemoval(position);
  } catch (error) {
    pendingDeletion.value = null;
    await showActionError(
      describeStorageFailure(`A tarefa “${item.task.title}” não foi excluída.`, error),
      () => focusItemAction(item.task.id, 'delete'),
    );
  } finally {
    busy.value = false;
  }
}

function requestEmpty(): void {
  resetMessages();
  emptyConfirmOpen.value = true;
}

async function confirmEmpty(): Promise<void> {
  if (busy.value) return;

  busy.value = true;

  try {
    await service.empty();
    items.value = await service.list();
    emptyConfirmOpen.value = false;
    feedback.value = { tone: 'success', text: 'Lixeira esvaziada.' };
    await nextTick();
    backButton.value?.focus();
  } catch (error) {
    emptyConfirmOpen.value = false;
    actionError.value = describeStorageFailure('A lixeira não foi esvaziada.', error);
    await nextTick();
    actionAlert.value?.focus();
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="trash-manager">
    <header class="trash-header">
      <h1 ref="heading" tabindex="-1">Lixeira</h1>
      <button ref="backButton" type="button" class="button-secondary" @click="emit('close')">
        Voltar
      </button>
    </header>

    <div aria-live="polite" class="live-region">
      <p v-if="feedback" class="feedback" :class="`feedback-${feedback.tone}`">
        {{ feedback.text }}
      </p>
    </div>
    <p
      v-if="actionError"
      ref="actionAlert"
      tabindex="-1"
      class="feedback feedback-error"
      role="alert"
    >
      {{ actionError }}
    </p>

    <p v-if="state === 'loading'" class="state" role="status">Carregando lixeira…</p>

    <section v-else-if="state === 'incompatible'" class="state state-error" role="alert">
      <p>{{ INCOMPATIBLE_MESSAGE }}</p>
    </section>

    <section v-else-if="state === 'unavailable'" class="state state-error" role="alert">
      <p>{{ loadError }}</p>
      <button type="button" @click="load">Tentar novamente</button>
    </section>

    <section v-else-if="items.length === 0" class="state">
      <h2>A lixeira está vazia</h2>
      <p>Tarefas excluídas ficam disponíveis aqui por {{ TRASH_RETENTION_DAYS }} dias.</p>
    </section>

    <template v-else>
      <p class="trash-note">
        Tarefas excluídas ficam disponíveis por {{ TRASH_RETENTION_DAYS }} dias e depois são
        removidas definitivamente.
      </p>
      <ul ref="listElement" class="trash-list" aria-label="Tarefas na lixeira">
        <li
          v-for="item in items"
          :key="item.task.id"
          class="trash-item"
          :data-trash-task-id="item.task.id"
          :aria-labelledby="`trash-${item.task.id}-title`"
        >
          <h2 :id="`trash-${item.task.id}-title`" class="trash-item-title">
            {{ item.task.title }}
          </h2>
          <p class="trash-item-date">Excluída em {{ formatDateTime(item.deletedAt) }}</p>
          <div class="trash-item-actions">
            <button
              type="button"
              data-action="restore"
              :aria-disabled="busy ? 'true' : undefined"
              @click="restore(item)"
            >
              Restaurar
            </button>
            <button
              type="button"
              class="button-danger"
              data-action="delete"
              :aria-disabled="busy ? 'true' : undefined"
              @click="busy || requestDeletion(item)"
            >
              Excluir definitivamente
            </button>
          </div>
        </li>
      </ul>
      <button
        type="button"
        class="button-danger trash-empty"
        :aria-disabled="busy ? 'true' : undefined"
        @click="busy || requestEmpty()"
      >
        Esvaziar lixeira
      </button>
    </template>

    <ConfirmDialog
      v-if="pendingDeletion"
      title="Excluir definitivamente?"
      :message="deletionMessage"
      confirm-label="Excluir definitivamente"
      :busy="busy"
      @confirm="confirmDeletion"
      @cancel="pendingDeletion = null"
    />

    <ConfirmDialog
      v-if="emptyConfirmOpen"
      title="Esvaziar lixeira?"
      :message="emptyMessage"
      confirm-label="Esvaziar lixeira"
      :busy="busy"
      @confirm="confirmEmpty"
      @cancel="emptyConfirmOpen = false"
    />
  </section>
</template>

<style scoped>
.trash-manager {
  display: grid;
  gap: 1rem;
}

.trash-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.trash-header h1 {
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

.trash-note {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.85rem;
}

.trash-list {
  display: grid;
  gap: 0.75rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.trash-item {
  display: grid;
  gap: 0.5rem;
  padding: 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 0.8rem;
  background: var(--color-surface);
}

.trash-item-title {
  margin: 0;
  font-size: 1rem;
  overflow-wrap: anywhere;
}

.trash-item-date {
  margin: 0;
  color: var(--color-muted);
  font-size: 0.8rem;
}

.trash-item-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.trash-empty {
  justify-self: start;
}
</style>
