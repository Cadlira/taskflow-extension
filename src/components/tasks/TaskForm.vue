<script setup lang="ts">
import { computed, inject, nextTick, onMounted, reactive, ref, useId, watch } from 'vue';
import type { AiSubtaskSuggestionOutcome } from '@/application/ai/ai-subtask-suggestion-service';
import { AI_BLOCK_LABELS, AI_PERMISSION_REFUSED_MESSAGE } from '@/components/ai/ai-provider-labels';
import { aiProviderServiceKey } from '@/components/ai/ai-service-key';
import { aiSubtaskSuggestionServiceKey } from '@/components/ai/ai-suggestion-key';
import {
  AI_SUGGEST_SUBTASKS_ACTION,
  AI_SUGGESTION_ACCEPT_ACTION,
  AI_SUGGESTION_AT_LIMIT,
  AI_SUGGESTION_CANCEL_ACTION,
  AI_SUGGESTION_CANCELLED,
  AI_SUGGESTION_DESCRIPTION_TRUNCATED,
  AI_SUGGESTION_DISCARD_ACTION,
  AI_SUGGESTION_DISCARDED,
  AI_SUGGESTION_IN_PROGRESS,
  AI_SUGGESTION_LIMIT_DISCARDED,
  AI_SUGGESTION_NOT_CONFIGURED,
  AI_SUGGESTION_NOTHING_SELECTED,
  AI_SUGGESTION_ORIGIN_CHANGED,
  AI_SUGGESTION_PREVIEW_HEADING,
  AI_SUGGESTION_PREVIEW_NOTICE,
  AI_SUGGESTION_PREVIEW_RECOMPOSED,
  AI_SUGGESTION_PROPOSAL_HEADING,
  AI_SUGGESTION_PROPOSAL_NOTICE,
  AI_SUGGESTION_TITLE_REQUIRED,
  aiSuggestionAcceptedMessage,
  aiSuggestionConsentAction,
  aiSuggestionFailureMessage,
  aiSuggestionPermissionAction,
  aiSuggestionPermissionNotice,
  aiSuggestionSendAction,
  aiTaskContentConsentMessage,
} from '@/components/ai/ai-suggestion-labels';
import { buildSubtaskSuggestionContent } from '@/domain/ai-subtask-suggestion';
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
import { MAX_SUBTASKS, SUBTASK_TITLE_LIMIT, type TaskSubtaskDraft } from '@/domain/task-subtasks';
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

interface SubtaskItemForm {
  /** Chave local estável para renderização; não é persistida. */
  key: number;
  /** Identidade persistida; ausente para itens adicionados neste formulário. */
  id?: string;
  title: string;
}

type SubtaskMove = 'up' | 'down';

let subtaskKeyCounter = 0;

function nextSubtaskKey(): number {
  subtaskKeyCounter += 1;
  return subtaskKeyCounter;
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

const subtaskItems = ref<SubtaskItemForm[]>(
  (props.task?.subtasks ?? []).map((subtask) => ({
    key: nextSubtaskKey(),
    id: subtask.id,
    title: subtask.title,
  })),
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
const atSubtaskLimit = computed(() => subtaskItems.value.length >= MAX_SUBTASKS);

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

function subtaskControlId(item: SubtaskItemForm, control: string): string {
  return `${idPrefix}-subtask-${item.key}-${control}`;
}

function subtaskItemError(index: number): string | undefined {
  return props.errors.subtaskItems?.[index];
}

function subtaskDescribedBy(item: SubtaskItemForm, index: number): string | undefined {
  return subtaskItemError(index) ? subtaskControlId(item, 'error') : undefined;
}

/** Nome acessível das ações do item: posição e título atuais. */
function subtaskActionLabel(action: string, index: number, item: SubtaskItemForm): string {
  const title = item.title.trim();
  return title
    ? `${action} subtarefa ${index + 1}: ${title}`
    : `${action} subtarefa ${index + 1}`;
}

/**
 * Marcação atual da subtarefa persistida, lida da tarefa mais recente recebida pela superfície.
 * O formulário apenas a apresenta; o rascunho enviado não a carrega.
 */
function subtaskStateLabel(item: SubtaskItemForm): string | undefined {
  if (item.id === undefined) {
    return undefined;
  }

  const persisted = props.task?.subtasks.find((subtask) => subtask.id === item.id);
  return persisted === undefined ? undefined : persisted.done ? 'Feita' : 'Pendente';
}

function focusElementById(id: string): void {
  document.getElementById(id)?.focus();
}

async function addSubtaskItem(): Promise<void> {
  if (atSubtaskLimit.value) {
    return;
  }

  const item: SubtaskItemForm = { key: nextSubtaskKey(), title: '' };
  subtaskItems.value.push(item);
  await nextTick();
  focusElementById(subtaskControlId(item, 'title'));
}

async function removeSubtaskItem(key: number): Promise<void> {
  subtaskItems.value = subtaskItems.value.filter((item) => item.key !== key);
  await nextTick();
  focusElementById(`${idPrefix}-subtasks-add`);
}

/**
 * Move o item uma posição. O foco permanece no controle acionado do mesmo item ou, quando ele
 * fica indisponível no novo limite da lista, passa ao controle oposto.
 */
async function moveSubtaskItem(key: number, direction: SubtaskMove): Promise<void> {
  const items = subtaskItems.value;
  const index = items.findIndex((item) => item.key === key);
  const target = direction === 'up' ? index - 1 : index + 1;
  const item = items[index];
  const neighbor = items[target];

  if (item === undefined || neighbor === undefined) {
    return;
  }

  subtaskItems.value = items.with(index, neighbor).with(target, item);
  await nextTick();

  const atEdge = direction === 'up' ? target === 0 : target === subtaskItems.value.length - 1;
  const control = atEdge ? (direction === 'up' ? 'down' : 'up') : direction;
  focusElementById(subtaskControlId(item, control));
}

function subtaskDraftOf(item: SubtaskItemForm): TaskSubtaskDraft {
  return item.id !== undefined ? { id: item.id, title: item.title } : { title: item.title };
}

/* ── Assistência de IA: sugestão de subtarefas ────────────────────────────────────────────────
 *
 * Estritamente opcional e inteiramente local ao formulário. Sem os serviços fornecidos — o que é
 * o caso do popup do Quick Add — nada abaixo é montado. Nada daqui é persistido: aceitar uma
 * sugestão apenas acrescenta um item a `subtaskItems`, exatamente como a inclusão manual.
 */

const aiService = inject(aiProviderServiceKey, null);
const suggestionService = inject(aiSubtaskSuggestionServiceKey, null);

interface ProposalItemForm {
  /** Chave local estável para renderização; não é persistida. */
  key: number;
  title: string;
  selected: boolean;
}

let proposalKeyCounter = 0;

function nextProposalKey(): number {
  proposalKeyCounter += 1;
  return proposalKeyCounter;
}

/** Origem configurada; `null` enquanto não houver provedor, quando nada é oferecido. */
const aiOrigin = ref<string | null>(null);
const aiPermissionGranted = ref(false);
/** Origem apresentada no painel de pré-visualização, comparada com a atual antes de enviar. */
const previewOrigin = ref<string | null>(null);
const previewOpen = ref(false);
const previewRecomposed = ref(false);
/** Origem já consentida; vive apenas em memória e some quando o painel é fechado. */
const consentedOrigin = ref<string | null>(null);
const suggesting = ref(false);
const proposalItems = ref<ProposalItemForm[]>([]);
const suggestionMessage = ref<{ tone: 'info' | 'success' | 'warning'; text: string } | null>(null);

const aiAvailable = computed(() => aiService !== null && suggestionService !== null);
const suggestionOffered = computed(() => aiAvailable.value && aiOrigin.value !== null);

/** Motivo legível da indisponibilidade; `null` quando a ação está disponível. */
const suggestionBlockedReason = computed(() => {
  if (atSubtaskLimit.value) {
    return AI_SUGGESTION_AT_LIMIT;
  }

  return form.title.trim() === '' ? AI_SUGGESTION_TITLE_REQUIRED : null;
});

/**
 * Conteúdo a enviar, derivado do que está no formulário agora. Por ser derivado, o texto exibido
 * e o texto transmitido são o mesmo valor: não existe caminho em que divirjam.
 */
const suggestionPreview = computed(() =>
  buildSubtaskSuggestionContent(form.title, form.description),
);

const consentNeeded = computed(
  () => previewOrigin.value !== null && consentedOrigin.value !== previewOrigin.value,
);

const confirmActionLabel = computed(() => {
  const origin = previewOrigin.value ?? '';

  if (!aiPermissionGranted.value) {
    return aiSuggestionPermissionAction(origin);
  }

  return consentNeeded.value ? aiSuggestionConsentAction(origin) : aiSuggestionSendAction(origin);
});

/** Lê o estado atual da configuração; devolve a origem, ou `null` quando não há provedor. */
async function readAiOrigin(): Promise<string | null> {
  if (aiService === null) {
    return null;
  }

  const status = await aiService.load();

  if (status.state !== 'CONFIGURED') {
    aiOrigin.value = null;
    aiPermissionGranted.value = false;
    return null;
  }

  aiOrigin.value = status.summary.origin;
  aiPermissionGranted.value = status.permissionGranted;
  return status.summary.origin;
}

function closeSuggestion(): void {
  previewOpen.value = false;
  previewOrigin.value = null;
  previewRecomposed.value = false;
}

/** Abre a pré-visualização. Nenhuma requisição acontece aqui. */
async function openSuggestionPreview(): Promise<void> {
  if (!aiAvailable.value || suggestionBlockedReason.value !== null) {
    return;
  }

  suggestionMessage.value = null;
  proposalItems.value = [];
  const origin = await readAiOrigin();

  if (origin === null) {
    closeSuggestion();
    suggestionMessage.value = { tone: 'warning', text: AI_SUGGESTION_NOT_CONFIGURED };
    return;
  }

  previewOrigin.value = origin;
  previewRecomposed.value = false;
  previewOpen.value = true;
}

function applyOutcome(outcome: AiSubtaskSuggestionOutcome): void {
  if (outcome.ok) {
    closeSuggestion();
    proposalItems.value = outcome.proposal.drafts.map((draft) => ({
      key: nextProposalKey(),
      title: draft.title,
      selected: true,
    }));
    suggestionMessage.value = outcome.proposal.discardedByLimit
      ? { tone: 'warning', text: AI_SUGGESTION_LIMIT_DISCARDED }
      : null;
    return;
  }

  if (outcome.state === 'ALREADY_RUNNING') {
    return;
  }

  if (outcome.state === 'CANCELLED') {
    suggestionMessage.value = { tone: 'info', text: AI_SUGGESTION_CANCELLED };
    return;
  }

  if (outcome.state === 'NOT_CONFIGURED') {
    aiOrigin.value = null;
    closeSuggestion();
    suggestionMessage.value = { tone: 'warning', text: AI_SUGGESTION_NOT_CONFIGURED };
    return;
  }

  if (outcome.state === 'BLOCKED') {
    suggestionMessage.value = { tone: 'warning', text: AI_BLOCK_LABELS[outcome.blocked] };
    return;
  }

  suggestionMessage.value = {
    tone: 'warning',
    text: aiSuggestionFailureMessage(outcome.reason, previewOrigin.value, outcome.status),
  };
}

/**
 * Consentimento e envio, no mesmo gesto do usuário: a permissão de host, quando falta, é
 * solicitada daqui, porque o navegador exige que o pedido parta de uma ação direta.
 */
async function confirmSuggestion(): Promise<void> {
  if (aiService === null || suggestionService === null || suggesting.value) {
    return;
  }

  suggestionMessage.value = null;
  const origin = await readAiOrigin();

  if (origin === null) {
    closeSuggestion();
    suggestionMessage.value = { tone: 'warning', text: AI_SUGGESTION_NOT_CONFIGURED };
    return;
  }

  // A origem mudou depois que o painel foi apresentado: o consentimento anterior não vale mais.
  if (origin !== previewOrigin.value) {
    previewOrigin.value = origin;
    consentedOrigin.value = null;
    suggestionMessage.value = { tone: 'warning', text: AI_SUGGESTION_ORIGIN_CHANGED };
    return;
  }

  if (!aiPermissionGranted.value) {
    const granted = await aiService.requestPermission(origin);
    aiPermissionGranted.value = granted;

    if (!granted) {
      suggestionMessage.value = { tone: 'warning', text: AI_PERMISSION_REFUSED_MESSAGE };
      return;
    }
  }

  consentedOrigin.value = origin;
  previewRecomposed.value = false;
  suggesting.value = true;

  try {
    applyOutcome(
      await suggestionService.suggest({
        content: suggestionPreview.value.content,
        existingSubtaskCount: subtaskItems.value.length,
      }),
    );
  } finally {
    suggesting.value = false;
  }
}

/** Recusa: nada é enviado e tudo o que estava digitado permanece. */
function refuseSuggestion(): void {
  closeSuggestion();
  suggestionMessage.value = null;
}

function cancelSuggestion(): void {
  suggestionService?.cancel();
}

/** Aceita apenas os itens selecionados, na forma da inclusão manual e sem nenhum concluído. */
function acceptProposal(): void {
  const accepted = proposalItems.value
    .filter((item) => item.selected)
    .map((item) => item.title.trim())
    .filter((title) => title !== '')
    .slice(0, MAX_SUBTASKS - subtaskItems.value.length);

  if (accepted.length === 0) {
    suggestionMessage.value = { tone: 'warning', text: AI_SUGGESTION_NOTHING_SELECTED };
    return;
  }

  // Acréscimo ao fim: as subtarefas existentes não são removidas nem reordenadas.
  for (const title of accepted) {
    subtaskItems.value.push({ key: nextSubtaskKey(), title });
  }

  proposalItems.value = [];
  suggestionMessage.value = { tone: 'success', text: aiSuggestionAcceptedMessage(accepted.length) };
}

function discardProposal(): void {
  proposalItems.value = [];
  suggestionMessage.value = { tone: 'info', text: AI_SUGGESTION_DISCARDED };
}

/** Reutiliza as classes globais de feedback, já verificadas quanto a contraste. */
const suggestionFeedbackClass = computed(() => {
  const tone = suggestionMessage.value?.tone;

  if (tone === 'success') return 'feedback-success';
  return tone === 'warning' ? 'feedback-warning' : undefined;
});

function proposalControlId(item: ProposalItemForm, control: string): string {
  return `${idPrefix}-suggestion-${item.key}-${control}`;
}

// Editar o título ou a descrição com a pré-visualização aberta recompõe o texto apresentado e
// exige nova confirmação: conteúdo desatualizado nunca chega a ser enviado.
watch(
  () => [form.title, form.description],
  () => {
    if (previewOpen.value && !suggesting.value) {
      previewRecomposed.value = true;
    }
  },
);

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
    subtasks: subtaskItems.value.map(subtaskDraftOf),
    tags: form.tags.split(','),
    sourceUrl: form.sourceUrl,
  });
}

onMounted(async () => {
  titleInput.value?.focus();

  // Leitura do estado da configuração; não contata nenhum provedor.
  if (aiAvailable.value) {
    await readAiOrigin();
  }
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

    <fieldset
      class="field subtasks"
      :aria-invalid="Boolean(errors.subtasks)"
      :aria-describedby="describedBy('subtasks', `${idPrefix}-subtasks-hint`)"
    >
      <legend>Subtarefas</legend>
      <p :id="`${idPrefix}-subtasks-hint`" class="field-hint">
        Passos marcáveis desta tarefa. A marcação é feita pelo cartão da listagem.
      </p>

      <ol v-if="subtaskItems.length > 0" class="subtask-list">
        <li v-for="(item, index) in subtaskItems" :key="item.key" class="subtask-item">
          <div class="field">
            <label :for="subtaskControlId(item, 'title')">Subtarefa {{ index + 1 }}</label>
            <input
              :id="subtaskControlId(item, 'title')"
              v-model="item.title"
              name="subtask-title"
              type="text"
              :maxlength="SUBTASK_TITLE_LIMIT"
              :aria-invalid="Boolean(subtaskItemError(index))"
              :aria-describedby="subtaskDescribedBy(item, index)"
            />
            <p
              v-if="subtaskItemError(index)"
              :id="subtaskControlId(item, 'error')"
              class="field-error"
            >
              {{ subtaskItemError(index) }}
            </p>
          </div>

          <div class="subtask-item-footer">
            <span v-if="subtaskStateLabel(item)" class="subtask-state">
              {{ subtaskStateLabel(item) }}
            </span>
            <div class="subtask-item-actions">
              <button
                :id="subtaskControlId(item, 'up')"
                type="button"
                class="button-secondary"
                :aria-label="subtaskActionLabel('Mover para cima', index, item)"
                :disabled="index === 0"
                @click="moveSubtaskItem(item.key, 'up')"
              >
                Mover para cima
              </button>
              <button
                :id="subtaskControlId(item, 'down')"
                type="button"
                class="button-secondary"
                :aria-label="subtaskActionLabel('Mover para baixo', index, item)"
                :disabled="index === subtaskItems.length - 1"
                @click="moveSubtaskItem(item.key, 'down')"
              >
                Mover para baixo
              </button>
              <button
                type="button"
                class="button-secondary"
                :aria-label="subtaskActionLabel('Remover', index, item)"
                @click="removeSubtaskItem(item.key)"
              >
                Remover
              </button>
            </div>
          </div>
        </li>
      </ol>

      <div class="subtask-actions">
        <button
          :id="`${idPrefix}-subtasks-add`"
          type="button"
          class="button-secondary"
          :disabled="atSubtaskLimit"
          :aria-describedby="`${idPrefix}-subtasks-count`"
          @click="addSubtaskItem"
        >
          Adicionar subtarefa
        </button>
        <p :id="`${idPrefix}-subtasks-count`" class="field-hint">
          {{
            atSubtaskLimit
              ? `Limite de ${MAX_SUBTASKS} subtarefas atingido.`
              : `${subtaskItems.length} de ${MAX_SUBTASKS} subtarefas.`
          }}
        </p>
      </div>

      <p v-if="errors.subtasks" :id="errorId('subtasks')" class="field-error">
        {{ errors.subtasks }}
      </p>

      <!-- Assistência de IA: ausente por completo enquanto não houver provedor configurado. -->
      <div v-if="suggestionOffered" class="ai-suggestion">
        <div class="ai-suggestion-actions">
          <button
            :id="`${idPrefix}-suggest-subtasks`"
            type="button"
            class="button-secondary"
            :disabled="suggestionBlockedReason !== null || suggesting"
            :aria-describedby="
              suggestionBlockedReason ? `${idPrefix}-suggest-subtasks-reason` : undefined
            "
            @click="openSuggestionPreview"
          >
            {{ AI_SUGGEST_SUBTASKS_ACTION }}
          </button>
          <p
            v-if="suggestionBlockedReason"
            :id="`${idPrefix}-suggest-subtasks-reason`"
            class="field-hint"
          >
            {{ suggestionBlockedReason }}
          </p>
        </div>

        <section
          v-if="previewOpen"
          class="ai-suggestion-panel"
          :aria-labelledby="`${idPrefix}-suggestion-preview-heading`"
        >
          <h3 :id="`${idPrefix}-suggestion-preview-heading`">
            {{ AI_SUGGESTION_PREVIEW_HEADING }}
          </h3>
          <p class="field-hint">{{ AI_SUGGESTION_PREVIEW_NOTICE }}</p>
          <p class="ai-suggestion-origin" data-testid="suggestion-origin">
            Destino: {{ previewOrigin }}
          </p>
          <pre class="ai-suggestion-content" data-testid="suggestion-preview">{{
            suggestionPreview.content
          }}</pre>
          <p
            v-if="suggestionPreview.descriptionTruncated"
            class="field-hint"
            data-testid="suggestion-truncated"
          >
            {{ AI_SUGGESTION_DESCRIPTION_TRUNCATED }}
          </p>
          <p v-if="previewRecomposed" class="field-hint" data-testid="suggestion-recomposed">
            {{ AI_SUGGESTION_PREVIEW_RECOMPOSED }}
          </p>
          <p
            v-if="!aiPermissionGranted"
            class="ai-suggestion-notice"
            data-testid="suggestion-permission-notice"
          >
            {{ aiSuggestionPermissionNotice(previewOrigin ?? '') }}
          </p>
          <p
            v-if="consentNeeded"
            class="ai-suggestion-notice"
            data-testid="suggestion-consent-notice"
          >
            {{ aiTaskContentConsentMessage(previewOrigin ?? '') }}
          </p>

          <p v-if="suggesting" class="field-hint" role="status" data-testid="suggestion-progress">
            {{ AI_SUGGESTION_IN_PROGRESS }}
          </p>

          <div class="ai-suggestion-actions">
            <button
              v-if="!suggesting"
              type="button"
              class="button-secondary"
              @click="confirmSuggestion"
            >
              {{ confirmActionLabel }}
            </button>
            <button
              v-if="suggesting"
              type="button"
              class="button-secondary"
              @click="cancelSuggestion"
            >
              {{ AI_SUGGESTION_CANCEL_ACTION }}
            </button>
            <button
              v-if="!suggesting"
              type="button"
              class="button-secondary"
              @click="refuseSuggestion"
            >
              Cancelar
            </button>
          </div>
        </section>

        <section
          v-if="proposalItems.length > 0"
          class="ai-suggestion-panel"
          :aria-labelledby="`${idPrefix}-suggestion-proposal-heading`"
        >
          <h3 :id="`${idPrefix}-suggestion-proposal-heading`">
            {{ AI_SUGGESTION_PROPOSAL_HEADING }}
          </h3>
          <p class="field-hint">{{ AI_SUGGESTION_PROPOSAL_NOTICE }}</p>

          <ul class="ai-suggestion-list">
            <li
              v-for="(item, index) in proposalItems"
              :key="item.key"
              class="ai-suggestion-item"
              data-testid="suggestion-item"
            >
              <div class="ai-suggestion-item-select">
                <input
                  :id="proposalControlId(item, 'selected')"
                  v-model="item.selected"
                  name="suggestion-selected"
                  type="checkbox"
                />
                <label :for="proposalControlId(item, 'selected')">
                  Aceitar sugestão {{ index + 1 }}
                </label>
              </div>
              <div class="field">
                <label :for="proposalControlId(item, 'title')">Título da sugestão</label>
                <input
                  :id="proposalControlId(item, 'title')"
                  v-model="item.title"
                  name="suggestion-title"
                  type="text"
                  :maxlength="SUBTASK_TITLE_LIMIT"
                />
              </div>
            </li>
          </ul>

          <div class="ai-suggestion-actions">
            <button type="button" class="button-secondary" @click="acceptProposal">
              {{ AI_SUGGESTION_ACCEPT_ACTION }}
            </button>
            <button type="button" class="button-secondary" @click="discardProposal">
              {{ AI_SUGGESTION_DISCARD_ACTION }}
            </button>
          </div>
        </section>

        <p
          v-if="suggestionMessage"
          class="feedback"
          :class="suggestionFeedbackClass"
          role="status"
          data-testid="suggestion-message"
        >
          {{ suggestionMessage.text }}
        </p>
      </div>
    </fieldset>

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

.subtasks {
  margin: 0;
  padding: 0;
  border: 0;
}

.subtasks legend {
  padding: 0;
  font-weight: 600;
  font-size: 0.85rem;
}

.subtask-list {
  display: grid;
  gap: 0.6rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.subtask-item {
  display: grid;
  gap: 0.5rem;
  padding: 0.6rem;
  border: 1px solid var(--color-border);
  border-radius: 0.7rem;
}

.subtask-item-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.subtask-state {
  font-size: 0.8rem;
  color: var(--color-muted);
}

.subtask-item-actions,
.subtask-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.subtask-actions {
  margin-top: 0.5rem;
}

.subtask-actions .field-hint {
  margin: 0;
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

.ai-suggestion {
  display: grid;
  gap: 0.6rem;
  margin-top: 0.8rem;
}

.ai-suggestion-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.ai-suggestion-actions .field-hint {
  margin: 0;
}

.ai-suggestion-panel {
  display: grid;
  gap: 0.5rem;
  padding: 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: 0.7rem;
}

.ai-suggestion-panel h3 {
  margin: 0;
  font-size: 0.9rem;
}

.ai-suggestion-origin {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
}

.ai-suggestion-content {
  margin: 0;
  padding: 0.6rem;
  max-height: 14rem;
  overflow: auto;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-family: inherit;
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-word;
}

.ai-suggestion-notice {
  margin: 0;
  font-size: 0.85rem;
}

.ai-suggestion-list {
  display: grid;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
  list-style: none;
}

.ai-suggestion-item {
  display: grid;
  gap: 0.4rem;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
}

.ai-suggestion-item-select {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}

</style>
