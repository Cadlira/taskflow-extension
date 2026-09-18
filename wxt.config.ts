import { defineConfig } from 'wxt';

export default defineConfig({
  srcDir: 'src',
  manifestVersion: 3,
  modules: ['@wxt-dev/module-vue'],
  manifest: {
    name: 'TaskFlow',
    description: 'Capture rapidamente e gerencie suas tarefas.',
    version: '0.1.0',
    permissions: ['activeTab', 'alarms', 'contextMenus', 'notifications', 'sidePanel', 'storage'],
    // Dois dos quatro atalhos sugeridos que o Chrome admite por extensão ficam livres.
    commands: {
      // Comando reservado: o navegador abre o popup do Quick Add sem passar por `onCommand`.
      _execute_action: {
        suggested_key: { default: 'Ctrl+Shift+K', mac: 'Command+Shift+K' },
      },
      'open-task-manager': {
        suggested_key: { default: 'Ctrl+Shift+L', mac: 'Command+Shift+L' },
        description: 'Abrir o gerenciamento de tarefas no Side Panel',
      },
    },
  },
});
