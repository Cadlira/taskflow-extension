# Verificação manual — `capturar-pagina-como-tarefa` (TF-004)

Registro das tarefas 9.2 e 9.3: Manifest gerado e checklist no **Google Chrome estável para Windows** com a extensão empacotada.

## Ambiente

- Data: 2026-09-15.
- Navegador: **Google Chrome estável 152.0.7977.84** (Windows), janela de 1500 × 950, perfil temporário `chrome-stable-taskflow`.
- Build: `npm run build` (WXT 0.21.4). O Chrome estável ignora `--load-extension`; a extensão foi carregada de `.output/chrome-mv3` por CDP `Extensions.loadUnpacked` (ID `ogfmokknbofabjomlfeekkceegkocacb`).
- Método: CDP para páginas e contextos de extensão; entradas confiáveis (`Input.dispatchMouseEvent`) para as ações que exigem gesto (`sidePanel.open`); cliques e capturas no chrome nativo por `SetCursorPos`/`mouse_event` e `CopyFromScreen`; acessibilidade pela árvore via CDP e por eventos UIA (Windows UI Automation) com `--force-renderer-accessibility`, o provedor consumido por leitores de tela no Windows.
- Nota: uma passagem exploratória anterior usou o Chromium 151 do Playwright; **todos os itens do checklist foram repetidos no Chrome estável** e é esse resultado que está registrado abaixo.

## 9.2 Manifest gerado — PASSOU

`.output/chrome-mv3/manifest.json` contém exatamente:

```json
"permissions": ["activeTab", "alarms", "contextMenus", "notifications", "sidePanel", "storage"]
```

Não há `host_permissions`, `content_scripts`, `optional_permissions` nem `<all_urls>`. O mesmo conjunto foi confirmado em execução por `chrome.runtime.getManifest()` no contexto da extensão, e `tests/manifest/manifest-permissions.test.ts` falhou antes da alteração de `wxt.config.ts` e passou depois.

## 9.3 Checklist manual no Chrome estável

### 1. Instalação e atualização — PASSOU

- Instalação em perfil limpo: a extensão carregou habilitada, sem prompts e sem erros; `activeTab` e `contextMenus` não geram aviso de permissão, e o Manifest não declara nenhuma permissão com aviso.
- Atualização pela interface: o botão de recarregar do cartão do TaskFlow em `chrome://extensions` executou a atualização (toast "Atualizada"), a extensão permaneceu habilitada, sem erros, sem avisos e sem pedido de nova aprovação. Depois da atualização, o menu de contexto continuou com exatamente um item "Adicionar página ao TaskFlow", sem duplicação.

### 2. Captura pelo popup — PASSOU

Com o popup aberto pelo clique real no ícone da barra (concessão de `activeTab` confirmada por `tabs.query`, que passa a devolver título e URL):

- ao abrir: nenhum campo "URL de origem", título vazio e nenhuma leitura automática da aba;
- página `https` (`https://example.com/`) com título vazio: **Usar página atual** preencheu o título com "Example Domain", exibiu a URL no campo "URL de origem", anunciou "Página atual capturada." na região viva e manteve o foco na ação;
- título digitado "Responder cliente" foi preservado e a URL continuou exibida;
- URL editada para `ftp://exemplo.com`: erro "Informe uma URL válida iniciada por http:// ou https://." junto ao campo, foco no campo e nenhuma tarefa persistida;
- URL corrigida e tarefa salva com `sourceUrl`, status `TODO` e prioridade `MEDIUM`; o formulário voltou ao estado inicial, sem o campo de URL, com foco no título;
- **Remover URL de origem**: campo oculto, foco devolvido a **Usar página atual** e tarefa persistida sem `sourceUrl`;
- página `chrome://extensions`: mensagem "Somente páginas http ou https podem ser capturadas.", com título, solicitante e demais campos preservados e foco na ação.

### 3. Menu de contexto — PASSOU

- Ausente em `chrome://extensions`: o menu nativo exibiu somente os itens do Chrome.
- Presente em página `https` sem seleção: item "Adicionar página ao TaskFlow"; com seleção de dois parágrafos: item "Criar tarefa com o texto selecionado", sem o item de página.
- **Side Panel fechado:** o clique em "Adicionar página ao TaskFlow" abriu o Side Panel com o formulário pré-preenchido (título, URL, `TODO`, `MEDIUM`) e a captura foi removida das pendências ao ser apresentada.
- **Side Panel aberto na listagem:** o clique em "Criar tarefa com o texto selecionado" apresentou o formulário sem recarregar o painel; a seleção de dois parágrafos (471 caracteres) virou título de exatamente 200 caracteres terminando em "…" e descrição com o texto recebido (469 caracteres). O Chrome normaliza quebras de linha em `selectionText`; a descrição carrega o texto recebido sem espaços nas extremidades, como a spec exige e como o risco do `design.md` prevê.
- **Side Panel aberto em edição:** uma captura chegou com o formulário de edição aberto e o título alterado; o formulário permaneceu aberto com "Editado pelo usuário" e o aviso "Há uma captura da página aguardando revisão." com "Descartar captura". Ao cancelar a edição, o aviso passou a oferecer "Revisar captura", que abriu o formulário pré-preenchido com a captura.

### 4. Revisão no Side Panel — PASSOU

Além dos itens do menu acima, executados no navegador real:

- captura apresentada ao montar com o painel fechado e ao chegar com a listagem aberta;
- salvar a captura persistiu a tarefa em `taskflow.tasks` com `sourceUrl`, status `TODO` e prioridade `MEDIUM`, com feedback "Tarefa criada." e atualização da listagem;
- cancelar o formulário descartou a captura sem persistir e sem reapresentá-la;
- a captura apresentada foi removida da chave `taskflow.pendingCapture` e não reapareceu após recarregar o painel;
- captura expirada (11 minutos) não foi apresentada e deixou de estar pendente na abertura seguinte;
- "Descartar captura" removeu o aviso sem persistir nada;
- **duas janelas:** com os painéis das janelas A e B abertos, uma captura destinada à janela A foi apresentada somente no painel A; o painel B não apresentou nada e a captura foi consumida.

### 5. Acessibilidade e leitor de tela — PASSOU

- Regiões vivas persistentes: o aviso do Side Panel usa um `role="status"` com texto dinâmico e o popup usa `aria-live="polite"` com o nó de sucesso sempre presente e conteúdo alterado.
- Eventos UIA (`LiveRegionChanged`), que é o que o Narrador e outros leitores de tela consomem no Windows, capturados em execução real com `--force-renderer-accessibility`:
  - popup: o clique em **Usar página atual** gerou o evento com a região viva contendo "Página atual capturada.";
  - Side Panel: a chegada de uma captura durante um formulário gerou o evento com a região contendo "Há uma captura da página aguardando revisão.".
- A árvore de acessibilidade do painel expõe o texto do aviso como `ControlType.Text` e o popup expõe a região viva; o foco permanece na ação durante a captura.
- Limitação: a fala sintetizada do Narrador em áudio não é capturável de forma automatizada; a verificação registra o evento de região viva e o conteúdo anunciado, que é o mesmo insumo entregue ao leitor de tela (mesma limitação de método registrada na TF-003).

## Correções decorrentes do relatório de verificação

O relatório de verify apontou um item crítico e dois avisos; todos foram tratados e reverificados:

1. **Checklist no Chrome estável (crítico):** o checklist 9.3 foi repetido por completo no Google Chrome estável 152.0.7977.84, incluindo instalação, atualização pela interface, popup em `https` e `chrome://`, menu de contexto com e sem seleção, painel fechado/listagem/edição, expiração, duas janelas e acessibilidade. O Chromium do Playwright ficou registrado apenas como passagem exploratória anterior.
2. **Seleção de janela desconhecida (aviso):** `take` e o composable passaram a aceitar capturas direcionadas somente quando o `windowId` da captura é desconhecido ou é igual ao da janela do painel; quando o painel não conhece a própria janela, uma captura destinada a outra janela é preservada. Testes adicionados em `tests/infrastructure/chrome-pending-capture-inbox.test.ts` e `tests/components/capture/use-pending-capture.test.ts`.
3. **Título ausente (aviso):** `captureActivePage` passou a devolver `unavailable` quando a aba não informa título (`title` ausente), distinguindo de título vazio, que continua sendo capturado com título vazio conforme o cenário "Página sem título" da spec. Teste adicionado em `tests/application/page-capture.test.ts`.
4. **Anúncio por leitor de tela (crítico):** as regiões vivas passaram a ser persistentes com atualização de texto (aviso do Side Panel em `role="status"` e sucesso do popup em `aria-live`), porque uma região inserida já preenchida não dispara `LiveRegionChanged` no Chrome; com a correção, os dois anúncios disparam o evento UIA e foram reverificados no Chrome estável.

## Limitações do método

- O Chrome normaliza quebras de linha em `selectionText`; a descrição carrega o texto recebido, conforme o risco documentado no design e o requisito da spec.
- A fala sintetizada do Narrador não foi capturada em áudio; foram verificados o evento `LiveRegionChanged` e o conteúdo das regiões vivas, que são a entrada do leitor de tela.
- Os prints do chrome do navegador usam captura de tela do Windows (menus e toolbar não saem por CDP); as capturas do conteúdo das páginas usam `Page.captureScreenshot`.
- O Chrome estável não aceita `--load-extension`; a extensão foi instalada por CDP `Extensions.loadUnpacked`, o mesmo fluxo de "Carregar sem compactação".

## Conclusão

Os itens 9.2 e 9.3 foram executados por completo no Google Chrome estável e passaram, sem divergências em relação a `specs/page-capture/spec.md` e `specs/quick-add/spec.md`. O único defeito funcional encontrado e corrigido foi a apresentação por assinatura que não removia a captura das pendências, além das correções de borda e de acessibilidade decorrentes do relatório de verify.
