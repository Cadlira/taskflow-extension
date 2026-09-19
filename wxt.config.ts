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
    // Teto do que pode ser pedido em tempo de execução: declarar não concede. A concessão efetiva
    // é sempre a origem específica do provedor configurado, pedida a partir de gesto do usuário.
    // Padrões de correspondência ignoram a porta, então localhost cobre :11434 e :1234.
    optional_host_permissions: ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'],
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
