import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { aiProviderServiceKey } from '@/components/ai/ai-service-key';
import { aiSubtaskSuggestionServiceKey } from '@/components/ai/ai-suggestion-key';
import { backupServiceKey } from '@/components/backup/backup-service-key';
import { pendingCaptureKey } from '@/components/capture/pending-capture-key';
import {
  createChromeAiProviderService,
  createChromeAiSubtaskSuggestionService,
} from '@/composition/chrome-ai-service';
import { createChromeBackupService } from '@/composition/chrome-backup-service';
import { shortcutsReaderKey } from '@/components/shortcuts/shortcuts-reader-key';
import { trashServiceKey } from '@/components/trash/trash-service-key';
import { createChromeTaskServices } from '@/composition/chrome-task-service';
import { ChromePendingCaptureInbox } from '@/infrastructure/chrome/chrome-pending-capture-inbox';
import { ChromeShortcutsReader } from '@/infrastructure/chrome/chrome-shortcuts-reader';
import { taskServiceKey } from '@/stores/task-store';
import App from './App.vue';
import '@/styles/base.css';
import './style.css';

const app = createApp(App);
const { tasks, trash } = createChromeTaskServices();

app.provide(taskServiceKey, tasks);
app.provide(trashServiceKey, trash);
app.provide(backupServiceKey, createChromeBackupService());
app.provide(aiProviderServiceKey, createChromeAiProviderService());
app.provide(aiSubtaskSuggestionServiceKey, createChromeAiSubtaskSuggestionService());
app.provide(pendingCaptureKey, new ChromePendingCaptureInbox());
app.provide(shortcutsReaderKey, new ChromeShortcutsReader());
app.use(createPinia());
app.mount('#app');
