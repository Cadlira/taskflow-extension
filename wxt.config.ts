import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'TaskFlow',
    description: 'Capture rapidamente e gerencie suas tarefas.',
    version: '0.1.0',
    permissions: ['sidePanel'],
  },
});
