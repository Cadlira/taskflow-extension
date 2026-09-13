<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    busy?: boolean;
  }>(),
  { confirmLabel: 'Confirmar', cancelLabel: 'Cancelar', busy: false },
);

const emit = defineEmits<{ confirm: []; cancel: [] }>();

const id = useId();
const cancelButton = ref<HTMLButtonElement | null>(null);
const confirmButton = ref<HTMLButtonElement | null>(null);
const previouslyFocused = document.activeElement as HTMLElement | null;

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault();
    // Enquanto processa, a operação já foi disparada e não pode ser cancelada.
    if (!props.busy) {
      emit('cancel');
    }
    return;
  }

  // Mantém o foco dentro do diálogo enquanto ele estiver aberto.
  if (event.key === 'Tab') {
    const focusable = [cancelButton.value, confirmButton.value].filter(
      (element): element is HTMLButtonElement => element !== null && !element.disabled,
    );
    const first = focusable[0];
    const last = focusable.at(-1);

    if (!first) {
      event.preventDefault();
      return;
    }

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  }
}

onMounted(() => {
  cancelButton.value?.focus();
});

onBeforeUnmount(() => {
  previouslyFocused?.focus?.();
});
</script>

<template>
  <div class="dialog-backdrop" @keydown="handleKeydown">
    <div
      class="dialog"
      role="alertdialog"
      aria-modal="true"
      :aria-labelledby="`${id}-title`"
      :aria-describedby="`${id}-message`"
    >
      <h2 :id="`${id}-title`">{{ title }}</h2>
      <p :id="`${id}-message`">{{ message }}</p>
      <div class="dialog-actions">
        <button
          ref="cancelButton"
          type="button"
          class="button-secondary"
          :disabled="busy"
          @click="emit('cancel')"
        >
          {{ cancelLabel }}
        </button>
        <button
          ref="confirmButton"
          type="button"
          class="button-danger"
          :disabled="busy"
          @click="emit('confirm')"
        >
          {{ confirmLabel }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dialog-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: rgb(23 32 51 / 45%);
}

.dialog {
  display: grid;
  gap: 0.75rem;
  width: min(100%, 22rem);
  padding: 1.1rem;
  border-radius: 0.9rem;
  background: var(--color-surface);
  box-shadow: 0 12px 32px rgb(23 32 51 / 25%);
}

.dialog h2,
.dialog p {
  margin: 0;
}

.dialog h2 {
  font-size: 1.05rem;
}

.dialog p {
  color: var(--color-muted);
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
