import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { backupServiceKey } from '@/components/backup/backup-service-key';
import { pendingCaptureKey } from '@/components/capture/pending-capture-key';
import { createChromeBackupService } from '@/composition/chrome-backup-service';
import { trashServiceKey } from '@/components/trash/trash-service-key';
import { createChromeTaskServices } from '@/composition/chrome-task-service';
import { ChromePendingCaptureInbox } from '@/infrastructure/chrome/chrome-pending-capture-inbox';
import { taskServiceKey } from '@/stores/task-store';
import App from './App.vue';
import '@/styles/base.css';
import './style.css';

const app = createApp(App);
const { tasks, trash } = createChromeTaskServices();

app.provide(taskServiceKey, tasks);
app.provide(trashServiceKey, trash);
app.provide(backupServiceKey, createChromeBackupService());
app.provide(pendingCaptureKey, new ChromePendingCaptureInbox());
app.use(createPinia());
app.mount('#app');
