<script setup lang="ts">
import { computed, inject, nextTick, onMounted, ref, useId, type Ref } from 'vue';
import type { AiConnectionProbe } from '@/application/ai/ai-connection-tester';
import type { AiConfigStatus, AiProviderService } from '@/application/ai/ai-provider-service';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import {
  AI_PROVIDERS,
  resolveOrigin,
  validateApiBase,
  type AiConfigFieldErrors,
  type AiProvider,
} from '@/domain/ai-provider';
import {
  AI_BLOCK_LABELS,
  AI_CREDENTIAL_LOCAL_NOTICE,
  AI_CREDENTIAL_SAVED_MARK,
  AI_CUSTOM_HINT,
  AI_FAILURE_LABELS,
  AI_MINIMAL_PROBE_NOTICE,
  AI_OFFICIAL_BASES,
  AI_OPTIONAL_NOTICE,
  AI_PERMISSION_REFUSED_MESSAGE,
  AI_PERMISSION_REVOKED_MESSAGE,
  AI_PROVIDER_LABELS,
  AI_REMOVE_CONFIRM_MESSAGE,
  AI_REMOVE_CONFIRM_TITLE,
  AI_REMOVED_MESSAGE,
  AI_SAVED_MESSAGE,
  AI_TEST_SUCCESS_MESSAGE,
  aiConsentMessage,
} from './ai-provider-labels';
import { aiProviderServiceKey } from './ai-service-key';

const emit = defineEmits<{ close: [] }>();

function injectAiService(): AiProviderService {
  const injected = inject(aiProviderServiceKey);

  if (!injected) {
    throw new Error('AiProviderService não foi fornecido para a aplicação.');
  }

  return injected;
}

const service = injectAiService();
const fieldId = useId();

const status = ref<AiConfigStatus>({ state: 'NONE' });
const loaded = ref(false);
const provider = ref<AiProvider>('OPENAI');
const apiBase = ref('');
/** Valor digitado, mantido apenas neste componente: nunca vai para estado compartilhado. */
const credential = ref('');
const model = ref('');
const revealed = ref(false);
const errors = ref<AiConfigFieldErrors>({});
const formMessage = ref<string | null>(null);
const feedback = ref<{ tone: 'success' | 'warning'; text: string } | null>(null);
const actionError = ref<string | null>(null);
const saving = ref(false);
const testing = ref(false);
const removing = ref(false);
const removeOpen = ref(false);
/** Origem já consentida nesta sessão da área; trocar de origem reapresenta o aviso. */
const consentedOrigin = ref<string | null>(null);
const pendingProbe = ref<AiConnectionProbe | null>(null);
const minimalProbeOffered = ref(false);

const heading = ref<HTMLElement | null>(null);
const actionAlert = ref<HTMLElement | null>(null);
const formAlert = ref<HTMLElement | null>(null);
const apiBaseField = ref<HTMLInputElement | null>(null);
const credentialField = ref<HTMLInputElement | null>(null);
const modelField = ref<HTMLInputElement | null>(null);
const consentButton = ref<HTMLButtonElement | null>(null);

const blocked = computed(() => (status.value.state === 'BLOCKED' ? status.value.blocked : null));
const configured = computed(() => (status.value.state === 'CONFIGURED' ? status.value : null));
const permissionGranted = computed(() => configured.value?.permissionGranted ?? false);
const hasCredential = computed(() => configured.value?.summary.hasCredential ?? false);
const busy = computed(() => saving.value || testing.value || removing.value);

/** Base fixa dos provedores oficiais, exibida de forma legível e não editável. */
const officialBase = computed(() =>
  provider.value === 'CUSTOM' ? null : AI_OFFICIAL_BASES[provider.value],
);

/** Origem resolvida do que está no formulário; `null` enquanto a base informada for inválida. */
const draftOrigin = computed(() => {
  if (provider.value !== 'CUSTOM') {
    return resolveOrigin(AI_OFFICIAL_BASES[provider.value]);
  }

  const validated = validateApiBase(apiBase.value);
  return validated.ok ? resolveOrigin(validated.base) : null;
});

const savedOrigin = computed(() => configured.value?.summary.origin ?? null);

const consentNeeded = computed(
  () => savedOrigin.value !== null && consentedOrigin.value !== savedOrigin.value,
);

function applyStatus(next: AiConfigStatus): void {
  status.value = next;

  if (next.state === 'CONFIGURED') {
    provider.value = next.summary.provider;
    apiBase.value = next.summary.provider === 'CUSTOM' ? next.summary.apiBase : '';
    model.value = next.summary.model;
  }

  // O campo de credencial nunca é preenchido com o valor armazenado.
  credential.value = '';
  revealed.value = false;
}

async function focusElement(element: Ref<HTMLElement | null>): Promise<void> {
  await nextTick();
  element.value?.focus();
}

function resetMessages(): void {
  feedback.value = null;
  actionError.value = null;
  formMessage.value = null;
  errors.value = {};
  minimalProbeOffered.value = false;
}

onMounted(async () => {
  applyStatus(await service.load());
  loaded.value = true;
  await focusElement(heading);
});

function changeProvider(value: string): void {
  provider.value = value as AiProvider;
  // Trocar de provedor muda a origem de destino: o consentimento anterior não vale mais.
  consentedOrigin.value = null;
  minimalProbeOffered.value = false;
}

function changeApiBase(value: string): void {
  apiBase.value = value;
  consentedOrigin.value = null;
  minimalProbeOffered.value = false;
}

async function focusFirstInvalid(): Promise<void> {
  await nextTick();

  if (errors.value.apiBase) {
    apiBaseField.value?.focus();
    return;
  }

  if (errors.value.credential) {
    credentialField.value?.focus();
    return;
  }

  if (errors.value.model) {
    modelField.value?.focus();
    return;
  }

  formAlert.value?.focus();
}

async function save(): Promise<void> {
  if (busy.value || blocked.value !== null) {
    return;
  }

  const previousOrigin = savedOrigin.value;
  resetMessages();
  saving.value = true;

  const result = await service.save({
    provider: provider.value,
    ...(provider.value === 'CUSTOM' && { apiBase: apiBase.value }),
    // Campo intocado: a credencial já gravada é preservada.
    ...(credential.value !== '' && { credential: credential.value }),
    model: model.value,
  });

  saving.value = false;

  if (result.ok) {
    applyStatus(result.status);

    if (previousOrigin !== savedOrigin.value) {
      consentedOrigin.value = null;
    }

    feedback.value = { tone: 'success', text: AI_SAVED_MESSAGE };
    return;
  }

  if ('blocked' in result) {
    status.value = { state: 'BLOCKED', blocked: result.blocked };
    actionError.value = AI_BLOCK_LABELS[result.blocked];
    await focusElement(actionAlert);
    return;
  }

  errors.value = result.errors;
  formMessage.value = 'Revise os campos destacados.';
  await focusFirstInvalid();
}

/** Aciona o teste apenas por clique; nunca por carregamento, foco ou digitação. */
async function requestTest(probe: AiConnectionProbe): Promise<void> {
  if (busy.value || savedOrigin.value === null) {
    return;
  }

  resetMessages();

  if (consentNeeded.value) {
    pendingProbe.value = probe;
    await focusElement(consentButton as Ref<HTMLElement | null>);
    return;
  }

  await runTest(probe);
}

async function confirmConsent(): Promise<void> {
  const probe = pendingProbe.value ?? 'MODEL_LIST';
  const origin = savedOrigin.value;

  if (origin === null) {
    return;
  }

  consentedOrigin.value = origin;
  pendingProbe.value = null;
  await runTest(probe);
}

function abandonConsent(): void {
  pendingProbe.value = null;
}

async function runTest(probe: AiConnectionProbe): Promise<void> {
  const origin = savedOrigin.value;

  if (origin === null) {
    return;
  }

  testing.value = true;

  // Primeiro await do gesto: o navegador exige que a solicitação parta do clique do usuário.
  const granted = await service.requestPermission(origin);

  if (!granted) {
    testing.value = false;
    applyStatus(await service.load());
    actionError.value = AI_PERMISSION_REFUSED_MESSAGE;
    await focusElement(actionAlert);
    return;
  }

  const result = await service.testConnection(probe);
  testing.value = false;
  applyStatus(await service.load());

  if (result.ok) {
    feedback.value = { tone: 'success', text: AI_TEST_SUCCESS_MESSAGE };
    return;
  }

  if ('blocked' in result) {
    status.value = { state: 'BLOCKED', blocked: result.blocked };
    actionError.value = AI_BLOCK_LABELS[result.blocked];
    await focusElement(actionAlert);
    return;
  }

  minimalProbeOffered.value = result.reason === 'MODEL_LIST_UNSUPPORTED';
  actionError.value =
    result.reason === 'PERMISSION_MISSING'
      ? AI_PERMISSION_REVOKED_MESSAGE
      : AI_FAILURE_LABELS[result.reason];
  await focusElement(actionAlert);
}

async function grantPermission(): Promise<void> {
  const origin = savedOrigin.value;

  if (origin === null || busy.value) {
    return;
  }

  resetMessages();
  const granted = await service.requestPermission(origin);
  applyStatus(await service.load());

  if (!granted) {
    actionError.value = AI_PERMISSION_REFUSED_MESSAGE;
    await focusElement(actionAlert);
  }
}

async function confirmRemoval(): Promise<void> {
  removing.value = true;
  const result = await service.remove();
  removing.value = false;
  removeOpen.value = false;
  resetMessages();

  if (!result.ok) {
    actionError.value = AI_BLOCK_LABELS[result.blocked];
    await focusElement(actionAlert);
    return;
  }

  applyStatus(await service.load());
  provider.value = 'OPENAI';
  apiBase.value = '';
  model.value = '';
  consentedOrigin.value = null;
  feedback.value = { tone: 'success', text: AI_REMOVED_MESSAGE };
  await focusElement(heading);
}
</script>

<template>
  <section class="ai-manager">
    <header class="ai-header">
      <h1 ref="heading" tabindex="-1">Provedores de IA</h1>
      <button type="button" class="button-secondary" :disabled="busy" @click="emit('close')">
        Voltar
      </button>
    </header>

    <p class="ai-optional">{{ AI_OPTIONAL_NOTICE }}</p>

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

    <p v-if="!loaded" class="state" role="status">Carregando configuração…</p>

    <template v-else-if="blocked">
      <section class="ai-section state-error" aria-labelledby="ai-blocked-title">
        <h2 id="ai-blocked-title">Configuração incompatível</h2>
        <p class="ai-blocked">{{ AI_BLOCK_LABELS[blocked] }}</p>
        <button type="button" class="button-danger" :disabled="busy" @click="removeOpen = true">
          Remover configuração
        </button>
      </section>
    </template>

    <template v-else>
      <section class="ai-section" aria-labelledby="ai-config-title">
        <h2 id="ai-config-title">Configuração</h2>
        <p v-if="!configured" class="ai-empty">Nenhum provedor configurado.</p>

        <p
          v-if="formMessage"
          ref="formAlert"
          tabindex="-1"
          class="feedback feedback-error"
          role="alert"
        >
          {{ formMessage }}
        </p>

        <div class="field">
          <label :for="`${fieldId}-provider`">Provedor</label>
          <select
            :id="`${fieldId}-provider`"
            :value="provider"
            @change="changeProvider(($event.target as HTMLSelectElement).value)"
          >
            <option v-for="option in AI_PROVIDERS" :key="option" :value="option">
              {{ AI_PROVIDER_LABELS[option] }}
            </option>
          </select>
        </div>

        <div v-if="officialBase" class="field">
          <p class="field-label">Base da API</p>
          <p class="ai-fixed-base" data-testid="official-base">{{ officialBase }}</p>
          <p class="field-hint">Base fixa deste provedor; não é editável.</p>
        </div>

        <div v-else class="field">
          <label :for="`${fieldId}-base`">Base da API</label>
          <input
            :id="`${fieldId}-base`"
            ref="apiBaseField"
            type="url"
            inputmode="url"
            autocomplete="off"
            spellcheck="false"
            placeholder="http://localhost:11434/v1"
            :value="apiBase"
            :aria-invalid="errors.apiBase ? 'true' : undefined"
            :aria-describedby="errors.apiBase ? `${fieldId}-base-error` : `${fieldId}-base-hint`"
            @input="changeApiBase(($event.target as HTMLInputElement).value)"
          />
          <p :id="`${fieldId}-base-hint`" class="field-hint">{{ AI_CUSTOM_HINT }}</p>
          <p v-if="errors.apiBase" :id="`${fieldId}-base-error`" class="field-error">
            {{ errors.apiBase }}
          </p>
        </div>

        <div class="field">
          <label :for="`${fieldId}-credential`">Credencial</label>
          <div class="credential-row">
            <input
              :id="`${fieldId}-credential`"
              ref="credentialField"
              v-model="credential"
              :type="revealed ? 'text' : 'password'"
              autocomplete="off"
              spellcheck="false"
              :aria-invalid="errors.credential ? 'true' : undefined"
              :aria-describedby="
                errors.credential ? `${fieldId}-credential-error` : `${fieldId}-credential-hint`
              "
            />
            <button
              type="button"
              class="button-secondary"
              :aria-pressed="revealed ? 'true' : 'false'"
              @click="revealed = !revealed"
            >
              {{ revealed ? 'Ocultar credencial' : 'Revelar credencial' }}
            </button>
          </div>
          <p :id="`${fieldId}-credential-hint`" class="field-hint">
            <template v-if="hasCredential">{{ AI_CREDENTIAL_SAVED_MARK }} </template>
            {{ AI_CREDENTIAL_LOCAL_NOTICE }}
          </p>
          <p v-if="errors.credential" :id="`${fieldId}-credential-error`" class="field-error">
            {{ errors.credential }}
          </p>
        </div>

        <div class="field">
          <label :for="`${fieldId}-model`">Modelo</label>
          <input
            :id="`${fieldId}-model`"
            ref="modelField"
            v-model="model"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :aria-invalid="errors.model ? 'true' : undefined"
            :aria-describedby="errors.model ? `${fieldId}-model-error` : undefined"
          />
          <p v-if="errors.model" :id="`${fieldId}-model-error`" class="field-error">
            {{ errors.model }}
          </p>
        </div>

        <p v-if="draftOrigin" class="ai-origin">
          As requisições serão feitas para <strong>{{ draftOrigin }}</strong
          >.
        </p>

        <button type="button" :disabled="busy" @click="save">Salvar configuração</button>
      </section>

      <section v-if="configured" class="ai-section" aria-labelledby="ai-test-title">
        <h2 id="ai-test-title">Teste de conexão</h2>
        <p>
          O teste consulta a listagem de modelos da configuração salva. Nenhum conteúdo de tarefa é
          enviado.
        </p>

        <p v-if="!permissionGranted" class="ai-permission" role="status">
          {{ AI_PERMISSION_REVOKED_MESSAGE }}
        </p>
        <button
          v-if="!permissionGranted"
          type="button"
          class="button-secondary"
          :disabled="busy"
          @click="grantPermission"
        >
          Conceder permissão
        </button>

        <div v-if="pendingProbe" class="ai-consent" role="alert">
          <p>{{ aiConsentMessage(savedOrigin ?? '') }}</p>
          <p v-if="pendingProbe === 'MINIMAL_COMPLETION'">{{ AI_MINIMAL_PROBE_NOTICE }}</p>
          <div class="ai-consent-actions">
            <button type="button" class="button-secondary" @click="abandonConsent">Cancelar</button>
            <button ref="consentButton" type="button" @click="confirmConsent">
              Enviar credencial e testar
            </button>
          </div>
        </div>

        <button
          v-else
          type="button"
          :disabled="busy"
          data-testid="test-connection"
          @click="requestTest('MODEL_LIST')"
        >
          Testar conexão
        </button>

        <template v-if="minimalProbeOffered && !pendingProbe">
          <p class="ai-minimal-note">{{ AI_MINIMAL_PROBE_NOTICE }}</p>
          <button
            type="button"
            class="button-secondary"
            :disabled="busy"
            data-testid="minimal-probe"
            @click="requestTest('MINIMAL_COMPLETION')"
          >
            Fazer verificação mínima
          </button>
        </template>

        <p v-if="testing" class="state" role="status">Testando conexão…</p>
      </section>

      <section v-if="configured" class="ai-section" aria-labelledby="ai-remove-title">
        <h2 id="ai-remove-title">Remover configuração</h2>
        <p>
          Remover apaga a credencial deste dispositivo e revoga a permissão de acesso à origem do
          provedor.
        </p>
        <button type="button" class="button-danger" :disabled="busy" @click="removeOpen = true">
          Remover configuração
        </button>
      </section>
    </template>

    <ConfirmDialog
      v-if="removeOpen"
      :title="AI_REMOVE_CONFIRM_TITLE"
      :message="AI_REMOVE_CONFIRM_MESSAGE"
      confirm-label="Remover"
      :busy="removing"
      @confirm="confirmRemoval"
      @cancel="removeOpen = false"
    />
  </section>
</template>

<style scoped>
.ai-manager {
  display: grid;
  gap: 1rem;
}

.ai-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.ai-header h1 {
  margin: 0;
  font-size: 1.35rem;
}

.live-region:empty {
  position: absolute;
}

.ai-optional {
  margin: 0;
  color: var(--color-muted);
  line-height: 1.45;
}

.ai-section {
  display: grid;
  gap: 0.6rem;
  justify-items: start;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: 0.9rem;
  background: var(--color-surface);
}

.ai-section h2,
.ai-section p {
  margin: 0;
}

.ai-section h2 {
  font-size: 1.05rem;
}

.ai-section p {
  color: var(--color-muted);
  line-height: 1.45;
}

.state-error {
  border-color: var(--color-danger);
}

.ai-blocked {
  color: var(--color-danger);
}

.ai-empty {
  font-size: 0.9rem;
}

.field {
  display: grid;
  gap: 0.3rem;
  justify-items: stretch;
  width: 100%;
}

.field label,
.field-label {
  color: var(--color-ink);
  font-size: 0.85rem;
  font-weight: 600;
}

.field input,
.field select {
  width: 100%;
  border: 1px solid var(--color-control-border);
  border-radius: 0.6rem;
  padding: 0.55rem 0.7rem;
  color: var(--color-ink);
  background: var(--color-surface);
  font: inherit;
}

.field input:focus-visible,
.field select:focus-visible {
  outline: 3px solid var(--color-focus-ring);
  outline-offset: 2px;
}

.field-hint {
  font-size: 0.8rem;
}

.field-error {
  color: var(--color-danger);
  font-size: 0.8rem;
}

.ai-fixed-base {
  padding: 0.4rem 0.6rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.6rem;
  color: var(--color-ink);
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}

.credential-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}

.credential-row input {
  flex: 1 1 12rem;
}

.ai-origin {
  color: var(--color-ink);
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}

.ai-origin strong {
  font-family: ui-monospace, SFMono-Regular, monospace;
}

.ai-permission {
  color: var(--color-danger);
  font-size: 0.85rem;
}

.ai-consent {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--color-danger);
  border-radius: 0.7rem;
}

.ai-consent p {
  color: var(--color-ink);
  font-size: 0.85rem;
}

.ai-consent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.ai-minimal-note {
  font-size: 0.8rem;
}

.state {
  margin: 0;
  padding: 0.6rem 0.75rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.7rem;
}
</style>
