<script setup lang="ts">
import { computed, onMounted, reactive, ref, useId } from 'vue';
import type { CapturedDraft } from '@/domain/page-capture';
import { TASK_PRIORITIES, TASK_STATUSES, type Task, type TaskReminder } from '@/domain/task';
import {
  TASK_LIMITS,
  type RecurrenceField,
  type TaskDraft,
  type TaskField,
  type TaskFieldErrors,
  type TaskRecurrenceDraft,
} from '@/domain/task-draft';
import {
  RECURRENCE_FREQUENCIES,
  type RecurrenceFrequency,
} from '@/domain/task-recurrence';
import {
  MAX_REMINDERS,
  REMINDER_PRESETS,
  type ReminderPreset,
  type TaskReminderDraft,
} from '@/domain/task-reminders';
import { fromLocalDateTimeInput, INVALID_DATE_INPUT, toLocalDateTimeInput } from './date-time';
import {
  PRIORITY_LABELS,
  RECURRENCE_FREQUENCY_LABELS,
  REMINDER_LABELS,
  REMINDER_UNIT_LABELS,
  REMINDER_UNIT_MINUTES,
  REMINDER_UNITS,
  STATUS_LABELS,
  WEEKDAY_LABELS,
  type ReminderOffsetUnit,
} from './task-labels';

const props = withDefaults(
  defineProps<{
    /** Tarefa em edição; ausente para criação. */
    task?: Task | null;
    /** Rascunho capturado, usado somente na criação. */
    initialDraft?: CapturedDraft | null;
    errors?: TaskFieldErrors;
    saving?: boolean;
  }>(),
  { task: null, initialDraft: null, errors: () => ({}), saving: false },
);

const emit = defineEmits<{
  submit: [draft: TaskDraft];
  cancel: [];
}>();

interface ReminderItemForm {
  /** Chave local estável para renderização; não é persistida. */
  key: number;
  /** Identidade persistida, preservada ao editar. */
  id?: string;
  type: 'OFFSET' | 'AT';
  offsetValue: number | '';
  offsetUnit: ReminderOffsetUnit;
  atLocal: string;
}

let reminderKeyCounter = 0;

function nextReminderKey(): number {
  reminderKeyCounter += 1;
  return reminderKeyCounter;
}

function offsetParts(minutes: number): { value: number; unit: ReminderOffsetUnit } {
  if (minutes > 0 && minutes % REMINDER_UNIT_MINUTES.DAYS === 0) {
    return { value: minutes / REMINDER_UNIT_MINUTES.DAYS, unit: 'DAYS' };
  }

  if (minutes > 0 && minutes % REMINDER_UNIT_MINUTES.HOURS === 0) {
    return { value: minutes / REMINDER_UNIT_MINUTES.HOURS, unit: 'HOURS' };
  }

  return { value: minutes, unit: 'MINUTES' };
}

function reminderItemOf(reminder: TaskReminder): ReminderItemForm {
  if (reminder.type === 'OFFSET') {
    const { value, unit } = offsetParts(reminder.offsetMinutes);
    return {
      key: nextReminderKey(),
      id: reminder.id,
      type: 'OFFSET',
      offsetValue: value,
      offsetUnit: unit,
      atLocal: '',
    };
  }

  return {
    key: nextReminderKey(),
    id: reminder.id,
    type: 'AT',
    offsetValue: '',
    offsetUnit: 'HOURS',
    atLocal: toLocalDateTimeInput(reminder.at),
  };
}

const idPrefix = useId();
const titleInput = ref<HTMLInputElement | null>(null);
const formElement = ref<HTMLFormElement | null>(null);

const draft = props.task ? null : props.initialDraft;

const form = reactive({
  title: props.task?.title ?? draft?.title ?? '',
  description: props.task?.description ?? draft?.description ?? '',
  requester: props.task?.requester ?? '',
  assignee: props.task?.assignee ?? '',
  status: props.task?.status ?? 'TODO',
  priority: props.task?.priority ?? 'MEDIUM',
  dueAt: toLocalDateTimeInput(props.task?.dueAt),
  tags: props.task?.tags.join(', ') ?? '',
  sourceUrl: props.task?.sourceUrl ?? draft?.sourceUrl ?? '',
});

const reminderItems = ref<ReminderItemForm[]>(
  (props.task?.reminders ?? []).map(reminderItemOf),
);

const currentRecurrence = props.task?.recurrence;

const recurrenceForm = reactive({
  frequency: (currentRecurrence?.frequency ?? '') as '' | RecurrenceFrequency,
  intervalDays: (currentRecurrence?.frequency === 'DAILY'
    ? currentRecurrence.intervalDays
    : '') as number | '',
  weekdays: (currentRecurrence?.frequency === 'WEEKLY'
    ? [...currentRecurrence.weekdays]
    : []) as number[],
  dayOfMonth: (currentRecurrence?.frequency === 'MONTHLY'
    ? currentRecurrence.dayOfMonth
    : '') as number | '',
  untilLocal: toLocalDateTimeInput(currentRecurrence?.until),
});

/** Verdadeiro depois que o usuário pediu para encerrar a série pelo formulário. */
const seriesStopped = ref(false);

const hasRecurrence = computed(() => recurrenceForm.frequency !== '');
const canStopSeries = computed(() => props.task?.recurrence !== undefined);

const isEditing = computed(() => props.task !== null);
const heading = computed(() => (isEditing.value ? 'Editar tarefa' : 'Nova tarefa'));
const atReminderLimit = computed(() => reminderItems.value.length >= MAX_REMINDERS);

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

function recurrenceControlId(field: RecurrenceField): string {
  return `${idPrefix}-recurrence-${field}`;
}

function recurrenceErrorId(field: RecurrenceField): string {
  return `${recurrenceControlId(field)}-error`;
}

function recurrenceFieldError(field: RecurrenceField): string | undefined {
  return props.errors.recurrenceFields?.[field];
}

function recurrenceDescribedBy(field: RecurrenceField): string | undefined {
  return recurrenceFieldError(field) ? recurrenceErrorId(field) : undefined;
}

function toggleWeekday(weekday: number, enabled: boolean): void {
  recurrenceForm.weekdays = enabled
    ? [...recurrenceForm.weekdays, weekday].sort((first, second) => first - second)
    : recurrenceForm.weekdays.filter((value) => value !== weekday);
}

function stopSeries(): void {
  recurrenceForm.frequency = '';
  recurrenceForm.untilLocal = '';
  seriesStopped.value = true;
}

function reminderControlId(item: ReminderItemForm, control: string): string {
  return `${idPrefix}-reminder-${item.key}-${control}`;
}

function reminderErrorId(item: ReminderItemForm): string {
  return reminderControlId(item, 'error');
}

function reminderItemError(index: number): string | undefined {
  return props.errors.reminderItems?.[index];
}

function reminderDescribedBy(item: ReminderItemForm, index: number): string | undefined {
  return reminderItemError(index) ? reminderErrorId(item) : undefined;
}

/** Foca o primeiro campo inválido em ordem de documento; no grupo, o primeiro controle de entrada. */
function focusFirstInvalid(): boolean {
  const invalid = formElement.value?.querySelector<HTMLElement>('[aria-invalid="true"]');
  if (!invalid) return false;

  const target =
    invalid instanceof HTMLFieldSetElement
      ? invalid.querySelector<HTMLElement>('input, select, textarea')
      : invalid;

  if (!target) return false;

  target.focus();
  return true;
}

defineExpose({ focusFirstInvalid });

function sanitizeOffsetMinutes(value: number, unit: ReminderOffsetUnit): number {
  const minutes = value * REMINDER_UNIT_MINUTES[unit];
  return Number.isFinite(minutes) ? Math.round(minutes * 1e6) / 1e6 : Number.NaN;
}

function itemOffsetMinutes(item: ReminderItemForm): number | undefined {
  if (item.type !== 'OFFSET' || typeof item.offsetValue !== 'number') {
    return undefined;
  }

  const minutes = sanitizeOffsetMinutes(item.offsetValue, item.offsetUnit);
  return Number.isSafeInteger(minutes) && minutes >= 0 ? minutes : undefined;
}

function hasPreset(preset: ReminderPreset): boolean {
  return reminderItems.value.some((item) => itemOffsetMinutes(item) === preset);
}

function togglePreset(preset: ReminderPreset, enabled: boolean): void {
  if (!enabled) {
    reminderItems.value = reminderItems.value.filter((item) => itemOffsetMinutes(item) !== preset);
    return;
  }

  if (hasPreset(preset) || atReminderLimit.value) {
    return;
  }

  reminderItems.value.push({
    key: nextReminderKey(),
    type: 'OFFSET',
    offsetValue: preset,
    offsetUnit: 'MINUTES',
    atLocal: '',
  });
}

function addReminderItem(): void {
  if (atReminderLimit.value) {
    return;
  }

  reminderItems.value.push({
    key: nextReminderKey(),
    type: 'OFFSET',
    offsetValue: '',
    offsetUnit: 'HOURS',
    atLocal: '',
  });
}

function removeReminderItem(key: number): void {
  reminderItems.value = reminderItems.value.filter((item) => item.key !== key);
}

function reminderDraftOf(item: ReminderItemForm): TaskReminderDraft {
  if (item.type === 'OFFSET') {
    const offsetMinutes = itemOffsetMinutes(item) ?? Number.NaN;
    return item.id !== undefined
      ? { id: item.id, type: 'OFFSET', offsetMinutes }
      : { type: 'OFFSET', offsetMinutes };
  }

  const at = fromLocalDateTimeInput(item.atLocal) ?? INVALID_DATE_INPUT;
  return item.id !== undefined ? { id: item.id, type: 'AT', at } : { type: 'AT', at };
}

function recurrenceDraftOf(): TaskRecurrenceDraft | undefined {
  const { frequency } = recurrenceForm;

  if (frequency === '') {
    return undefined;
  }

  const until = fromLocalDateTimeInput(recurrenceForm.untilLocal);
  const common = until === undefined ? {} : { until };

  if (frequency === 'DAILY') {
    return {
      ...common,
      frequency: 'DAILY',
      intervalDays: recurrenceForm.intervalDays === '' ? Number.NaN : recurrenceForm.intervalDays,
    };
  }

  if (frequency === 'WEEKLY') {
    return { ...common, frequency: 'WEEKLY', weekdays: [...recurrenceForm.weekdays] };
  }

  return {
    ...common,
    frequency: 'MONTHLY',
    dayOfMonth: recurrenceForm.dayOfMonth === '' ? Number.NaN : recurrenceForm.dayOfMonth,
  };
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
    reminders: reminderItems.value.map(reminderDraftOf),
    recurrence: recurrenceDraftOf(),
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
    ref="formElement"
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
      class="field recurrence"
      :aria-invalid="Boolean(errors.recurrence)"
      :aria-describedby="describedBy('recurrence', `${idPrefix}-recurrence-hint`)"
    >
      <legend>Recorrência</legend>
      <p :id="`${idPrefix}-recurrence-hint`" class="field-hint">
        A próxima ocorrência nasce quando esta for concluída. A recorrência exige um prazo.
      </p>

      <div class="field">
        <label :for="recurrenceControlId('frequency')">Frequência</label>
        <select
          :id="recurrenceControlId('frequency')"
          v-model="recurrenceForm.frequency"
          name="recurrence-frequency"
          :aria-invalid="Boolean(errors.recurrence || recurrenceFieldError('frequency'))"
          :aria-describedby="
            errors.recurrence
              ? describedBy('recurrence')
              : recurrenceDescribedBy('frequency')
          "
        >
          <option value="">Não repetir</option>
          <option v-for="frequency in RECURRENCE_FREQUENCIES" :key="frequency" :value="frequency">
            {{ RECURRENCE_FREQUENCY_LABELS[frequency] }}
          </option>
        </select>
        <p
          v-if="recurrenceFieldError('frequency')"
          :id="recurrenceErrorId('frequency')"
          class="field-error"
        >
          {{ recurrenceFieldError('frequency') }}
        </p>
      </div>

      <div v-if="recurrenceForm.frequency === 'DAILY'" class="field">
        <label :for="recurrenceControlId('intervalDays')">Repetir a cada</label>
        <div class="inline-controls">
          <input
            :id="recurrenceControlId('intervalDays')"
            v-model.number="recurrenceForm.intervalDays"
            name="recurrence-interval-days"
            type="number"
            min="1"
            max="365"
            step="1"
            inputmode="numeric"
            :aria-invalid="Boolean(recurrenceFieldError('intervalDays'))"
            :aria-describedby="recurrenceDescribedBy('intervalDays')"
          />
          <span>dias</span>
        </div>
        <p
          v-if="recurrenceFieldError('intervalDays')"
          :id="recurrenceErrorId('intervalDays')"
          class="field-error"
        >
          {{ recurrenceFieldError('intervalDays') }}
        </p>
      </div>

      <fieldset
        v-else-if="recurrenceForm.frequency === 'WEEKLY'"
        class="weekday-field"
        :aria-invalid="Boolean(recurrenceFieldError('weekdays'))"
        :aria-describedby="recurrenceDescribedBy('weekdays')"
      >
        <legend>Dias da semana</legend>
        <div class="weekdays">
          <label v-for="(label, weekday) in WEEKDAY_LABELS" :key="label" class="checkbox">
            <input
              type="checkbox"
              name="recurrence-weekdays"
              :value="weekday"
              :checked="recurrenceForm.weekdays.includes(weekday)"
              @change="toggleWeekday(weekday, ($event.target as HTMLInputElement).checked)"
            />
            {{ label }}
          </label>
        </div>
        <p
          v-if="recurrenceFieldError('weekdays')"
          :id="recurrenceErrorId('weekdays')"
          class="field-error"
        >
          {{ recurrenceFieldError('weekdays') }}
        </p>
      </fieldset>

      <div v-else-if="recurrenceForm.frequency === 'MONTHLY'" class="field">
        <label :for="recurrenceControlId('dayOfMonth')">Dia do mês</label>
        <input
          :id="recurrenceControlId('dayOfMonth')"
          v-model.number="recurrenceForm.dayOfMonth"
          name="recurrence-day-of-month"
          type="number"
          min="1"
          max="31"
          step="1"
          inputmode="numeric"
          :aria-invalid="Boolean(recurrenceFieldError('dayOfMonth'))"
          :aria-describedby="recurrenceDescribedBy('dayOfMonth')"
        />
        <p
          v-if="recurrenceFieldError('dayOfMonth')"
          :id="recurrenceErrorId('dayOfMonth')"
          class="field-error"
        >
          {{ recurrenceFieldError('dayOfMonth') }}
        </p>
      </div>

      <div v-if="hasRecurrence" class="field">
        <label :for="recurrenceControlId('until')">Repetir até</label>
        <input
          :id="recurrenceControlId('until')"
          v-model="recurrenceForm.untilLocal"
          name="recurrence-until"
          type="datetime-local"
          :aria-invalid="Boolean(recurrenceFieldError('until'))"
          :aria-describedby="recurrenceDescribedBy('until')"
        />
        <p class="field-hint">Opcional. Sem limite, a série continua indefinidamente.</p>
        <p
          v-if="recurrenceFieldError('until')"
          :id="recurrenceErrorId('until')"
          class="field-error"
        >
          {{ recurrenceFieldError('until') }}
        </p>
      </div>

      <p v-if="errors.recurrence" :id="errorId('recurrence')" class="field-error">
        {{ errors.recurrence }}
      </p>

      <template v-if="canStopSeries">
        <button type="button" class="button-secondary" @click="stopSeries">Encerrar série</button>
        <p v-if="seriesStopped" class="field-hint">
          A regra será removida da tarefa ao salvar.
        </p>
      </template>
    </fieldset>

    <fieldset
      class="field reminders"
      :aria-invalid="Boolean(errors.reminders)"
      :aria-describedby="describedBy('reminders', `${idPrefix}-reminders-hint`)"
    >
      <legend>Lembretes</legend>
      <p :id="`${idPrefix}-reminders-hint`" class="field-hint">
        Lembretes exigem um prazo e são entregues como notificações do Chrome.
      </p>

      <div class="presets">
        <label v-for="preset in REMINDER_PRESETS" :key="preset" class="checkbox">
          <input
            type="checkbox"
            name="reminders"
            :value="preset"
            :checked="hasPreset(preset)"
            :disabled="!hasPreset(preset) && atReminderLimit"
            @change="togglePreset(preset, ($event.target as HTMLInputElement).checked)"
          />
          {{ REMINDER_LABELS[preset] }}
        </label>
      </div>

      <ul class="reminder-list">
        <li v-for="(item, index) in reminderItems" :key="item.key" class="reminder-item">
          <div class="reminder-item-header">
            <span class="reminder-item-title">Lembrete {{ index + 1 }}</span>
            <button type="button" class="button-secondary" @click="removeReminderItem(item.key)">
              Remover
            </button>
          </div>

          <div class="field-row">
            <div class="field">
              <label :for="reminderControlId(item, 'type')">Tipo</label>
              <select
                :id="reminderControlId(item, 'type')"
                v-model="item.type"
                name="reminder-type"
                :aria-describedby="reminderDescribedBy(item, index)"
              >
                <option value="OFFSET">Antes do prazo</option>
                <option value="AT">Data e hora</option>
              </select>
            </div>

            <template v-if="item.type === 'OFFSET'">
              <div class="field">
                <label :for="reminderControlId(item, 'offset')">Antecedência</label>
                <input
                  :id="reminderControlId(item, 'offset')"
                  v-model.number="item.offsetValue"
                  name="reminder-offset"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  :aria-invalid="Boolean(reminderItemError(index))"
                  :aria-describedby="reminderDescribedBy(item, index)"
                />
              </div>

              <div class="field">
                <label :for="reminderControlId(item, 'unit')">Unidade</label>
                <select
                  :id="reminderControlId(item, 'unit')"
                  v-model="item.offsetUnit"
                  name="reminder-unit"
                  :aria-describedby="reminderDescribedBy(item, index)"
                >
                  <option v-for="unit in REMINDER_UNITS" :key="unit" :value="unit">
                    {{ REMINDER_UNIT_LABELS[unit] }}
                  </option>
                </select>
              </div>
            </template>

            <div v-else class="field">
              <label :for="reminderControlId(item, 'at')">Data e hora</label>
              <input
                :id="reminderControlId(item, 'at')"
                v-model="item.atLocal"
                name="reminder-at"
                type="datetime-local"
                :aria-invalid="Boolean(reminderItemError(index))"
                :aria-describedby="reminderDescribedBy(item, index)"
              />
            </div>
          </div>

          <p
            v-if="reminderItemError(index)"
            :id="reminderErrorId(item)"
            class="field-error"
          >
            {{ reminderItemError(index) }}
          </p>
        </li>
      </ul>

      <div class="reminder-actions">
        <button type="button" class="button-secondary" :disabled="atReminderLimit" @click="addReminderItem">
          Adicionar lembrete
        </button>
        <p class="field-hint">
          {{ reminderItems.length }} de {{ MAX_REMINDERS }} lembretes configurados.
        </p>
      </div>

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

.recurrence,
.weekday-field {
  margin: 0;
  padding: 0;
  border: 0;
}

.recurrence legend,
.weekday-field legend {
  padding: 0;
  font-weight: 600;
  font-size: 0.85rem;
}

.weekdays {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.9rem;
}

.inline-controls {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.checkbox {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 400;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem 0.9rem;
}

.reminder-list {
  display: grid;
  gap: 0.6rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.reminder-item {
  display: grid;
  gap: 0.5rem;
  padding: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 0.7rem;
}

.reminder-item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.reminder-item-title {
  font-size: 0.85rem;
  font-weight: 600;
}

.reminder-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.5rem;
}

.reminder-actions .field-hint {
  margin: 0;
}

.form-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
}
</style>
