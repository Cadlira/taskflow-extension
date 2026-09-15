## 1. Regras puras de captura

- [x] 1.1 Criar `src/domain/page-capture.ts` com `normalizeCaptureText` e `truncateWithEllipsis` conforme a decisão 3 do design: medida em unidades UTF-16, recuo ao cortar par substituto e "…" contido no limite. Adicionar `tests/domain/page-capture.test.ts` cobrindo espaços e quebras de linha colapsados, texto no limite exato sem "…", texto acima do limite com resultado de exatamente 200 e 4.000 unidades, e emoji na posição de corte sem par substituto órfão. Verificar que os testes passam.
- [x] 1.2 Adicionar `buildPageCaptureDraft` e `buildSelectionCaptureDraft`, reutilizando `isHttpUrl` e `TASK_LIMITS`. Cobrir os cenários de "Mapeamento de campos da captura": seleção curta sem descrição, seleção de 650 caracteres com título de 200 e descrição completa, seleção de 6.000 com descrição de 4.000, título de página de 240, título vazio após normalização e URL `chrome://`/`file://` omitida. Verificar também, no mesmo teste, que todo rascunho produzido é aceito por `validateTaskDraft` quando o título não é vazio.
- [x] 1.3 Adicionar o tipo `PendingCapture` (versão 1) e `isPendingCaptureValid(capture, now)` com validade de 10 minutos e tolerância de 1 minuto para `capturedAt` no futuro. Cobrir 9 min 59 s válida, 10 min 1 s expirada e 2 min no futuro inválida. Verificar que os testes passam e que `tests/architecture/layer-boundaries.test.ts` continua passando.

## 2. Casos de uso e portas

- [x] 2.1 Criar `src/application/page-capture.ts` com a porta `ActivePageReader` e o caso de uso `captureActivePage(reader)`, que retorna `captured` com rascunho, `unsupported` para URL não `http`/`https` e `unavailable` quando a leitura rejeita ou não retorna aba ou URL. Adicionar `tests/application/page-capture.test.ts` com reader falso para os três resultados. Verificar que os testes passam.
- [x] 2.2 Adicionar a porta `PendingCaptureInbox` (`save`, `take(windowId)`, `subscribe`) e `buildMenuCapture(click, { clock, generateId })`, que monta a `PendingCapture` a partir do item acionado (`page` ou `selection`), do título e da URL da aba quando existirem, de `pageUrl` como fallback e de `windowId` apenas quando conhecido. Cobrir os dois tipos de item, aba ausente com título vazio e URL de `pageUrl`, seleção vazia tratada como captura de página e identificador de item desconhecido retornando `null`. Verificar que os testes passam e que o teste de camadas continua passando.

## 3. Adapters Chrome

- [x] 3.1 Criar `src/infrastructure/chrome/chrome-active-page-reader.ts` usando `browser.tabs.query({ active: true, currentWindow: true })`. Adicionar teste com `fakeBrowser` e `vi.spyOn` verificando os parâmetros da consulta, o retorno de título e URL e a propagação de rejeição. Verificar que o teste passa.
- [x] 3.2 Criar `src/infrastructure/chrome/chrome-pending-capture-inbox.ts` com `decodePendingCapture` e a chave `taskflow.pendingCapture` em `storage.session`, conforme a decisão 6. Adicionar `tests/infrastructure/chrome-pending-capture-inbox.test.ts` cobrindo: `save` substituindo a captura anterior, `take` da mesma janela removendo a chave, `take` de captura sem `windowId`, `take` de outra janela preservando a chave, captura expirada e malformada removidas com retorno `null`, `subscribe` notificando nova captura e cancelamento interrompendo notificações, e ausência de escrita em `storage.local`. Verificar que os testes passam.
- [x] 3.3 Criar `src/infrastructure/chrome/chrome-capture-menu.ts` (ids dos itens, `registerCaptureMenu` com `removeAll` seguido de dois `create` com `contexts` e `documentUrlPatterns` da decisão 5, e conversão de `OnClickData`/`Tab` para a entrada de `buildMenuCapture`) e `chrome-side-panel-window.ts` com `openSidePanelInWindow(windowId)`. Adicionar testes com `vi.fn` para `contextMenus.removeAll`, `contextMenus.create` e `sidePanel.open`, verificando títulos "Adicionar página ao TaskFlow" e "Criar tarefa com o texto selecionado", padrões `http://*/*` e `https://*/*`, ordem `removeAll` antes de `create` e chamada de `sidePanel.open({ windowId })`. Verificar que os testes passam.

## 4. Permissões do Manifest

- [x] 4.1 Reescrever `tests/manifest/manifest-permissions.test.ts` para exigir exatamente `activeTab`, `alarms`, `contextMenus`, `notifications`, `sidePanel` e `storage` e proibir `tabs`, `scripting`, `favicon`, `<all_urls>`, `host_permissions` e `content_scripts`. Verificar que o teste falha antes da alteração da configuração.
- [x] 4.2 Adicionar `activeTab` e `contextMenus` a `permissions` em `wxt.config.ts`, sem nenhuma outra chave nova no Manifest. Verificar que o teste da tarefa 4.1 passa.

## 5. Captura pelo popup

- [x] 5.1 Em `QuickAdd.vue`, adicionar a prop `pageReader`, a ação "Usar página atual" após o título e o campo "URL de origem" com "Remover URL de origem", conforme a decisão 7. Compor `ChromeActivePageReader` em `src/entrypoints/popup/App.vue` e atualizar `tests/support/task-app.ts` com um reader falso. Atualizar `tests/components/quick-add/QuickAdd.test.ts` para cobrir:
  - campo de URL oculto ao abrir e nenhuma chamada ao reader no `mount`;
  - título vazio preenchido e título digitado preservado;
  - URL exibida e persistida como `sourceUrl`;
  - URL editada para `ftp://` com erro no campo e foco nele;
  - remoção da URL com foco em "Usar página atual" e tarefa sem `sourceUrl`;
  - formulário reiniciado sem o campo após salvar;
  - `unsupported` e `unavailable` com mensagem e todos os campos preservados;
  - tarefa sem captura continua sem `sourceUrl`.

  Verificar que `QuickAdd.test.ts` passa.
- [x] 5.2 Adicionar a `tests/entrypoints/popup.test.ts` a verificação de que abrir o popup não chama `browser.tabs.query` e de que o popup não referencia `storage.session` nem o inbox de capturas. Verificar que o teste passa.

## 6. Menu de contexto no background

- [x] 6.1 Em `src/entrypoints/background.ts`, registrar `registerCaptureMenu` em `runtime.onInstalled` junto à reconciliação existente e um listener síncrono de `contextMenus.onClicked` que chama `openSidePanelInWindow` antes de qualquer `await` e depois grava a captura, registrando falhas com mensagem fixa sem dados capturados, conforme a decisão 5. Adicionar a `tests/entrypoints/background.test.ts` testes para:
  - itens registrados em `install` e `update` sem duplicação;
  - `sidePanel.open` chamado de forma síncrona, antes da gravação em `storage.session`;
  - captura de página e de seleção gravadas com rascunho mapeado e `windowId`;
  - aba ausente gravando a captura sem abrir o painel;
  - `sidePanel.open` rejeitado mantendo a captura gravada e registrando erro sem título, URL ou seleção;
  - nenhuma tarefa gravada em `storage.local`;
  - reconciliação de lembretes existente continuando a passar.

  Verificar que `background.test.ts` passa.

## 7. Revisão da captura no Side Panel

- [x] 7.1 Adicionar a `TaskForm.vue` a prop `initialDraft`, usada somente na criação. Adicionar a `TaskForm.test.ts` testes de título, descrição e URL de origem pré-preenchidos, status `TODO` e prioridade `MEDIUM`, foco inicial no título e `initialDraft` ignorado na edição. Verificar que os testes passam.
- [x] 7.2 Criar `src/components/capture/pending-capture-key.ts` e `use-pending-capture.ts` com `heldCapture`, `review()` e `discard()`, obtendo o `windowId` com `browser.windows.getCurrent()` na composição. Fornecer `ChromePendingCaptureInbox` apenas em `src/entrypoints/sidepanel/main.ts`. Adicionar teste do composable com inbox falso cobrindo captura existente ao montar, captura recebida por assinatura, substituição por captura mais recente, `discard` e cancelamento da assinatura ao desmontar. Verificar que os testes passam.
- [x] 7.3 Integrar a captura em `TaskManager.vue` conforme a decisão 6: abrir "Nova tarefa" pré-preenchida com a indicação de revisão quando estiver na listagem sem confirmação aberta, ou manter a captura com aviso e "Descartar captura" durante formulário, backup ou confirmação, oferecendo "Revisar captura" ao voltar à listagem. Adicionar a `TaskManager.test.ts` testes para:
  - captura apresentada ao montar e ao chegar com a listagem aberta;
  - salvar a captura persistindo a tarefa;
  - cancelar sem persistir e sem reapresentar;
  - edição com valores digitados preservada ao chegar uma captura;
  - "Revisar captura" após cancelar a edição;
  - "Descartar captura" removendo o aviso;
  - backup e confirmação de exclusão não interrompidos;
  - captura expirada não apresentada.

  Verificar que `TaskManager.test.ts` passa.
- [x] 7.4 Adicionar teste de integração com `fakeBrowser` que dispara `contextMenus.onClicked` no background e monta o Side Panel da mesma janela, verificando o formulário pré-preenchido. No mesmo arquivo, verificar que um Side Panel de outra janela não apresenta a captura e que um backup exportado com captura pendente contém somente as tarefas. Verificar que o teste passa.

## 8. Documentação

- [x] 8.1 Atualizar `docs/architecture.md`: tabela de permissões com justificativa de `activeTab` e `contextMenus`; substituir a frase sobre ausência de `activeTab`/`contextMenus` pela lista de permissões ainda proibidas; nova seção de captura de página com a ponte por `storage.session`, a ordem de abertura do Side Panel e a regra de que o background continua sem receber mensagens. Verificar por leitura a acentuação pt-BR e a coerência com o design.
- [x] 8.2 Atualizar `README.md`: seção de captura (popup e menu de contexto, revisão antes de salvar, páginas não capturáveis, validade de 10 minutos, dados que não são lidos) e tabela de permissões com `activeTab` e `contextMenus`, removendo a afirmação de que não há acesso à página atual. Verificar por leitura a acentuação pt-BR e a ausência de funcionalidades não implementadas, como favicon ou atalho.

## 9. Verificação final

- [x] 9.1 Executar `npm run validate` (lint, typecheck, testes e build de produção) e verificar que todas as etapas passam sem avisos novos.
- [x] 9.2 Inspecionar `.output/chrome-mv3/manifest.json` gerado pelo build e verificar que `permissions` contém exatamente `activeTab`, `alarms`, `contextMenus`, `notifications`, `sidePanel` e `storage`, sem `host_permissions`, `content_scripts`, `optional_permissions` nem `<all_urls>`. Registrar o conteúdo relevante em `verification.md`.
- [x] 9.3 Executar o checklist manual no Chrome estável para Windows, com `.output/chrome-mv3` carregado, e registrar em `verification.md` da Change:
  - instalação sem aviso de permissão e atualização sem pedido de nova aprovação;
  - "Usar página atual" em página `https`, em `chrome://extensions` e com título já digitado;
  - URL de origem editada, removida e salva;
  - menu de contexto ausente em `chrome://` e presente em página `https`, com e sem seleção;
  - captura pelo menu com Side Panel fechado, aberto na listagem, aberto em edição e aberto em outra janela;
  - seleção longa com quebras de linha e o texto recebido na descrição;
  - captura cancelada, descartada e expirada (ajustando o relógio ou aguardando 10 minutos);
  - leitor de tela anunciando "Página atual capturada." e o aviso de captura aguardando revisão.
- [x] 9.4 Executar `npm run openspec -- validate capturar-pagina-como-tarefa --type change --strict --no-interactive` e verificar que a Change continua válida após a implementação.
