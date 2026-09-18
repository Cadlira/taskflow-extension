## Why

Hoje as duas ações mais frequentes do TaskFlow — registrar uma tarefa rápida e abrir o gerenciamento — exigem tirar a mão do teclado, encontrar o ícone da extensão e clicar. A API `chrome.commands` resolve isso sem nenhuma permissão nova, reaproveitando o popup e o Side Panel que já existem, e o Manifest reserva no máximo quatro atalhos sugeridos por extensão: definir agora as duas combinações realmente usadas preserva os dois slots restantes para evoluções futuras em vez de gastá-los em suposições.

## What Changes

- Declarar a chave `commands` no Manifest com exatamente dois comandos e nenhuma permissão adicional:
  - `_execute_action`, sugerido como `Ctrl+Shift+K` e `Command+Shift+K` no macOS, que abre o popup do Quick Add com o foco inicial no título. O Chrome executa esse comando reservado diretamente e não aciona `commands.onCommand`.
  - `open-task-manager`, sugerido como `Ctrl+Shift+L` e `Command+Shift+L` no macOS, com descrição em pt-BR, que abre o Side Panel na listagem de tarefas.
- Tratar `open-task-manager` no service worker, abrindo o Side Panel na janela da aba recebida pelo próprio evento, sem consultar a janela atual de forma assíncrona antes da abertura.
- Tornar o comando de gerenciamento idempotente: acioná-lo com o Side Panel já aberto mantém pesquisa, filtros e formulário em edição como estavam.
- Degradar em silêncio quando a combinação sugerida já estiver ocupada pelo Chrome, pelo sistema operacional ou por outra extensão: a extensão continua instalando e funcionando, o comando apenas fica sem atalho e o ícone e a ação "Abrir gerenciamento" seguem sendo o caminho principal.
- Apresentar no fim da listagem do Side Panel um bloco discreto com os atalhos efetivos lidos de `commands.getAll()`, indicando explicitamente quando um comando está sem atalho e oferecendo abrir `chrome://extensions/shortcuts` para personalizar.

## Capabilities

### New Capabilities

- `keyboard-shortcuts`: atalhos de teclado do TaskFlow — quais comandos existem, o que cada um abre, como o sistema se comporta quando a combinação sugerida não pode ser atribuída e como os atalhos efetivos são apresentados e personalizados.

### Modified Capabilities

<!-- Nenhuma. O estado inicial do Quick Add já é definido por `quick-add` e vale para qualquer forma de abertura do popup; o contraste e a operação por teclado do novo bloco já estão cobertos por `interface-accessibility`. -->

## Impact

- **Manifest**: nova chave `commands` em `wxt.config.ts`. As permissões declaradas permanecem exatamente `activeTab`, `alarms`, `contextMenus`, `notifications`, `sidePanel` e `storage`.
- **Service worker**: novo listener de `commands.onCommand` em `src/entrypoints/background.ts`, reaproveitando `openSidePanelInWindow` e o padrão de log sem dados de tarefa já existentes.
- **Camada de aplicação**: nova porta de leitura dos atalhos efetivos, sem dependência de API do Chrome.
- **Infraestrutura**: novo adapter em `src/infrastructure/chrome/` para `commands.getAll()` e para abrir a página de personalização, no mesmo padrão de `ChromeSidePanelNavigator` e `ChromePendingCaptureInbox`.
- **Interface**: novo bloco informativo no fim da listagem do Side Panel, em pt-BR, operável por teclado e dentro dos limites de contraste vigentes.
- **Testes**: cobertura de Manifest, do service worker e do novo bloco, mais verificação manual das combinações em Windows e macOS.

## Non-Goals

- Comandos globais (`"global": true`), que só admitem sugestões `Ctrl+Shift+0..9` e disputariam atalhos fora do navegador.
- Atalho para o dashboard local, porque a `TF-009` foi adiada.
- Atalho para captura da página, que consumiria um dos dois slots sugeridos restantes sem evidência de uso; a captura continua pelo menu de contexto e pela ação "Usar página atual".
- Atalhos capturados dentro da página por content script, que exigiriam permissões de host.
- Atalhos internos das telas do popup e do Side Panel, que não usam `chrome.commands` e trazem conflito próprio com a digitação em campos.
- Declarar comandos sem `suggested_key`, que nasceriam invisíveis e dependeriam de configuração manual para existir.
- Mover o foco do teclado para dentro do Side Panel ao abri-lo por atalho.
