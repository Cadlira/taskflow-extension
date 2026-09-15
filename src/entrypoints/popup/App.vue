<script setup lang="ts">
import QuickAdd from '@/components/quick-add/QuickAdd.vue';
import { ChromeActivePageReader } from '@/infrastructure/chrome/chrome-active-page-reader';
import { ChromeSidePanelNavigator } from '@/infrastructure/chrome/chrome-side-panel-navigator';
import { useConnectedTaskStore } from '@/stores/task-store';

useConnectedTaskStore();

const navigator = new ChromeSidePanelNavigator();
const pageReader = new ChromeActivePageReader();

function closePopup(): void {
  window.close();
}
</script>

<template>
  <QuickAdd :navigator="navigator" :page-reader="pageReader" @manager-opened="closePopup" />
</template>
