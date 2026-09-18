<script setup lang="ts">
import { inject, onMounted, ref } from 'vue';
import {
  SHORTCUT_ACTION_LABELS,
  SHORTCUT_ACTION_ORDER,
  type ActionShortcut,
} from '@/application/keyboard-shortcuts';
import { shortcutsReaderKey } from './shortcuts-reader-key';

const NO_SHORTCUT_LABEL = 'Sem atalho atribuído';
const READ_ERROR_MESSAGE = 'Não foi possível obter os atalhos em vigor.';

const reader = inject(shortcutsReaderKey, null);
const shortcuts = ref<ActionShortcut[]>([]);
const readError = ref<string | null>(null);

/** O navegador é a fonte da verdade: a consulta acontece a cada apresentação do bloco. */
async function loadShortcuts(): Promise<void> {
  if (!reader) return;

  try {
    const current = await reader.read();
    shortcuts.value = SHORTCUT_ACTION_ORDER.flatMap((action) =>
      current.filter((shortcut) => shortcut.action === action),
    );
    readError.value = null;
  } catch {
    shortcuts.value = [];
    readError.value = READ_ERROR_MESSAGE;
  }
}

onMounted(loadShortcuts);

async function customize(): Promise<void> {
  if (!reader) return;

  try {
    await reader.openCustomization();
  } catch {
    readError.value = 'Não foi possível abrir a tela de atalhos do navegador.';
  }
}
</script>

<template>
  <section v-if="reader" class="shortcuts-hint" aria-labelledby="shortcuts-hint-heading">
    <h2 id="shortcuts-hint-heading">Atalhos de teclado</h2>

    <p v-if="readError" class="shortcuts-hint-error">{{ readError }}</p>

    <dl v-if="shortcuts.length > 0" class="shortcuts-hint-list">
      <template v-for="shortcut in shortcuts" :key="shortcut.action">
        <dt>{{ SHORTCUT_ACTION_LABELS[shortcut.action] }}</dt>
        <dd v-if="shortcut.combination">
          <kbd>{{ shortcut.combination }}</kbd>
        </dd>
        <dd v-else class="shortcuts-hint-missing">{{ NO_SHORTCUT_LABEL }}</dd>
      </template>
    </dl>

    <button type="button" class="button-secondary button-small" @click="customize">
      Personalizar atalhos
    </button>
  </section>
</template>

<style scoped>
.shortcuts-hint {
  display: grid;
  gap: 0.5rem;
  justify-items: start;
  padding: 0.85rem;
  border: 1px dashed var(--color-border-strong);
  border-radius: 0.9rem;
  background: var(--color-surface);
}

.shortcuts-hint h2 {
  margin: 0;
  color: var(--color-ink);
  font-size: 0.9rem;
}

.shortcuts-hint-error {
  margin: 0;
  color: var(--color-danger);
  font-size: 0.8rem;
  line-height: 1.4;
}

.shortcuts-hint-list {
  display: grid;
  grid-template-columns: auto auto;
  align-items: baseline;
  gap: 0.3rem 0.75rem;
  margin: 0;
}

.shortcuts-hint-list dt {
  color: var(--color-ink);
  font-size: 0.8rem;
}

.shortcuts-hint-list dd {
  margin: 0;
  font-size: 0.8rem;
}

.shortcuts-hint-list kbd {
  padding: 0.1rem 0.35rem;
  border: 1px solid var(--color-control-border);
  border-radius: 0.35rem;
  color: var(--color-ink);
  background: var(--color-page);
  font-family: inherit;
  font-size: 0.78rem;
}

.shortcuts-hint-missing {
  color: var(--color-muted);
}
</style>
