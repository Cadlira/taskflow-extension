import { createPinia } from 'pinia';
import { createApp } from 'vue';
import { createChromeTaskService } from '@/composition/chrome-task-service';
import { taskServiceKey } from '@/stores/task-store';
import App from './App.vue';
import '@/styles/base.css';
import './style.css';

createApp(App).provide(taskServiceKey, createChromeTaskService()).use(createPinia()).mount('#app');
