## Context

Motivação e escopo estão em `proposal.md`; os requisitos, em `specs/page-capture/spec.md` e `specs/quick-add/spec.md`.

Estado atual observado:

- `wxt.config.ts` declara `sidePanel`, `storage`, `alarms` e `notifications`. `tests/manifest/manifest-permissions.test.ts` lê essa configuração e hoje proíbe explicitamente `activeTab`, `tabs`, `scripting` e `contextMenus`.
- `Task.sourceUrl` já existe e é validado por `isHttpUrl` em `task-draft.ts` e `task-integrity.ts`. Os limites de título (200) e descrição (4.000) são medidos com `String.length`, ou seja, em unidades UTF-16.
- `QuickAdd.vue` recebe um `TaskManagerNavigator` por prop, mantém um `reactive` com título, prazo, solicitante, responsável e prioridade, e usa uma região `aria-live` para sucesso e um alerta focável para falhas. `tests/components/quick-add/QuickAdd.test.ts` garante que a tarefa criada não tem `sourceUrl`.
- `TaskManager.vue` controla `mode` (`list`, `create`, `edit`, `backup`) e `pendingDeletion` com refs locais. `TaskForm.vue` inicializa o formulário a partir de `props.task` e não aceita valores iniciais para criação.
- `background.ts` registra listeners de forma síncrona para `runtime.onInstalled`, `runtime.onStartup` e `alarms.onAlarm`. O background não recebe mensagens das superfícies; popup e Side Panel reagem ao storage.
- `ChromeSidePanelNavigator.open()` faz `await browser.windows.getCurrent()` antes de `sidePanel.open`. Esse encadeamento funciona no clique do popup, mas perderia o gesto do usuário no menu de contexto.
- O fake browser do WXT (`@webext-core/fake-browser`) emula `storage.session` e eventos como `contextMenus.onClicked`, mas `contextMenus.create`, `contextMenus.removeAll` e `sidePanel.open` precisam ser simulados nos testes.
- `tests/architecture/layer-boundaries.test.ts` impede `domain` e `application` de importar Vue, Pinia, WXT, infraestrutura ou APIs `browser`/`chrome`.

## Goals / Non-Goals

**Goals:**

- Manter a regra de mapeamento e de expiração como funções puras de domínio, testáveis sem navegador.
- Isolar cada API Chrome nova (`tabs.query`, `storage.session`, `contextMenus`, `sidePanel.open` por janela) em um adapter pequeno.
- Preservar o gesto do usuário no menu de contexto e a regra de que o background não recebe mensagens.
- Tornar verificável por teste o conjunto exato de permissões e a ausência de leitura da página ao abrir o popup.

**Non-Goals:**

- Criar um barramento de mensagens, um serviço genérico de "inbox" ou uma fila de capturas.
- Alterar `TaskService`, `TaskRepository`, a store Pinia de tarefas, lembretes ou backup.
- Oferecer feedback fora do Side Panel quando ele não puder ser aberto (badge ou notificação); ver Riscos.

## Decisions

### 1. `activeTab` + `contextMenus` como únicas permissões novas

`activeTab` é concedida pela abertura do popup e pelo clique em item de menu de contexto, dá acesso temporário a `url` e `title` da aba ativa e não gera aviso na instalação. `contextMenus` também não gera aviso, e o próprio clique fornece `selectionText` e `pageUrl`.

Alternativas consideradas:

- **`tabs`:** expõe URL e título de todas as abas e mostra o aviso de histórico de navegação. Desnecessária, porque só a aba ativa interessa e sempre há gesto.
- **`scripting` + `activeTab`:** permitiria ler `getSelection()` pelo popup, mas injeta código na página, falha em frames e páginas protegidas e duplica o que `selectionText` já entrega.
- **Content script declarado:** exige padrões de host amplos e aviso de leitura de todos os sites; contradiz o requisito de nenhum acesso permanente.
- **`favicon`:** mostra o aviso de leitura dos ícones dos sites visitados. Persistir `tab.favIconUrl` exigiria alterar modelo, decoder e backup, além de gerar requisições externas a cada renderização. Fora do escopo.

Como nenhuma das duas permissões tem aviso, a atualização da extensão não pede nova aprovação ao usuário.

### 2. Leitura da aba no popup somente no clique

`ChromeActivePageReader` chama `browser.tabs.query({ active: true, currentWindow: true })` apenas quando `QuickAdd` aciona "Usar página atual", e devolve `{ title?, url? }` ou falha. A concessão de `activeTab` feita na abertura do popup permanece válida enquanto a aba não navegar, então ler no clique não perde acesso.

O caso de uso `captureActivePage(reader)` (aplicação) converte a leitura em um resultado discriminado: `captured` com rascunho, `unsupported` para URL ausente de `http`/`https`, ou `unavailable` quando a consulta falha ou não retorna aba ou URL. `QuickAdd` recebe o reader por prop, no mesmo padrão do `navigator`.

Alternativa rejeitada: ler a aba no `onMounted` e apenas exibir um botão "aplicar". Anteciparia a leitura sem gesto sobre o formulário e violaria o requisito modificado de `quick-add`.

### 3. Mapeamento puro em `src/domain/page-capture.ts`

Funções puras montam `CapturedDraft = { title: string; description?: string; sourceUrl?: string }`:

- `normalizeCaptureText` troca `\s+` por um espaço e remove espaços nas extremidades.
- `truncateWithEllipsis(text, limit)` corta em `limit - 1` unidades UTF-16 e acrescenta "…". Se o corte cair entre um par substituto, recua uma unidade. A medida em UTF-16 é obrigatória para que o resultado passe em `validateTaskDraft`, que usa `String.length`.
- `buildPageCaptureDraft({ title, url })` e `buildSelectionCaptureDraft({ selectionText, pageUrl })` aplicam o mapeamento da spec e reutilizam `isHttpUrl` e `TASK_LIMITS`.

O rascunho é um subconjunto de `TaskDraft`; salvar continua passando por `TaskService.create` e pelas validações existentes, sem caminho paralelo de criação.

### 4. Ponte background → Side Panel por `storage.session`

O background grava a captura na chave `taskflow.pendingCapture` de `browser.storage.session`, e o Side Panel lê essa chave ao montar e escuta `storage.session.onChanged`.

Formato gravado:

```ts
interface PendingCapture {
  version: 1;
  id: string;             // UUID, evita reapresentação da mesma captura
  kind: 'page' | 'selection';
  windowId?: number;      // janela do acionamento, quando conhecida
  capturedAt: string;     // ISO 8601 UTC
  draft: CapturedDraft;   // já mapeado no background
}
```

Motivos:

- `storage.session` fica em memória, é apagado ao encerrar o navegador, não exige permissão além de `storage` e, por padrão, só é acessível por contextos confiáveis da extensão.
- Chave única implementa "no máximo uma captura", e a regravação substitui a anterior.
- O rascunho é mapeado no background, então o Side Panel só decodifica e valida.
- Popup e Side Panel continuam sem enviar mensagens ao background.

Alternativas consideradas:

- **`runtime.sendMessage` do background para o Side Panel:** a mensagem se perde se o painel ainda estiver carregando ou se a abertura falhar, e criaria um canal de mensagens que a arquitetura evita.
- **`storage.local`:** sobreviveria ao reinício do navegador e deixaria dados de navegação residuais no disco sem necessidade.
- **`sidePanel.setOptions({ path: 'sidepanel.html?capture=...' })`:** altera o caminho global do painel, coloca dados da página na URL e exige limpeza posterior.

O decoder `decodePendingCapture` (infraestrutura) valida a forma e os limites do rascunho e retorna `null` para qualquer valor malformado. `isPendingCaptureValid(capture, now)` (domínio) considera expirada a captura com mais de 10 minutos ou com `capturedAt` mais de 1 minuto no futuro.

### 5. Ordem no clique do menu: abrir o painel antes de qualquer `await`

`sidePanel.open` só é aceito dentro do gesto do usuário. Por isso o listener de `contextMenus.onClicked` é registrado de forma síncrona e segue esta ordem:

```
onClicked(info, tab)
  |-- se tab?.windowId conhecido: opening = openSidePanelInWindow(tab.windowId)   // síncrono, sem await antes
  |-- capture = buildMenuCapture(info, tab, clock, generateId)                     // puro
  '-- await Promise.allSettled([opening, inbox.save(capture)])                      // registra falhas sem dados
```

- `openSidePanelInWindow(windowId)` é uma função nova em `infrastructure/chrome`, e não um método do `ChromeSidePanelNavigator` atual, porque não pode consultar `windows.getCurrent()` antes de abrir.
- Sem `tab`, a janela não é conhecida: o painel não é aberto e a captura é gravada sem `windowId`, ficando disponível para o próximo Side Panel aberto dentro da validade.
- Se o painel abrir antes da gravação terminar, o `onChanged` do Side Panel entrega a captura.
- Falhas são registradas com mensagem fixa e apenas `error.name`/`error.message`, nunca com o objeto de captura.

Os itens são criados em `runtime.onInstalled` com `contextMenus.removeAll()` seguido de `create` para `taskflow:capture:page` (`contexts: ['page']`) e `taskflow:capture:selection` (`contexts: ['selection']`), ambos com `documentUrlPatterns: ['http://*/*', 'https://*/*']`. O `removeAll` torna a instalação e a atualização idempotentes. Os itens persistem entre reinícios, então não é preciso recriá-los em `onStartup`.

### 6. Consumo da captura no Side Panel

O Side Panel obtém o próprio `windowId` com `browser.windows.getCurrent()` ao montar. `ChromePendingCaptureInbox` expõe:

- `take(windowId)`: lê a chave; se a captura for válida e destinada a essa janela ou sem janela, remove a chave e a devolve; se estiver expirada ou malformada, remove e devolve `null`; se for de outra janela, não toca nela.
- `subscribe(listener)`: escuta `storage.session.onChanged` na chave e devolve a função de cancelamento.

Remover a chave ao apresentar garante que a captura não reaparece em outra abertura. Fechar o painel sem salvar descarta a captura, o que é coerente com "cancelar descarta".

A orquestração fica em um composable de componente, `usePendingCapture(inbox, windowId)`, que mantém `heldCapture` (captura recebida e ainda não revisada) e oferece `review()` e `discard()`. `TaskManager` decide:

- **`mode === 'list'` e sem `pendingDeletion`:** abre o formulário de criação com o rascunho imediatamente.
- **Formulário, backup ou confirmação aberta:** mantém `heldCapture` e exibe o aviso com "Descartar captura". Ao voltar à listagem, o aviso passa a oferecer "Revisar captura". Uma nova captura substitui `heldCapture`.

Depois de retirada do storage, a captura em `heldCapture` não expira, porque o usuário já foi informado.

O inbox é fornecido por `provide`/`inject` com uma chave própria, no mesmo padrão de `backupServiceKey`, apenas no entrypoint do Side Panel. A captura não entra na store Pinia de tarefas, porque é estado de apresentação local ao `TaskManager`, sem relação com a coleção persistida.

Alternativa rejeitada: comparar os valores do formulário para detectar alterações não salvas e substituir formulários "limpos". Exigiria rastrear estado sujo em `TaskForm` e ainda descartaria o contexto de quem abriu o formulário de propósito. Tratar qualquer formulário, backup ou confirmação aberta como operação em andamento é mais simples e previsível.

### 7. Formulários

- **`TaskForm`:** ganha a prop opcional `initialDraft?: CapturedDraft`, usada somente quando `task` é `null`. `TaskManager` exibe acima do formulário a indicação "Dados capturados da página. Revise antes de salvar." e passa um `key` distinto por captura para reiniciar o formulário. O foco inicial continua no título.
- **`QuickAdd`:** ganha a prop `pageReader`, o campo `sourceUrl` no `reactive` e o estado `showSourceUrl`. "Usar página atual" fica logo após o campo de título, como botão secundário.
  - **Sucesso:** o foco permanece na ação e a região `aria-live` anuncia "Página atual capturada.".
  - **`unsupported`/`unavailable`:** reutiliza o alerta de falha existente, mantendo o foco na ação.
  - **"Remover URL de origem":** limpa e oculta o campo e devolve o foco para "Usar página atual", evitando foco sem destino.
  - **Criação bem-sucedida:** `emptyForm()` volta a ocultar o campo.

### 8. Camadas e arquivos

```
domain/page-capture.ts                    normalização, truncamento, rascunhos, validade (10 min)
application/page-capture.ts               portas ActivePageReader e PendingCaptureInbox,
                                          captureActivePage, buildMenuCapture
infrastructure/chrome/
  chrome-active-page-reader.ts            tabs.query na aba ativa
  chrome-pending-capture-inbox.ts         storage.session + decodePendingCapture
  chrome-capture-menu.ts                  ids, registro dos itens, leitura de OnClickData
  chrome-side-panel-window.ts             openSidePanelInWindow(windowId)
components/capture/
  use-pending-capture.ts                  estado da captura mantida no Side Panel
  pending-capture-key.ts                  chave de injeção
entrypoints/background.ts                 onInstalled (menu) + onClicked síncrono
entrypoints/popup, entrypoints/sidepanel  composição dos adapters
```

O teste de camadas existente passa a cobrir os novos arquivos de `domain` e `application` sem alteração.

## Risks / Trade-offs

- **[Gesto perdido por um `await` inserido no futuro antes de `sidePanel.open`]** → Teste do background verifica que `sidePanel.open` é chamado de forma síncrona dentro do listener, antes de qualquer gravação no storage, e um comentário no listener explica a restrição.
- **[Painel não abre e o usuário não percebe que a captura ficou pendente]** → A spec garante que nada é salvo e que a captura é apresentada ao abrir o painel em até 10 minutos. Badge na ação ou notificação ficam para uma Change futura, se o uso mostrar necessidade.
- **[Dois Side Panels abertos e captura sem `windowId`]** → Ambos podem tentar `take`; a leitura e remoção não são atômicas e, em corrida, os dois podem apresentar a mesma captura. O caso exige clique sem aba informada com painéis em duas janelas; o risco foi aceito, e nenhuma tarefa é salva sem confirmação.
- **[`selectionText` já normalizado ou truncado pelo navegador]** → A descrição usa o texto recebido; o comportamento exato de quebras de linha é verificado manualmente, e a spec só exige o texto recebido sem espaços nas extremidades.
- **[URL capturada contém tokens em query string ou título com dados pessoais]** → Os dados ficam visíveis e editáveis antes de salvar, a URL pode ser removida no Quick Add e nada sai da extensão. A captura pendente não é gravada em disco nem em backup.
- **[Páginas protegidas (Chrome Web Store, visualizador de PDF) não exibem o menu nem liberam `activeTab`]** → Comportamento esperado: o menu não aparece por `documentUrlPatterns` ou restrição do navegador, e o popup informa que a página não pode ser capturada.
- **[Fake browser sem `contextMenus.create` e `sidePanel.open`]** → Os testes usam `vi.fn` sobre essas funções, e a lógica decisória fica em funções puras testadas sem navegador.

## Migration Plan

- Não há migração de dados: `Task`, `schemaVersion` do storage e `formatVersion` do backup não mudam.
- Na atualização, `runtime.onInstalled` com `reason: 'update'` registra os itens de menu e continua reconciliando lembretes. As novas permissões não têm aviso e não desativam a extensão.
- **Rollback:** reverter a versão remove as permissões `activeTab` e `contextMenus` e o listener de cliques. Como a versão anterior não declara `contextMenus` nem chama `removeAll`, a ausência dos itens de menu após o rollback deve ser confirmada manualmente. Uma chave `taskflow.pendingCapture` residual some ao encerrar o navegador e é ignorada pela versão anterior.
