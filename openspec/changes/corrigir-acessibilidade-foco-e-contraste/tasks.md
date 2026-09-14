## 1. Tokens de contraste

- [x] 1.1 Em `src/styles/base.css`, criar `--color-page` (`#f7f8fc`) e substituir os literais do fundo; criar `--color-focus-ring` (`var(--color-primary-strong)`) e `--color-control-border` (`#7b869b`); usar `--color-focus-ring` em todos os `outline` de foco e `--color-control-border` na borda de `input`, `select` e `textarea`, mantendo `--color-border-strong` nas bordas decorativas. Verificar por inspeção que `#aeb9ff` não aparece mais em `src/` e que `npm run test` continua passando.
- [x] 1.2 Criar `tests/styles/contrast.test.ts` conforme a decisão 6 do design: extração dos tokens do `:root`, pares de texto com pelo menos 4,5:1, anel de foco e borda de campos com pelo menos 3:1 sobre `--color-surface` e `--color-page`, e `outline` usando `var(--color-focus-ring)`. Verificar que o teste passa e que trocar temporariamente `--color-focus-ring` para `#aeb9ff` ou `--color-control-border` para `#c9d0de` faz o teste falhar.

## 2. Cartões concluídos e cancelados

- [x] 2.1 Adicionar a `tests/styles/contrast.test.ts` a verificação de que `opacity` só aparece em regras com `:disabled` ou `aria-disabled` nos CSS de `src/styles/` e nos `<style>` dos `.vue` de `src/`. Verificar que o teste falha com a regra atual de `TaskList.vue`.
- [x] 2.2 Remover `opacity: 0.8` dos cartões `DONE` e `CANCELLED` em `TaskList.vue`, mantendo o título tachado. Verificar que o teste da tarefa 2.1 passa e que `TaskList.test.ts` continua exibindo o status em texto nos cartões concluídos.

## 3. Controles do cartão em processamento

- [x] 3.1 Em `TaskList.vue`, trocar `:disabled` por `aria-disabled="true"` nos controles do cartão em processamento, ignorar acionamentos enquanto `busyTaskId` for a tarefa do cartão e adicionar `data-action` (`edit`, `complete`, `cancel`, `reopen`, `status`, `delete`) a cada controle; em `base.css`, aplicar a aparência de desabilitado a `[aria-disabled='true']`. Substituir o teste "desabilita ações da tarefa em processamento" por testes que verificam `aria-disabled`, ausência de `disabled`, nenhum evento emitido ao acionar um controle em processamento e foco mantido no controle. Verificar que `TaskList.test.ts` passa.
- [x] 3.2 Adicionar a `TaskList.vue`, por `defineExpose`, a função que foca o controle de um cartão a partir de `taskId` e `data-action`, retornando se encontrou o controle. Verificar com teste de componente que o `document.activeElement` passa a ser o controle pedido e que um `taskId` inexistente retorna falso sem lançar erro.

## 4. Seletor de status com confirmação

- [x] 4.1 Implementar em `TaskList.vue` a decisão 1 do design: marca de navegação pelo teclado, valor pendente por cartão, confirmação por Enter e por `focusout`, Escape restaurando o status persistido, descarte do pendente igual ao persistido e descarte quando `task.status` mudar por outra via. Cobrir em `TaskList.test.ts` os cenários da spec: duas setas sem evento emitido, Enter emitindo uma única alteração com o status final, `focusout` emitindo uma única alteração, Escape seguido de `focusout` sem evento, `change` sem marca de teclado emitindo imediatamente e retorno ao status persistido quando a prop `tasks` chega sem alteração. Verificar que os testes passam.

## 5. Foco após ações da listagem

- [x] 5.1 Implementar em `TaskManager.vue` o fluxo da decisão 3 para concluir, cancelar, reabrir e alterar status, incluindo o respeito ao foco movido pelo usuário quando a confirmação vier da saída do seletor. Adicionar a `TaskManager.test.ts` testes com `attachTo: document.body` para: Concluir e Cancelar tarefa levando a Reabrir do mesmo cartão, Reabrir levando a Concluir, Enter no seletor mantendo o foco no seletor, Tab para outro controle exibido sem retirada do foco, cartão removido pelo filtro levando a Editar do cartão na mesma posição, último cartão levando a Editar do novo último, lista sem resultados levando a "Limpar filtros" e falha mantendo o foco em Concluir. Verificar que nenhum desses testes termina com o foco no `body`.
- [x] 5.2 Aplicar o mesmo fluxo à exclusão confirmada. Adicionar testes para exclusão de tarefa intermediária levando a Editar do cartão na mesma posição, exclusão da única tarefa levando a "Criar primeira tarefa" e falha na exclusão devolvendo o foco ao botão Excluir. Verificar que `TaskManager.test.ts` e `ConfirmDialog.test.ts` passam sem alterar `ConfirmDialog.vue`.

## 6. Foco no primeiro erro de validação

- [x] 6.1 Adicionar a `TaskForm.vue` a função exposta `focusFirstInvalid()` da decisão 4 e, em `TaskManager.vue`, chamá-la após falha com erros de campo ou focar a mensagem de falha (com `tabindex="-1"`) quando não houver erro de campo. Adicionar testes para título vazio levando o foco ao Título, lembrete sem prazo com URL inválida levando o foco à primeira opção de lembrete com os valores preservados e falha de gravação levando o foco à mensagem. Verificar que `TaskForm.test.ts` e `TaskManager.test.ts` passam.
- [x] 6.2 Aplicar a mesma regra em `QuickAdd.vue`, com `tabindex="-1"` na mensagem `role="alert"`. Adicionar a `QuickAdd.test.ts` testes para título vazio enviado pelo teclado levando o foco ao Título e falha de gravação levando o foco à mensagem. Verificar que `QuickAdd.test.ts` e `tests/entrypoints/popup.test.ts` passam.

## 7. Estrutura de títulos e seletor de arquivo

- [x] 7.1 Em `TaskManager.vue`, envolver `TaskList` em `<section>` rotulada por `<h2 class="visually-hidden">Lista de tarefas</h2>`, renderizada somente com tarefas visíveis. Adicionar teste que verifica a ordem e o nível dos títulos (`h1` Tarefas, `h2` de filtros, `h2` Lista de tarefas, `h3` das tarefas) e a ausência de "Lista de tarefas" no estado "Nenhuma tarefa encontrada". Verificar que `TaskManager.test.ts` passa.
- [x] 7.2 Em `BackupManager.vue`, aplicar a decisão 8: botão secundário "Escolher arquivo de backup" que aciona o `<input type="file">` oculto com `tabindex="-1"`, mantendo `id` e handler `change`, e remover a regra `:focus-within` e a referência a `--color-accent`. Adicionar a `BackupManager.test.ts` testes que verificam que a ação é um `<button>`, que acioná-la chama `click()` no input, que o input não é alcançável pelo Tab e que o botão fica desabilitado enquanto há operação em andamento. Verificar que os testes de seleção de arquivo existentes continuam passando e que `--color-accent` não aparece em `src/`.

## 8. Documentação e verificação final

- [x] 8.1 Revisar `README.md` e `docs/architecture.md` e registrar somente comportamentos que mudaram de forma observável: confirmação do seletor de status do cartão e gestão de foco após ações. Verificar por leitura a acentuação pt-BR e a ausência de funcionalidades não implementadas.
- [x] 8.2 Executar o checklist manual no Chrome estável para Windows, com `.output/chrome-mv3` carregado e o Side Panel na largura padrão, e registrar em `verification.md` da Change:
  - seletor de status percorrido pelas setas sem gravação, confirmado com Enter, com saída do campo e cancelado com Escape;
  - foco após Concluir, Cancelar tarefa, Reabrir e Excluir, com e sem filtro ativo;
  - foco no primeiro erro no formulário do Side Panel rolado até o fim e no Quick Add;
  - indicador de foco visível nos botões, campos e seletor de arquivo, sobre o fundo da página e sobre cartões;
  - cartão concluído legível e distinguível;
  - seletor de status com o Narrador do Windows;
  - observação sobre perda de foco após exportar backup e após escolher arquivo, fora do escopo.
- [x] 8.3 Executar `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build`; verificar em `.output/chrome-mv3/manifest.json` que as permissões continuam exatamente `sidePanel`, `storage`, `alarms` e `notifications`, sem `host_permissions`, e que `tests/manifest/manifest-permissions.test.ts` passa sem alteração. Executar `npx openspec validate corrigir-acessibilidade-foco-e-contraste --type change --strict --no-interactive` e corrigir qualquer falha antes de solicitar a revisão.
