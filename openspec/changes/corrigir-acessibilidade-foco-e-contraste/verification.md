# Verificação manual — `corrigir-acessibilidade-foco-e-contraste` (TF-003)

Registro da tarefa 8.2: checklist manual no Chrome estável com o Side Panel na largura padrão.

## Ambiente

- Data: 2026-09-14.
- Chrome: 152.0.7977.84 (Windows), janela de 1500 × 950.
- Build: `npm run build`, extensão carregada de `.output/chrome-mv3` sem compactação.
- Perfil: temporário e descartável (`chrome-taskflow-a11y`), com a extensão carregada por CDP `Extensions.loadUnpacked` (o Chrome estável não aceita mais `--load-extension`).
- Superfície: Side Panel real, aberto pelo botão **Abrir gerenciamento** do popup, na largura padrão do Chrome (`window.innerWidth = 360`).
- Método: tarefas preparadas em `chrome.storage.local`, interações de teclado e ponteiro disparadas como entradas confiáveis (`Input.dispatchKeyEvent` e `Input.dispatchMouseEvent`), foco medido por `document.activeElement` e razões visuais conferidas em capturas de tela do painel.

## Itens verificados

### 1. Seletor de status sem gravações intermediárias — PASSOU

Com a tarefa `alfa` em `TODO` e o foco no seletor (um contador de `chrome.storage.onChanged` acompanhava cada gravação):

- duas setas para baixo mudaram o valor exibido para `IN_PROGRESS` e depois para `DONE`, mantendo o foco no seletor e sem nenhuma alteração persistida (`alfa:TODO` no armazenamento e contador zerado);
- Enter persistiu uma única alteração: `alfa:DONE`, contador com uma entrada, seletor exibindo `DONE` e foco permanecendo nele;
- com a tarefa `beta` em `TODO`, uma seta para baixo seguida de Escape voltou a exibir `TODO` e o Tab seguinte não gravou nada (`beta:TODO` no armazenamento, contador inalterado);
- com `beta` ainda em `TODO`, uma seta para baixo seguida de Tab persistiu uma única alteração para `IN_PROGRESS` e o foco permaneceu no controle escolhido pelo usuário (o botão Excluir do próprio cartão).

### 2. Foco após ações da listagem — PASSOU

Sem filtro, acionando cada controle pelo teclado:

- Reabrir levou o foco a **Concluir** do mesmo cartão;
- Concluir levou o foco a **Reabrir** do mesmo cartão;
- Cancelar tarefa levou o foco a **Reabrir** do mesmo cartão;
- Excluir (com confirmação no diálogo) levou o foco a **Editar** do cartão que passou a ocupar a mesma posição.

Com o filtro de status `A fazer` ativo e três tarefas visíveis:

- concluir a segunda tarefa removeu o cartão da lista e levou o foco a **Editar** do cartão que passou a ocupar a segunda posição;
- concluir o novo último cartão levou o foco a **Editar** do cartão restante;
- excluir o último cartão levou o foco a **Editar** do novo último;
- concluir a única tarefa visível apresentou **Nenhuma tarefa encontrada** com o foco em **Limpar filtros**;
- excluir a única tarefa persistida apresentou **Nenhuma tarefa ainda** com o foco em **Criar primeira tarefa**.

Em nenhuma das ações acima o foco terminou no `body`.

### 3. Foco no primeiro erro de validação — PASSOU

- Formulário do Side Panel com o conteúdo rolado até o fim (`scrollTop` igual ao máximo) e envio com título vazio: o foco foi para o campo **Título**, que voltou para a área visível (`scrollTop` 0, campo entre 196 e 232 px em uma janela de 807 px), com `aria-invalid="true"` e a mensagem “Informe um título.” associada;
- formulário com título válido, lembrete marcado sem prazo e URL `ftp://exemplo`: o foco foi para a primeira opção de lembrete (`value="0"`), com o título e a URL digitados preservados e o lembrete marcado mantido;
- Quick Add com título vazio, enviado pelo teclado pelo botão de envio: o foco foi para o campo **Título**, com a mensagem de erro associada e o popup mantido;
- Quick Add com falha simulada de armazenamento: o foco foi para a mensagem `role="alert"` (`tabindex="-1"`) e o valor digitado permaneceu no campo.

### 4. Indicador de foco e contraste — PASSOU

Todos os controles focados casaram com `:focus-visible` e apresentaram `outline: rgb(53, 73, 199) solid 3px` (`--color-focus-ring`), com `outline-offset` de 2 px nos botões e 1 px nos campos:

- botão primário **Nova tarefa** e botão secundário de backup sobre o fundo da página;
- botão **Concluir** de um cartão sobre a superfície do cartão;
- campo **Pesquisar**, seletor de status do cartão e seletor de arquivo de backup; o seletor de arquivo é um `<button>` com fundo `#e9edff`, cantos de 11,2 px e peso 700, iguais aos demais botões secundários, e o `<input type="file">` mantém `tabindex="-1"` e `hidden`;
- a borda dos campos de texto e seletores apresentou `rgb(123, 134, 155)` (`--color-control-border`).

### 5. Cartão concluído legível e distinguível — PASSOU

O cartão `status-done` exibiu `opacity: 1`, título com `line-through`, status “Concluída” em texto, rótulos e botões com opacidade 1 e cor `rgb(53, 73, 199)` nos botões secundários. A captura de tela mostra o cartão distinguível e legível sem esmaecimento.

### 6. Seletor de status na árvore de acessibilidade — PASSOU, com limitação

A árvore de acessibilidade do Chrome (fonte consultada por leitores de tela) expôs o seletor como `role: combobox`, `name: "Alterar status de Alfa"`, `value: "Concluída"` e `focused: true`. A fala do Narrador do Windows não foi capturada: não há como registrar áudio do Narrador no método automatizado, então a verificação ficou restrita à árvore de acessibilidade que ele consome.

### 7. Observações fora do escopo — perda de foco registrada

Com a exportação de backup atrasada em 800 ms para observação:

- durante a exportação o botão **Exportar backup** fica desabilitado e o foco vai para o `body`; ao terminar, o foco permanece no `body`;
- ao escolher um arquivo, a área do seletor é substituída pela prévia e o foco também fica no `body`.

Os dois casos têm o mesmo mecanismo já fora do escopo desta Change e ficam registrados para um item futuro do roadmap.

## Limitações do método

- A fala do Narrador do Windows não foi capturada; o item 6 usou a árvore de acessibilidade do Chrome, que é a mesma informação fornecida ao leitor de tela.
- O clique no seletor de arquivo foi substituído por `DOM.setFileInputFiles` no input oculto, porque o diálogo nativo do sistema não é controlável por CDP; o fluxo da aplicação exercitado é o mesmo disparado pelo `change`.
- O download da exportação foi salvo na pasta padrão do usuário (não foi possível direcioná-lo pelo target do Side Panel) e os arquivos gerados foram removidos ao final.
- A janela usada tinha 1500 px de largura; o Side Panel manteve a largura padrão de 360 px, que é a condição pedida para o checklist.

## Conclusão

Todos os itens do checklist da task 8.2 foram executados na extensão empacotada e passaram, sem divergências em relação a `specs/interface-accessibility/spec.md`. As únicas ressalvas são as limitações do método descritas acima e as duas perdas de foco fora do escopo, registradas no item 7.
