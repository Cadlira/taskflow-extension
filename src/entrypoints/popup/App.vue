<script setup lang="ts">
import { ref } from 'vue';
import { openTaskManager } from '@/application/open-task-manager';
import FoundationStatus from '@/components/FoundationStatus.vue';
import { ChromeSidePanelNavigator } from '@/infrastructure/chrome/chrome-side-panel-navigator';

const feedback = ref('');

async function handleOpenManager(): Promise<void> {
  feedback.value = '';

  try {
    await openTaskManager(new ChromeSidePanelNavigator());
    window.close();
  } catch {
    feedback.value = 'Não foi possível abrir o painel lateral.';
  }
}
</script>

<template>
  <main class="popup-shell">
    <FoundationStatus
      title="TaskFlow"
      description="O Quick Add será implementado após a revisão da primeira Change OpenSpec."
    />
    <button type="button" @click="handleOpenManager">Abrir gerenciamento</button>
    <p v-if="feedback" class="feedback" role="alert">{{ feedback }}</p>
  </main>
</template>
