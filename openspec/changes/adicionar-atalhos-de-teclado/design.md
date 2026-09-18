## Context

Ver `proposal.md` — Why. Os requisitos estão em `specs/keyboard-shortcuts/spec.md`.

Três características do estado atual moldam a solução:

- O Manifest já declara `action.default_popup` e `side_panel.default_path`. O Quick Add já leva o foco ao campo Título ao montar, exigência da capability `quick-add`. Nenhuma dessas superfícies precisa mudar.
- O service worker já registra todos os listeners de forma síncrona e já possui `openSidePanelInWindow(windowId)`, criado para o menu de contexto justamente porque `sidePanel.open` exige gesto do usuário e não sobrevive a um `await` anterior. O `ChromeSidePanelNavigator`, que consulta a janela atual antes de abrir, só funciona no popup porque roda dentro de um clique real naquela página e não serve ao service worker.
- A camada `application` é proibida de referenciar APIs do Chrome pelo teste de fronteiras de camadas, e o projeto já injeta adapters por props ou `provide` (`ChromeSidePanelNavigator`, `ChromePendingCaptureInbox`, serviços de tarefa e backup).

Restrições da API `chrome.commands` que condicionam o desenho: no máximo quatro combinações sugeridas por extensão; toda combinação precisa de `Ctrl` ou `Alt`; `Ctrl+Alt` é proibido; `MacCtrl` só é válido na chave `mac` e invalida a instalação fora dela; atalhos do navegador e do sistema operacional têm prioridade absoluta; e o comando reservado de ação não aciona `commands.onCommand`.

## Goals / Non-Goals

**Goals:**

- Manter o service worker dentro da janela de gesto do usuário em todo o caminho de abertura do Side Panel.
- Isolar `chrome.commands` atrás de uma porta, para que o bloco de atalhos do Side Panel seja testável sem a API do navegador.
- Deixar a ausência de atalho visível ao usuário sem transformá-la em erro.

**Non-Goals:**

- Alterar o comportamento do Quick Add, do formulário de tarefas ou da listagem.
- Criar uma tela de configurações ou um novo modo de navegação no Side Panel.
- Persistir qualquer informação sobre atalhos; o navegador já é a fonte da verdade.

## Decisions

### Nova tarefa usa o comando reservado de ação, não um comando próprio

O comando reservado abre o popup diretamente pelo navegador. Um comando próprio equivalente exigiria tratar `onCommand` e chamar a API de ação para abrir o popup, acrescentando código para reproduzir um comportamento nativo e um caminho de falha que hoje não existe. Como o comando reservado ignora `description` e nunca aciona `onCommand`, a implementação é apenas Manifest.

**Alternativa descartada:** comando próprio `new-task` abrindo o popup por código. Mais código, mesmo resultado, e perderia a integração nativa do navegador com o ícone da extensão.

### O `windowId` vem do evento, nunca de uma consulta assíncrona

`commands.onCommand` entrega a aba ativa junto com o nome do comando. O handler usa esse `windowId` e chama `openSidePanelInWindow` de forma síncrona, reusando o adapter que já existe. Consultar a janela atual introduziria um `await` antes da abertura e o navegador rejeitaria a chamada por perda do gesto — a mesma razão pela qual esse adapter foi criado para o menu de contexto.

Quando a aba ou o `windowId` não chegam, não há saída sem `await`. A decisão é não abrir nada e registrar log, em vez de tentar recuperar a janela e falhar de forma confusa. O log segue o padrão já existente no service worker de não incluir conteúdo de tarefa.

**Alternativa descartada:** `windows.getCurrent()` com fallback. Quebra o gesto no caminho principal, não só no de borda.

**Alternativa descartada:** `sidePanel.setPanelBehavior({ openPanelOnActionClick: true })`. Substituiria o popup pelo painel no clique do ícone e eliminaria o Quick Add, contrariando a capability `quick-add`.

### As combinações são `Ctrl+Shift+K` e `Ctrl+Shift+L`

O espaço livre é estreito. Com `Ctrl+Shift`, as letras A, B, C, D, G, I, J, M, N, O, P, Q, T, V e W pertencem ao Chrome; R e Z colidem com recarregar forçado e refazer em campos de texto; S é captura de tela no ChromeOS; U é a sequência Unicode do IBus em Linux; e Y é o serviço "Nova nota com seleção" no macOS. Restam E, F, H, K, L e X. `K` e `L` são adjacentes, o que os torna fáceis de memorizar como par, e `L` remete a "Lista".

`Alt+Shift+…` foi descartado: é permitido pela API, mas no Windows alterna o layout de teclado do sistema, conflito frequente em máquinas com ABNT2 e US instalados.

A verificação manual dessas combinações em Windows e macOS é uma tarefa explícita do plano, não uma suposição do desenho.

### Só as chaves `default` e `mac`

`default` cobre Windows, Linux e ChromeOS, e `Ctrl` é convertido automaticamente em `Command` no macOS. A chave `mac` é funcionalmente redundante, mas declará-la registra a intenção e protege contra uma futura troca do valor de `default` que produzisse uma combinação inadequada no macOS. Declarar `windows`, `linux` e `chromeos` separadamente multiplicaria valores idênticos sem ganho.

### Leitura dos atalhos por porta na camada `application`

A camada `application` recebe uma porta com um método que devolve os atalhos em vigor; o adapter correspondente em `src/infrastructure/chrome/` consulta `commands.getAll()` e traduz o resultado, incluindo o caso de combinação vazia. O componente do Side Panel recebe a porta por `provide`/`inject`, como já ocorre com os serviços de tarefa, backup e lixeira, e o teste de fronteiras de camadas continua satisfeito.

A consulta é feita quando o bloco é apresentado, não em `runtime.onInstalled`. A documentação do Chrome sugere o padrão de instalação, mas ele só enxerga o estado do primeiro dia: o usuário pode remapear ou desatribuir um comando a qualquer momento, e o bloco precisa refletir o estado atual.

### Personalização abre a tela de atalhos por `tabs.create`

Uma página de extensão não pode navegar para `chrome://` por link, então `<a href="chrome://extensions/shortcuts">` não funciona. A ação é um botão que pede ao navegador para abrir essa URL em uma nova aba. `tabs.create` não exige a permissão `tabs` — ela só libera propriedades sensíveis como `url` e `title` —, então o conjunto de permissões permanece intacto e o teste que proíbe `tabs` continua válido. A chamada fica no mesmo adapter de infraestrutura.

**Alternativa descartada:** exibir a URL como texto para o usuário copiar. Não exige API alguma, mas transfere trabalho manual para um fluxo que deveria ser de um clique.

### O bloco fica no fim da listagem, não em um modo próprio

O cabeçalho do Side Panel já tem "Lixeira", "Backup" e "Nova tarefa". Um quarto botão abrindo um modo dedicado a informação estática desequilibraria o cabeçalho e acrescentaria mais um estado ao `mode`, com as regras de foco no retorno que cada modo exige. Um bloco discreto no fim da listagem é sempre visível para quem chega ao fim da lista, não compete com as ações principais e não cria estado novo.

### Abrir o Side Panel não move o foco do teclado

Quando o Side Panel é aberto por `sidePanel.open`, o foco do teclado permanece na página. Um `focus()` no documento recém-apresentado tende a não surtir efeito porque esse documento não detém o foco. Especificar um destino de foco seria prometer algo que o navegador pode não honrar, e a spec deliberadamente não promete. As regras de foco de `interface-accessibility` continuam valendo a partir do momento em que o usuário entra no painel.

## Risks / Trade-offs

- **As combinações escolhidas podem estar ocupadas em alguma configuração** → a spec já exige degradação silenciosa e o bloco de atalhos torna a ausência visível; o usuário remapeia em `chrome://extensions/shortcuts` sem reinstalar. A verificação manual em Windows e macOS confirma o caso comum.
- **Acionar o comando com o painel já aberto pode remontar o documento e perder pesquisa, filtros e o formulário em edição**, que vivem em memória → a expectativa é que a abertura de um painel já aberto seja inócua, mas isso precisa de verificação manual antes de considerar a Change concluída. Caso o documento seja remontado, a alternativa é o handler verificar se o painel já está aberto naquela janela; como essa verificação é assíncrona, ela teria de ocorrer depois da abertura e não antes, e a decisão entre ajustar a implementação ou a spec passa por revisão humana.
- **A cobertura de `commands` nos testes depende de um fake do navegador** → o projeto já mantém fakes das APIs do Chrome em `tests/support`; o novo adapter entra no mesmo padrão, e o teste do service worker precisa verificar explicitamente que a abertura do painel ocorre antes de qualquer `await` do handler.
- **O bloco de atalhos acrescenta conteúdo permanente ao fim da listagem** → é informação curta e estática; se o uso mostrar que atrapalha, retirá-lo não afeta nenhum outro requisito.
- **Dois dos quatro atalhos sugeridos são consumidos agora** → escolha deliberada, com os dois restantes preservados; mudar um padrão depois não remapeia quem já personalizou, o que reforça fixar as combinações agora e não voltar atrás sem motivo forte.

## Migration Plan

Não há migração de dados nem alteração de formato persistido. A chave `commands` passa a existir no pacote e o navegador atribui os atalhos na atualização da extensão; nenhuma ação é exigida de quem já usa o TaskFlow. Reverter é remover a chave `commands`, o listener e o bloco do Side Panel, sem qualquer resíduo em `chrome.storage`. O README deve deixar de afirmar que não existem atalhos de teclado e passar a descrever as duas combinações e a personalização.
