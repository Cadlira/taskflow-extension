<script setup lang="ts">
import QuickAdd from '@/components/quick-add/QuickAdd.vue';
import { ChromeSidePanelNavigator } from '@/infrastructure/chrome/chrome-side-panel-navigator';
import { useConnectedTaskStore } from '@/stores/task-store';

useConnectedTaskStore();

const navigator = new ChromeSidePanelNavigator();

function closePopup(): void {
  window.close();
}
</script>

<template>
  <QuickAdd :navigator="navigator" @manager-opened="closePopup" />
</template>
