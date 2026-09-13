<script setup lang="ts">
import { computed, inject, nextTick, ref, shallowRef, type Ref } from 'vue';
import type {
  BackupFailureReason,
  BackupService,
  PreparedRestore,
} from '@/application/backup/backup-service';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import { formatDateTime } from '@/components/tasks/date-time';
import { REMINDERS_PENDING_MESSAGE } from '@/components/tasks/task-labels';
import type { BackupIssue } from '@/domain/task-integrity';
import {
  BACKUP_FIELD_LABELS,
  BACKUP_REASON_LABELS,
  BACKUP_RESTORE_UNCONFIRMED_MESSAGE,
  BACKUP_UNENCRYPTED_WARNING,
  RESTORE_CONFIRM_MESSAGE,
  RESTORE_CONFIRM_TITLE,
} from './backup-labels';
import { backupServiceKey } from './backup-service-key';
import { downloadTextFile } from './download-text-file';

interface RestoreFeedback {
  tone: 'success' | 'warning';
  text: string;
}

const emit = defineEmits<{ close: []; restored: [feedback: RestoreFeedback] }>();

const service = inject(backupServiceKey);

type State = 'idle' | 'reading' | 'rejected' | 'preview' | 'restoring';

interface Rejection {
  reason: BackupFailureReason;
  issues: BackupIssue[];
  extraIssueCount: number;
}

const state = ref<State>('idle');
const feedback = ref<RestoreFeedback | null>(null);
const actionError = ref<string | null>(null);
const rejection = ref<Rejection | null>(null);
const prepared = shallowRef<PreparedRestore | null>(null);
const confirmOpen = ref(false);

const actionAlert = ref<HTMLElement | null>(null);
const rejectionAlert = ref<HTMLElement | null>(null);

const busy = computed(() => state.value === 'reading' || state.value === 'restoring');

function requireService(): BackupService {
  if (!service) {
    throw new Error('BackupService não foi fornecido para a aplicação.');
  }

  return service;
}

function countLabel(count: number): string {
  return count === 1 ? 'tarefa' : 'tarefas';
}

async function focusAlert(element: Ref<HTMLElement | null>): Promise<void> {
  await nextTick();
  element.value?.focus();
}

function resetMessages(): void {
  feedback.value = null;
  actionError.value = null;
  rejection.value = null;
}

async function handleExport(): Promise<void> {
  resetMessages();
  const result = await requireService().exportBackup();

  if (result.ok) {
    downloadTextFile(result.fileName, result.content);
    feedback.value = {
      tone: 'success',
      text: `Backup com ${result.taskCount} ${countLabel(result.taskCount)} exportado.`,
    };
    return;
  }

  actionError.value = BACKUP_REASON_LABELS[result.reason];
  await focusAlert(actionAlert);
}

async function handleFileSelection(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';

  if (!file) {
    return;
  }

  resetMessages();
  prepared.value = null;
  state.value = 'reading';

  const result = await requireService().prepareRestore(file);

  if (result.ok) {
    prepared.value = result.prepared;
    state.value = 'preview';
    return;
  }

  rejection.value = {
    reason: result.reason,
    issues: result.issues ?? [],
    extraIssueCount: result.extraIssueCount ?? 0,
  };
  state.value = 'rejected';
  await focusAlert(rejectionAlert);
}

function cancelPreview(): void {
  prepared.value = null;
  state.value = 'idle';
  resetMessages();
}

function requestRestore(): void {
  confirmOpen.value = true;
}

async function confirmRestore(): Promise<void> {
  const value = prepared.value;
  if (!value) {
    return;
  }

  state.value = 'restoring';
  const result = await requireService().restore(value);
  confirmOpen.value = false;

  if (!result.ok) {
    state.value = 'preview';
    actionError.value = BACKUP_REASON_LABELS[result.reason];
    await focusAlert(actionAlert);
    return;
  }

  const restored = `Restauração concluída: ${result.restoredCount} ${countLabel(
    result.restoredCount,
  )} restaurada${result.restoredCount === 1 ? '' : 's'}.`;
  let text = restored;

  if (!result.verified) {
    text = `${text} ${BACKUP_RESTORE_UNCONFIRMED_MESSAGE}`;
  }
  if (result.remindersPending) {
    text = `${text} ${REMINDERS_PENDING_MESSAGE}`;
  }

  prepared.value = null;
  state.value = 'idle';
  emit('restored', {
    tone: result.verified && !result.remindersPending ? 'success' : 'warning',
    text,
  });
}
</script>

<template>
  <section class="backup-manager">
    <header class="backup-header">
      <h1>Backup</h1>
      <button type="button" class="button-secondary" :disabled="busy" @click="emit('close')">
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

    <section class="backup-section" aria-labelledby="backup-export-title">
      <h2 id="backup-export-title">Exportar dados</h2>
      <p>Gera um arquivo JSON com todas as suas tarefas, independentemente dos filtros da listagem.</p>
      <button type="button" :disabled="busy" @click="handleExport">Exportar backup</button>
      <p class="backup-warning">{{ BACKUP_UNENCRYPTED_WARNING }}</p>
    </section>

    <section class="backup-section" aria-labelledby="backup-restore-title">
      <h2 id="backup-restore-title">Restaurar backup</h2>

      <template v-if="state === 'reading'">
        <p class="state" role="status">Lendo arquivo…</p>
      </template>

      <template v-else-if="(state === 'preview' || state === 'restoring') && prepared">
        <div class="backup-preview">
          <h3>Prévia da restauração</h3>
          <dl class="preview-details">
            <dt>Exportado em</dt>
            <dd>{{ formatDateTime(prepared.exportedAt) }}</dd>
            <dt>Versão do formato</dt>
            <dd>{{ prepared.formatVersion }}</dd>
            <dt>Gerado por</dt>
            <dd>TaskFlow {{ prepared.appVersion }}</dd>
            <dt>Tarefas no arquivo</dt>
            <dd>{{ prepared.fileTaskCount }}</dd>
            <dt>Tarefas locais</dt>
            <dd>{{ prepared.localTaskCount }}</dd>
          </dl>

          <p class="preview-note">A restauração substitui todas as tarefas atuais.</p>
          <p v-if="prepared.fileTaskCount === 0" class="preview-note">
            Nenhuma tarefa será restaurada e
            <template v-if="prepared.localTaskCount > 0">
              as {{ prepared.localTaskCount }} tarefas locais serão removidas.
            </template>
            <template v-else>não há tarefas locais a remover.</template>
          </p>
          <p class="backup-warning">{{ BACKUP_UNENCRYPTED_WARNING }}</p>

          <div class="preview-actions">
            <button type="button" class="button-secondary" :disabled="busy" @click="handleExport">
              Exportar dados atuais
            </button>
            <button type="button" class="button-secondary" :disabled="busy" @click="cancelPreview">
              Cancelar
            </button>
            <button type="button" class="button-danger" :disabled="busy" @click="requestRestore">
              Restaurar
            </button>
          </div>

          <p v-if="state === 'restoring'" class="state" role="status">Restaurando backup…</p>
        </div>
      </template>

      <template v-else>
        <p>Escolha um arquivo exportado pelo TaskFlow para substituir todas as tarefas atuais.</p>
        <div class="file-picker">
          <label class="button-secondary file-picker-label" for="backup-file-input">
            Escolher arquivo de backup
          </label>
          <input
            id="backup-file-input"
            type="file"
            accept=".json,application/json"
            @change="handleFileSelection"
          />
        </div>

        <section
          v-if="state === 'rejected' && rejection"
          ref="rejectionAlert"
          class="state state-error rejection"
          role="alert"
          tabindex="-1"
        >
          <p class="rejection-reason">{{ BACKUP_REASON_LABELS[rejection.reason] }}</p>
          <ul v-if="rejection.issues.length > 0" class="rejection-issues">
            <li v-for="(issue, index) in rejection.issues" :key="index">
              Tarefa {{ issue.taskIndex + 1
              }}<template v-if="issue.taskTitle"> (“{{ issue.taskTitle }}”)</template>:
              {{ BACKUP_FIELD_LABELS[issue.field] }} — {{ issue.message }}
            </li>
          </ul>
          <p v-if="rejection.extraIssueCount > 0" class="rejection-extra">
            … e mais {{ rejection.extraIssueCount }}
            {{ rejection.extraIssueCount === 1 ? 'erro' : 'erros' }}.
          </p>
        </section>
      </template>
    </section>

    <ConfirmDialog
      v-if="confirmOpen"
      :title="RESTORE_CONFIRM_TITLE"
      :message="RESTORE_CONFIRM_MESSAGE"
      confirm-label="Substituir tarefas"
      :busy="state === 'restoring'"
      @confirm="confirmRestore"
      @cancel="confirmOpen = false"
    />
  </section>
</template>

<style scoped>
.backup-manager {
  display: grid;
  gap: 1rem;
}

.backup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.backup-header h1 {
  margin: 0;
  font-size: 1.35rem;
}

.live-region:empty {
  position: absolute;
}

.backup-section {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.9rem;
  background: var(--color-surface);
}

.backup-section h2,
.backup-section h3,
.backup-section p {
  margin: 0;
}

.backup-section h2 {
  font-size: 1.05rem;
}

.backup-section h3 {
  font-size: 0.95rem;
}

.backup-section p {
  color: var(--color-muted);
  line-height: 1.45;
}

.backup-warning {
  font-size: 0.8rem;
}

.state {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.7rem;
}

.state-error {
  border-color: var(--color-danger);
}

.state-error p:first-child {
  color: var(--color-danger);
}

.preview-details {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.2rem 0.75rem;
  margin: 0;
}

.preview-details dt {
  color: var(--color-muted);
  font-size: 0.8rem;
}

.preview-details dd {
  margin: 0;
  font-size: 0.85rem;
}

.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.file-picker {
  position: relative;
}

.file-picker input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

.file-picker-label {
  display: inline-block;
}

.file-picker:focus-within .file-picker-label {
  outline: 2px solid var(--color-accent, currentColor);
  outline-offset: 2px;
}

.rejection {
  display: grid;
  gap: 0.4rem;
}

.rejection-issues {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--color-danger);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}

.rejection-extra {
  font-size: 0.8rem;
}
</style>
