<script setup lang="ts">
import { nextTick, onMounted, reactive, ref, useId } from 'vue';
import { openTaskManager, type TaskManagerNavigator } from '@/application/open-task-manager';
import { captureActivePage, type ActivePageReader } from '@/application/page-capture';
import { fromLocalDateTimeInput } from '@/components/tasks/date-time';
import { PRIORITY_LABELS } from '@/components/tasks/task-labels';
import { TASK_PRIORITIES, type TaskPriority } from '@/domain/task';
import { TASK_LIMITS, type TaskFieldErrors } from '@/domain/task-draft';
import { useTaskStore } from '@/stores/task-store';

type QuickAddField = 'title' | 'dueAt' | 'requester' | 'assignee' | 'priority' | 'sourceUrl';

const props = defineProps<{ navigator: TaskManagerNavigator; pageReader: ActivePageReader }>();
const emit = defineEmits<{ 'manager-opened': [] }>();

const store = useTaskStore();
const id = useId();
const titleInput = ref<HTMLInputElement | null>(null);
const formElement = ref<HTMLFormElement | null>(null);
const failureAlert = ref<HTMLElement | null>(null);
const captureButton = ref<HTMLButtonElement | null>(null);

function emptyForm() {
  return {
    title: '',
    dueAt: '',
    requester: '',
    assignee: '',
    priority: 'MEDIUM' as TaskPriority,
    sourceUrl: '',
  };
}

const form = reactive(emptyForm());
const showSourceUrl = ref(false);
const errors = ref<TaskFieldErrors>({});
const saving = ref(false);
const success = ref<string | null>(null);
const failure = ref<string | null>(null);

function fieldId(field: QuickAddField): string {
  return `${id}-${field}`;
}

function errorProps(field: QuickAddField) {
  return {
    'aria-invalid': Boolean(errors.value[field]),
    'aria-describedby': errors.value[field] ? `${fieldId(field)}-error` : undefined,
  };
}

async function handleSubmit(): Promise<void> {
  if (saving.value) return;

  saving.value = true;
  success.value = null;
  failure.value = null;

  const result = await store.create({
    title: form.title,
    dueAt: fromLocalDateTimeInput(form.dueAt),
    requester: form.requester,
    assignee: form.assignee,
    priority: form.priority,
    sourceUrl: form.sourceUrl,
  });
  saving.value = false;

  if (result.ok) {
    Object.assign(form, emptyForm());
    showSourceUrl.value = false;
    errors.value = {};
    success.value = `Tarefa “${result.task.title}” adicionada.`;
    titleInput.value?.focus();
    return;
  }

  errors.value = result.errors;
  failure.value = result.message ?? 'Revise os campos destacados.';
  await nextTick();

  const invalid = formElement.value?.querySelector<HTMLElement>('[aria-invalid="true"]');

  if (invalid) {
    invalid.focus();
  } else {
    failureAlert.value?.focus();
  }
}

async function handleCapturePage(): Promise<void> {
  success.value = null;
  failure.value = null;

  const result = await captureActivePage(props.pageReader);

  if (result.status === 'captured') {
    if (!form.title.trim()) {
      form.title = result.draft.title;
    }
    if (result.draft.sourceUrl) {
      form.sourceUrl = result.draft.sourceUrl;
      showSourceUrl.value = true;
    }
    success.value = 'Página atual capturada.';
    captureButton.value?.focus();
    return;
  }

  failure.value =
    result.status === 'unsupported'
      ? 'Somente páginas http ou https podem ser capturadas.'
      : 'Não foi possível ler a página atual.';
  captureButton.value?.focus();
}

function removeSourceUrl(): void {
  form.sourceUrl = '';
  showSourceUrl.value = false;
  captureButton.value?.focus();
}

async function handleOpenManager(): Promise<void> {
  failure.value = null;

  try {
    await openTaskManager(props.navigator);
    emit('manager-opened');
  } catch {
    failure.value = 'Não foi possível abrir o gerenciamento. Seus dados digitados foram mantidos.';
  }
}

onMounted(() => {
  titleInput.value?.focus();
});
</script>

<template>
  <main class="quick-add">
    <header>
      <h1 :id="`${id}-heading`">Adicionar tarefa</h1>
    </header>

    <form
      ref="formElement"
      :aria-labelledby="`${id}-heading`"
      novalidate
      @submit.prevent="handleSubmit"
    >
      <div class="field">
        <label :for="fieldId('title')">Título <span aria-hidden="true">*</span></label>
        <input
          :id="fieldId('title')"
          ref="titleInput"
          v-model="form.title"
          name="title"
          type="text"
          required
          autocomplete="off"
          :maxlength="TASK_LIMITS.title"
          v-bind="errorProps('title')"
        />
        <p v-if="errors.title" :id="`${fieldId('title')}-error`" class="field-error">
          {{ errors.title }}
        </p>
      </div>

      <div class="field">
        <button
          ref="captureButton"
          type="button"
          class="button-secondary"
          @click="handleCapturePage"
        >
          Usar página atual
        </button>
      </div>

      <div v-if="showSourceUrl" class="field">
        <label :for="fieldId('sourceUrl')">URL de origem</label>
        <input
          :id="fieldId('sourceUrl')"
          v-model="form.sourceUrl"
          name="sourceUrl"
          type="url"
          inputmode="url"
          placeholder="https://"
          v-bind="errorProps('sourceUrl')"
        />
        <p v-if="errors.sourceUrl" :id="`${fieldId('sourceUrl')}-error`" class="field-error">
          {{ errors.sourceUrl }}
        </p>
        <button type="button" class="button-secondary" @click="removeSourceUrl">
          Remover URL de origem
        </button>
      </div>

      <div class="field">
        <label :for="fieldId('dueAt')">Prazo</label>
        <input
          :id="fieldId('dueAt')"
          v-model="form.dueAt"
          name="dueAt"
          type="datetime-local"
          v-bind="errorProps('dueAt')"
        />
        <p v-if="errors.dueAt" :id="`${fieldId('dueAt')}-error`" class="field-error">
          {{ errors.dueAt }}
        </p>
      </div>

      <div class="field-row">
        <div class="field">
          <label :for="fieldId('requester')">Solicitante</label>
          <input
            :id="fieldId('requester')"
            v-model="form.requester"
            name="requester"
            type="text"
            :maxlength="TASK_LIMITS.person"
            v-bind="errorProps('requester')"
          />
          <p v-if="errors.requester" :id="`${fieldId('requester')}-error`" class="field-error">
            {{ errors.requester }}
          </p>
        </div>

        <div class="field">
          <label :for="fieldId('assignee')">Responsável</label>
          <input
            :id="fieldId('assignee')"
            v-model="form.assignee"
            name="assignee"
            type="text"
            :maxlength="TASK_LIMITS.person"
            v-bind="errorProps('assignee')"
          />
          <p v-if="errors.assignee" :id="`${fieldId('assignee')}-error`" class="field-error">
            {{ errors.assignee }}
          </p>
        </div>
      </div>

      <div class="field">
        <label :for="fieldId('priority')">Prioridade</label>
        <select
          :id="fieldId('priority')"
          v-model="form.priority"
          name="priority"
          v-bind="errorProps('priority')"
        >
          <option v-for="priority in TASK_PRIORITIES" :key="priority" :value="priority">
            {{ PRIORITY_LABELS[priority] }}
          </option>
        </select>
        <p v-if="errors.priority" :id="`${fieldId('priority')}-error`" class="field-error">
          {{ errors.priority }}
        </p>
      </div>

      <button type="submit" :disabled="saving">
        {{ saving ? 'Salvando…' : 'Adicionar tarefa' }}
      </button>
    </form>

    <div aria-live="polite" class="live-region">
      <p v-show="success" class="feedback feedback-success">{{ success }}</p>
    </div>
    <p v-if="failure" ref="failureAlert" tabindex="-1" class="feedback feedback-error" role="alert">
      {{ failure }}
    </p>

    <button type="button" class="button-secondary" @click="handleOpenManager">
      Abrir gerenciamento
    </button>
  </main>
</template>

<style scoped>
.quick-add {
  display: grid;
  gap: 0.9rem;
  padding: 1.1rem;
  background: var(--color-surface);
}

.quick-add h1 {
  margin: 0;
  font-size: 1.2rem;
}

form {
  display: grid;
  gap: 0.75rem;
}

.field-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}
</style>
