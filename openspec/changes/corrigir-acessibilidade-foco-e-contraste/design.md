## Context

Motivação e escopo estão em `proposal.md`; os requisitos, em `specs/interface-accessibility/spec.md`.

Estado atual observado:

- `TaskList.vue` renderiza, em cada cartão, os botões Editar, Concluir e Cancelar tarefa (ou Reabrir), um `<select>` de status que emite `change-status` no evento `change` e o botão Excluir. Todos recebem `:disabled="busyTaskId === task.id"` enquanto a operação é processada.
- No Chromium para Windows, a seta sobre um `<select>` fechado dispara `change` na hora. Quando o controle focado passa a `disabled`, o navegador move o foco para o `body`. Os dois comportamentos foram reproduzidos durante o explore.
- `TaskManager.vue` orquestra a listagem, os formulários e o diálogo, conhece `store.visibleTasks` e já devolve o foco a "Nova tarefa" e "Backup" ao fechar formulário e backup. Não há gestão de foco após ações da listagem.
- `ConfirmDialog.vue` guarda o elemento focado ao abrir e o refoca ao desmontar. Depois de uma exclusão confirmada, esse elemento (o botão Excluir) já saiu do DOM.
- `TaskForm.vue` e `QuickAdd.vue` marcam campos inválidos com `aria-invalid="true"` e `aria-describedby`. Em caso de falha, nenhum dos dois move o foco; no formulário do Side Panel, a mensagem geral fica acima do formulário, em `TaskManager.vue`.
- `src/styles/base.css` define os tokens de cor. O anel de foco `#aeb9ff`, a borda de campos (`--color-border-strong` `#c9d0de`) e o fundo da página `#f7f8fc` aparecem como literais ou tokens compartilhados com bordas decorativas.
- `BackupManager.vue` usa um `<label class="button-secondary">` associado a um `<input type="file">` visualmente oculto. Os estilos de botão (preenchimento, cantos, peso) são aplicados pelo seletor de elemento `button`, que não alcança o `<label>`. O anel de foco usa `var(--color-accent, currentColor)`, e `--color-accent` não existe.
- `tests/brand/extension-icons.test.ts` já calcula contraste pela fórmula da WCAG a partir de cores fixas, sem dependência.

## Goals / Non-Goals

**Goals:**

- Corrigir os comportamentos da spec sem alterar domínio, casos de uso, store, persistência ou lembretes: toda a mudança fica em componentes Vue e CSS.
- Tornar cada regra de foco e teclado verificável por teste de componente com `document.activeElement`.
- Tornar o contraste dos tokens verificável por teste, lendo o próprio `base.css`, para que uma troca futura de cor quebre o teste.

**Non-Goals:**

- Criar um utilitário genérico de gestão de foco, um composable de "roving focus" ou uma diretiva global. As regras são locais à listagem e aos dois formulários.
- Corrigir perdas de foco fora da listagem e dos formulários (ver Riscos).
- Verificar contraste de cores literais espalhadas nos componentes além das usadas pelos cartões e pelo seletor de arquivo.

## Decisions

### 1. Seletor de status com confirmação adiada só para navegação pelo teclado

`TaskList.vue` mantém, por cartão, um status pendente e uma marca de navegação pelo teclado:

- `keydown` de ArrowUp, ArrowDown, Home, End, PageUp ou PageDown no seletor marca a navegação pelo teclado daquele cartão.
- `change` com a marca ativa só registra o valor pendente e não emite nada. Sem a marca (escolha feita na lista aberta do seletor, com ponteiro ou teclado), emite `change-status` imediatamente.
- `keydown` de Enter com valor pendente diferente do persistido emite `change-status` e limpa a marca.
- `focusout` com valor pendente diferente do persistido emite `change-status`, sinalizando que a confirmação veio da saída do campo.
- `keydown` de Escape restaura o valor exibido para o status persistido e limpa o pendente, de modo que a saída seguinte não grava nada.
- Valor pendente igual ao persistido é descartado sem emitir.
- Se o status persistido da tarefa mudar por outra via (outra superfície, ação rápida), o pendente é descartado e o seletor passa a exibir o novo status.
- Se a gravação falhar, o seletor volta a exibir o status persistido, porque o valor exibido é sempre derivado de `task.status` quando não há pendente.

**Alternativas:**

- **Botão "Aplicar" ao lado do seletor:** determinístico, mas acrescenta um passo para todos e ocupa espaço num cartão já denso.
- **Remover o seletor do cartão:** elimina o problema, mas remove o único caminho rápido para `IN_PROGRESS` e altera o comportamento documentado no README; seria mudança de UX sem evidência.
- **Debounce do `change`:** depende de tempo, ainda grava valores intermediários de quem navega devagar e torna os testes frágeis.
- **Manter a gravação imediata e só não desabilitar:** resolve o foco, mas continua persistindo status intermediários, reconciliando alarmes e anunciando feedback a cada seta.

### 2. Controles do cartão com `aria-disabled` em vez de `disabled`

Durante o processamento, os controles do cartão recebem `aria-disabled="true"` e continuam focáveis; os handlers de `TaskList.vue` ignoram acionamentos enquanto `busyTaskId` for a tarefa do cartão. O CSS de `base.css` passa a aplicar a mesma aparência de desabilitado a `[aria-disabled='true']`.

Formulários, diálogo e backup continuam usando `disabled` nos botões de envio: nesses fluxos o próprio resultado da operação define o destino do foco (decisões 4 e 3) ou a interface é substituída.

**Alternativa:** manter `disabled` e reposicionar o foco depois. Descartada porque, entre o início e o fim da gravação, o foco já estaria no `body` e leitores de tela anunciariam a página.

### 3. Destino do foco calculado em `TaskManager.vue`

`TaskManager.vue` é o único componente que conhece a lista visível antes e depois da ação, os estados vazios e o diálogo. Por isso ele decide o destino; `TaskList.vue` só expõe, por `defineExpose`, uma função para focar um controle de um cartão, localizado por `data-task-id` e por um novo `data-action` (`edit`, `complete`, `cancel`, `reopen`, `status`, `delete`).

Fluxo para concluir, cancelar, reabrir, alterar status e excluir:

1. Antes da operação, guardar o `id` da tarefa, sua posição em `visibleTasks`, a ação de origem e se ela veio da saída do seletor.
2. Após o resultado, aguardar `nextTick`.
3. Em falha: se o controle de origem continua conectado, garantir o foco nele; nas exclusões, o `ConfirmDialog` já devolve o foco ao botão Excluir, que continua existindo.
4. Em sucesso, se a confirmação veio da saída do seletor e o `document.activeElement` ainda está conectado e não é o `body`, não mover o foco.
5. Se a tarefa continua em `visibleTasks`, focar o controle equivalente: `complete` e `cancel` levam a `reopen`; `reopen` leva a `complete`; `status` leva a `status`.
6. Senão, focar `edit` da tarefa que ocupa a mesma posição na nova `visibleTasks` ou, se a posição não existir mais, da última.
7. Senão, focar a ação principal do estado exibido: "Limpar filtros" (sem resultados) ou "Criar primeira tarefa" (lista vazia), por referências de template.

Na exclusão, o passo 2 roda depois do desmonte do `ConfirmDialog`, então o foco definido pelo `TaskManager` prevalece sobre a tentativa do diálogo de focar o botão removido. `ConfirmDialog.vue` não precisa mudar.

**Alternativas:**

- **Focar o próprio cartão (`article` com `tabindex="-1"`):** cria uma parada de foco não interativa e obriga a pessoa a procurar a ação de novo.
- **Focar sempre o título "Tarefas" ou a região de feedback:** previsível, mas devolve a pessoa ao topo de uma lista longa a cada ação.
- **Calcular o destino dentro de `TaskList.vue`:** a lista não conhece os estados vazios nem o momento em que a store termina de atualizar.

### 4. Foco no primeiro campo inválido pela ordem do DOM

`TaskForm.vue` expõe `focusFirstInvalid()`, que busca o primeiro elemento com `aria-invalid="true"` dentro do formulário em ordem de documento. Quando o elemento é o `fieldset` de lembretes, foca o primeiro `input` dele. `TaskManager.vue` chama essa função após `nextTick` quando `result.errors` tem campos; quando não tem, foca a mensagem de falha, que ganha `tabindex="-1"`.

`QuickAdd.vue` aplica a mesma busca internamente e, sem erro de campo, foca a mensagem `role="alert"`, que também ganha `tabindex="-1"`.

**Alternativa:** uma lista fixa com a ordem dos campos em cada formulário. Descartada porque duplica a ordem do template e pode divergir em silêncio quando um campo for movido.

### 5. Tokens de contraste e remoção da opacidade dos cartões

Em `src/styles/base.css`:

| Token novo ou alterado                                 | Valor                                     | Contraste medido                               |
| ------------------------------------------------------ | ----------------------------------------- | ---------------------------------------------- |
| `--color-page` (novo, substitui os literais `#f7f8fc`) | `#f7f8fc`                                 | referência                                     |
| `--color-focus-ring` (novo)                            | `var(--color-primary-strong)` = `#3549c7` | 7,17:1 sobre `#ffffff`; 6,76:1 sobre `#f7f8fc` |
| `--color-control-border` (novo)                        | `#7b869b`                                 | 3,67:1 sobre `#ffffff`; 3,46:1 sobre `#f7f8fc` |

- Os `outline` de `button`, `input`, `select` e `textarea` passam a usar `--color-focus-ring`.
- A borda de `input`, `select` e `textarea` passa a usar `--color-control-border`. `--color-border-strong` continua nas bordas decorativas (estados vazios e faixa lateral do cartão), que não são componentes.
- Em `TaskList.vue`, a regra `opacity: 0.8` dos cartões `DONE` e `CANCELLED` é removida. A distinção fica no título tachado e no status em texto, que já existem.

`#3549c7` já é a cor de hover e dos botões secundários. A restrição de `extension-icons` sobre essa cor vale só para o quadrado do ícone, não para a interface.

**Alternativas:**

- **`#5368e8` como anel:** 4,65:1 sobre branco, mas 1,00:1 contra o botão primário, que fica a 2 px do anel; `#3549c7` mantém mais folga.
- **Escurecer `--color-border-strong` para todos os usos:** mudaria o peso visual das bordas decorativas sem necessidade normativa.
- **Fundo acinzentado nos cartões concluídos:** aproximaria o cartão do fundo da página e exigiria nova verificação de todas as combinações de texto.

### 6. Teste de contraste lendo `base.css`

Novo `tests/styles/contrast.test.ts`, com `node:fs`:

- extrai as propriedades customizadas do bloco `:root` de `src/styles/base.css` e resolve `var(--x)` de um nível;
- verifica pelo menos 4,5:1 para `--color-ink`, `--color-muted`, `--color-danger` e `--color-primary-strong` sobre `--color-surface` e `--color-page`; branco sobre `--color-primary` e `--color-danger`; `--color-primary-strong` sobre `--color-primary-soft`; e os pares de `.feedback-*` e dos selos de prazo;
- verifica pelo menos 3:1 para `--color-focus-ring` e `--color-control-border` sobre `--color-surface` e `--color-page`;
- confere que as regras de `outline` de `base.css` usam `var(--color-focus-ring)`;
- percorre os blocos CSS de `src/styles/*.css` e dos `<style>` dos `.vue` em `src/` e falha se `opacity` aparecer em regra cujo seletor não contenha `:disabled` ou `aria-disabled`.

A função de contraste é duplicada do teste de marca em vez de extraída para `tests/support`, porque são 10 linhas; se um terceiro consumidor surgir, extrai-se.

**Alternativa:** auditoria com axe no Vitest. Descartada: nova dependência, e o happy-dom não calcula estilos em cascata com fidelidade suficiente para contraste.

### 7. Título "Lista de tarefas"

`TaskManager.vue` envolve `TaskList` em `<section>` com `aria-labelledby` apontando para um `<h2 class="visually-hidden">Lista de tarefas</h2>`, renderizado somente quando `visibleTasks` não está vazia. O estado "Nenhuma tarefa encontrada" mantém seu próprio `h2`.

**Alternativa:** tornar visível o título da seção. Descartada por ser mudança estética sem evidência.

### 8. Seletor de arquivo como `<button>` que aciona o `<input type="file">`

Em `BackupManager.vue`, o `<label>` estilizado é substituído por um `<button type="button" class="button-secondary">Escolher arquivo de backup</button>`, que chama `click()` num `<input type="file">` com referência de template, `tabindex="-1"` e `hidden`. O `id` `backup-file-input` e o handler `change` são mantidos. A regra `.file-picker:focus-within` e a referência a `--color-accent` são removidas.

O botão herda aparência, estado desabilitado e `--color-focus-ring` do CSS base, e passa a haver uma única parada de Tab.

**Alternativas:**

- **Manter o `<label>` e generalizar os estilos de botão para uma classe `.button`:** exige reordenar input e label para usar `:focus-visible` com seletor de irmão, e mantém duas peças para um controle.
- **Só corrigir o CSS do `<label>`:** duplicaria em `BackupManager.vue` os estilos de botão do `base.css`.

## Risks / Trade-offs

- [No Chrome para macOS, a seta sobre o seletor fechado abre a lista em vez de mudar o valor; a marca de navegação pode ficar ativa e adiar a gravação até Enter no seletor ou saída do campo] → Não há gravação intermediária em nenhum caso; o adiamento é aceitável, e a verificação manual do projeto é no Windows. A marca é limpa a cada confirmação ou Escape.
- [A detecção de navegação depende de nomes de tecla; um leitor de tela que altere o valor por outro mecanismo pode disparar `change` sem `keydown`] → Nesse caso a escolha é tratada como confirmação explícita e grava uma vez, como hoje. O checklist manual inclui o Narrador do Windows no seletor.
- [`aria-disabled` não bloqueia o clique nativamente] → Os handlers verificam `busyTaskId` antes de emitir; há teste de acionamento repetido.
- [A regra de vizinho depende da ordem de `visibleTasks` depois da atualização; uma sincronização vinda de outra superfície no mesmo intervalo pode mudar a lista] → O destino é recalculado sobre a lista mais recente; se o índice não existir, usa o último cartão, e sem cartões usa o estado vazio. Não há perda de foco para o `body`.
- [O teste de `opacity` por expressão regular assume CSS sem aninhamento] → É o caso atual do projeto; o teste falha com mensagem explícita se não conseguir interpretar um bloco.
- [Perdas de foco com o mesmo mecanismo fora do escopo: após exportar backup (botão desabilitado durante a exportação) e ao escolher um arquivo (a área é substituída pela prévia)] → Não foram medidas no explore e ficam fora desta Change. Devem ser registradas como observação na verificação e, se confirmadas, viram um novo item do roadmap.
- [O Chromium usado no explore não é o Chrome estável 152] → O checklist manual da Change é feito no Chrome estável com o Side Panel na largura real.

## Migration Plan

Não há dados, formato ou permissões alterados. A mudança chega com a atualização da extensão e o rollback é reverter o commit; não há estado a limpar.
