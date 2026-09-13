<script setup lang="ts">
import { computed, onMounted, reactive, ref, useId } from 'vue';
import { TASK_PRIORITIES, TASK_STATUSES, type Task } from '@/domain/task';
import {
  TASK_LIMITS,
  type TaskDraft,
  type TaskField,
  type TaskFieldErrors,
} from '@/domain/task-draft';
import { REMINDER_OFFSETS, type ReminderOffset } from '@/domain/task-reminders';
import { fromLocalDateTimeInput, toLocalDateTimeInput } from './date-time';
import { PRIORITY_LABELS, REMINDER_LABELS, STATUS_LABELS } from './task-labels';

const props = withDefaults(
  defineProps<{
    /** Tarefa em edição; ausente para criação. */
    task?: Task | null;
    errors?: TaskFieldErrors;
    saving?: boolean;
  }>(),
  { task: null, errors: () => ({}), saving: false },
);

const emit = defineEmits<{
  submit: [draft: TaskDraft];
  cancel: [];
}>();

const idPrefix = useId();
const titleInput = ref<HTMLInputElement | null>(null);

const form = reactive({
  title: props.task?.title ?? '',
  description: props.task?.description ?? '',
  requester: props.task?.requester ?? '',
  assignee: props.task?.assignee ?? '',
  status: props.task?.status ?? 'TODO',
  priority: props.task?.priority ?? 'MEDIUM',
  dueAt: toLocalDateTimeInput(props.task?.dueAt),
  reminderOffsets: (props.task?.reminders.map((reminder) => reminder.offsetMinutes) ??
    []) as ReminderOffset[],
  tags: props.task?.tags.join(', ') ?? '',
  sourceUrl: props.task?.sourceUrl ?? '',
});

const isEditing = computed(() => props.task !== null);
const heading = computed(() => (isEditing.value ? 'Editar tarefa' : 'Nova tarefa'));

function fieldId(field: TaskField): string {
  return `${idPrefix}-${field}`;
}

function errorId(field: TaskField): string {
  return `${fieldId(field)}-error`;
}

function describedBy(field: TaskField, hintId?: string): string | undefined {
  const ids = [hintId, props.errors[field] ? errorId(field) : undefined].filter(Boolean);
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function handleSubmit(): void {
  emit('submit', {
    title: form.title,
    description: form.description,
    requester: form.requester,
    assignee: form.assignee,
    status: form.status,
    priority: form.priority,
    dueAt: fromLocalDateTimeInput(form.dueAt),
    reminderOffsets: [...form.reminderOffsets],
    tags: form.tags.split(','),
    sourceUrl: form.sourceUrl,
  });
}

onMounted(() => {
  titleInput.value?.focus();
});

</script>

<template>
  <form
    class="task-form"
    :aria-labelledby="`${idPrefix}-heading`"
    novalidate
    @submit.prevent="handleSubmit"
  >
    <h2 :id="`${idPrefix}-heading`">{{ heading }}</h2>

    <div class="field">
      <label :for="fieldId('title')">Título <span aria-hidden="true">*</span></label>
      <input
        :id="fieldId('title')"
        ref="titleInput"
        v-model="form.title"
        name="title"
        type="text"
        required
        :maxlength="TASK_LIMITS.title"
        :aria-invalid="Boolean(errors.title)"
        :aria-describedby="describedBy('title')"
      />
      <p v-if="errors.title" :id="errorId('title')" class="field-error">{{ errors.title }}</p>
    </div>

    <div class="field">
      <label :for="fieldId('description')">Descrição</label>
      <textarea
        :id="fieldId('description')"
        v-model="form.description"
        name="description"
        rows="3"
        :maxlength="TASK_LIMITS.description"
        :aria-invalid="Boolean(errors.description)"
        :aria-describedby="describedBy('description')"
      />
      <p v-if="errors.description" :id="errorId('description')" class="field-error">
        {{ errors.description }}
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
          :aria-invalid="Boolean(errors.requester)"
          :aria-describedby="describedBy('requester')"
        />
        <p v-if="errors.requester" :id="errorId('requester')" class="field-error">
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
          :aria-invalid="Boolean(errors.assignee)"
          :aria-describedby="describedBy('assignee')"
        />
        <p v-if="errors.assignee" :id="errorId('assignee')" class="field-error">
          {{ errors.assignee }}
        </p>
      </div>
    </div>

    <div class="field-row">
      <div class="field">
        <label :for="fieldId('status')">Status</label>
        <select
          :id="fieldId('status')"
          v-model="form.status"
          name="status"
          :aria-invalid="Boolean(errors.status)"
          :aria-describedby="describedBy('status')"
        >
          <option v-for="status in TASK_STATUSES" :key="status" :value="status">
            {{ STATUS_LABELS[status] }}
          </option>
        </select>
        <p v-if="errors.status" :id="errorId('status')" class="field-error">{{ errors.status }}</p>
      </div>

      <div class="field">
        <label :for="fieldId('priority')">Prioridade</label>
        <select
          :id="fieldId('priority')"
          v-model="form.priority"
          name="priority"
          :aria-invalid="Boolean(errors.priority)"
          :aria-describedby="describedBy('priority')"
        >
          <option v-for="priority in TASK_PRIORITIES" :key="priority" :value="priority">
            {{ PRIORITY_LABELS[priority] }}
          </option>
        </select>
        <p v-if="errors.priority" :id="errorId('priority')" class="field-error">
          {{ errors.priority }}
        </p>
      </div>
    </div>

    <div class="field">
      <label :for="fieldId('dueAt')">Prazo</label>
      <input
        :id="fieldId('dueAt')"
        v-model="form.dueAt"
        name="dueAt"
        type="datetime-local"
        :aria-invalid="Boolean(errors.dueAt)"
        :aria-describedby="describedBy('dueAt')"
      />
      <p v-if="errors.dueAt" :id="errorId('dueAt')" class="field-error">{{ errors.dueAt }}</p>
    </div>

    <fieldset
      class="field reminders"
      :aria-invalid="Boolean(errors.reminders)"
      :aria-describedby="describedBy('reminders', `${idPrefix}-reminders-hint`)"
    >
      <legend>Lembretes</legend>
      <p :id="`${idPrefix}-reminders-hint`" class="field-hint">
        Lembretes exigem um prazo e são entregues como notificações do Chrome.
      </p>
      <label v-for="offset in REMINDER_OFFSETS" :key="offset" class="checkbox">
        <input v-model="form.reminderOffsets" type="checkbox" name="reminders" :value="offset" />
        {{ REMINDER_LABELS[offset] }}
      </label>
      <p v-if="errors.reminders" :id="errorId('reminders')" class="field-error">
        {{ errors.reminders }}
      </p>
    </fieldset>

    <div class="field">
      <label :for="fieldId('tags')">Tags</label>
      <input
        :id="fieldId('tags')"
        v-model="form.tags"
        name="tags"
        type="text"
        :aria-invalid="Boolean(errors.tags)"
        :aria-describedby="describedBy('tags', `${idPrefix}-tags-hint`)"
      />
      <p :id="`${idPrefix}-tags-hint`" class="field-hint">
        Separe por vírgulas. Até {{ TASK_LIMITS.tags }} tags com {{ TASK_LIMITS.tag }} caracteres
        cada.
      </p>
      <p v-if="errors.tags" :id="errorId('tags')" class="field-error">{{ errors.tags }}</p>
    </div>

    <div class="field">
      <label :for="fieldId('sourceUrl')">URL de origem</label>
      <input
        :id="fieldId('sourceUrl')"
        v-model="form.sourceUrl"
        name="sourceUrl"
        type="url"
        inputmode="url"
        placeholder="https://"
        :aria-invalid="Boolean(errors.sourceUrl)"
        :aria-describedby="describedBy('sourceUrl')"
      />
      <p v-if="errors.sourceUrl" :id="errorId('sourceUrl')" class="field-error">
        {{ errors.sourceUrl }}
      </p>
    </div>

    <div class="form-actions">
      <button type="submit" :disabled="saving">
        {{ saving ? 'Salvando…' : isEditing ? 'Salvar alterações' : 'Criar tarefa' }}
      </button>
      <button type="button" class="button-secondary" :disabled="saving" @click="emit('cancel')">
        Cancelar
      </button>
    </div>
  </form>
</template>

<style scoped>
.task-form {
  display: grid;
  gap: 0.9rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.9rem;
  background: var(--color-surface);
}

.task-form h2 {
  margin: 0;
  font-size: 1.05rem;
}

.field-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
  gap: 0.9rem;
}

.reminders {
  margin: 0;
  padding: 0;
  border: 0;
}

.reminders legend {
  padding: 0;
  font-weight: 600;
  font-size: 0.85rem;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 400;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
</style>
