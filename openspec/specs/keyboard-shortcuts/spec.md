# keyboard-shortcuts Specification

## Purpose

Define os atalhos de teclado do TaskFlow: quais comandos o navegador reconhece, o que cada um abre, como o sistema se comporta quando a combinação sugerida não pode ser atribuída e como os atalhos realmente em vigor são apresentados e personalizados pelo usuário.

## Requirements

### Requirement: Comandos de teclado declarados sem permissão adicional

O TaskFlow SHALL declarar exatamente dois comandos de teclado: o comando reservado de ação da extensão, que abre o Quick Add, e o comando `open-task-manager`, que abre o gerenciamento de tarefas. Cada comando SHALL declarar uma combinação sugerida com um valor padrão e um valor específico para macOS. O comando `open-task-manager` SHALL declarar uma descrição em pt-BR, exibida na tela de atalhos do navegador. A combinação padrão sugerida para o Quick Add SHALL ser `Ctrl+Shift+K`, e a de macOS SHALL ser `Command+Shift+K`. A combinação padrão sugerida para o gerenciamento SHALL ser `Ctrl+Shift+L`, e a de macOS SHALL ser `Command+Shift+L`. Nenhum comando SHALL ser marcado como global. Nenhuma combinação SHALL usar `Ctrl+Alt`, e `MacCtrl` MUST NOT aparecer fora da combinação específica de macOS. O TaskFlow MUST NOT declarar comandos sem combinação sugerida, preservando livres dois dos quatro atalhos sugeridos que o navegador admite por extensão. A declaração desses comandos MUST NOT acrescentar nenhuma permissão às já exigidas pelas demais capabilities.

#### Scenario: Comandos declarados no pacote

- **WHEN** o pacote de produção do TaskFlow é inspecionado
- **THEN** ele declara o comando reservado de ação com `Ctrl+Shift+K` como padrão e `Command+Shift+K` para macOS
- **AND** declara `open-task-manager` com `Ctrl+Shift+L` como padrão, `Command+Shift+L` para macOS e descrição em pt-BR
- **AND** não declara nenhum outro comando

#### Scenario: Nenhuma permissão nova é solicitada

- **WHEN** o pacote de produção do TaskFlow é inspecionado
- **THEN** as permissões declaradas continuam sendo exatamente as exigidas antes dos atalhos
- **AND** nenhuma permissão de host e nenhum content script são declarados

#### Scenario: Restrições de combinação respeitadas

- **WHEN** as combinações sugeridas são verificadas
- **THEN** nenhuma delas é marcada como global
- **AND** nenhuma delas usa `Ctrl+Alt`
- **AND** `MacCtrl` não aparece em nenhuma combinação que não seja a de macOS

### Requirement: Atalho de nova tarefa abre o Quick Add

O atalho do comando reservado de ação SHALL abrir o popup do Quick Add com o mesmo estado inicial de uma abertura pelo ícone da extensão, incluindo o foco inicial no campo Título, conforme a capability `quick-add`. Esse comando SHALL ser executado diretamente pelo navegador e MUST NOT depender de tratamento próprio do TaskFlow para abrir o popup. O TaskFlow MUST NOT executar nenhuma ação adicional em resposta a esse comando, e em particular MUST NOT ler a aba ativa, o conteúdo da página nem o texto selecionado.

#### Scenario: Quick Add aberto pelo atalho

- **GIVEN** o atalho do Quick Add está atribuído
- **WHEN** o usuário aciona esse atalho com o navegador em foco
- **THEN** o popup do Quick Add é apresentado com o formulário no estado inicial e o foco no campo Título
- **AND** o campo "URL de origem" não é exibido

#### Scenario: Nenhum dado da página é lido pelo atalho

- **GIVEN** a aba ativa usa `https` e contém texto selecionado
- **WHEN** o usuário abre o Quick Add pelo atalho
- **THEN** nenhum dado da página atual é lido ou anexado automaticamente à tarefa

### Requirement: Atalho de gerenciamento abre a listagem no Side Panel

O comando `open-task-manager` SHALL abrir o Side Panel do TaskFlow na janela em que o atalho foi acionado, apresentando a listagem de tarefas. O comando MUST NOT abrir o formulário de nova tarefa nem qualquer outra tela do gerenciamento. Quando o Side Panel já estiver aberto naquela janela, acionar o comando MUST NOT alterar o estado apresentado: pesquisa, filtros, ordenação e um formulário em edição SHALL permanecer como estavam, sem perda de dados digitados. Quando a janela do acionamento não puder ser identificada, o sistema MUST NOT abrir o Side Panel em outra janela e SHALL registrar a falha sem incluir título, descrição, URL de origem ou qualquer outro conteúdo de tarefa. Quando a abertura for rejeitada pelo navegador, o TaskFlow SHALL permanecer utilizável e SHALL registrar a falha com a mesma restrição de conteúdo. O sistema MUST NOT prometer mover o foco do teclado para dentro do Side Panel ao abri-lo por atalho.

#### Scenario: Side Panel aberto pelo atalho

- **GIVEN** o atalho de gerenciamento está atribuído e o Side Panel não está aberto na janela atual
- **WHEN** o usuário aciona esse atalho
- **THEN** o Side Panel é aberto nessa janela apresentando a listagem de tarefas
- **AND** nenhum formulário de criação ou edição é apresentado

#### Scenario: Acionamento repetido preserva o estado

- **GIVEN** o Side Panel está aberto com uma pesquisa e um filtro de status aplicados
- **WHEN** o usuário aciona o atalho de gerenciamento novamente
- **THEN** a pesquisa, os filtros e a ordenação permanecem exatamente como estavam

#### Scenario: Acionamento durante uma edição não descarta o formulário

- **GIVEN** o Side Panel está aberto com o formulário de edição de uma tarefa preenchido e ainda não salvo
- **WHEN** o usuário aciona o atalho de gerenciamento
- **THEN** o formulário continua apresentado com os dados digitados preservados

#### Scenario: Janela do acionamento não identificada

- **GIVEN** o atalho de gerenciamento foi acionado sem que a janela de origem possa ser identificada
- **WHEN** o sistema processa o comando
- **THEN** nenhum Side Panel é aberto
- **AND** a falha é registrada sem incluir conteúdo de tarefa

#### Scenario: Abertura rejeitada pelo navegador

- **GIVEN** o navegador rejeitará a abertura do Side Panel
- **WHEN** o usuário aciona o atalho de gerenciamento
- **THEN** o TaskFlow permanece utilizável pelo ícone da extensão
- **AND** a falha é registrada sem incluir conteúdo de tarefa

#### Scenario: Comando desconhecido é ignorado

- **WHEN** o navegador entrega ao TaskFlow um comando que ele não declara
- **THEN** nenhuma tela é aberta e nenhuma alteração é persistida

### Requirement: Atalho indisponível não impede o uso do TaskFlow

Quando uma combinação sugerida já estiver ocupada pelo navegador, pelo sistema operacional ou por outra extensão, o TaskFlow SHALL continuar instalável e plenamente utilizável, e o comando correspondente SHALL simplesmente permanecer sem atalho atribuído. Essa situação MUST NOT produzir erro, mensagem de falha ou bloqueio de qualquer funcionalidade. O ícone da extensão SHALL continuar abrindo o Quick Add e a ação "Abrir gerenciamento" do Quick Add SHALL continuar abrindo o Side Panel, independentemente de qualquer atalho estar atribuído. O usuário SHALL poder atribuir, alterar ou remover a combinação de cada comando pela tela de atalhos do navegador, e o TaskFlow SHALL respeitar a combinação escolhida sem exigir reinstalação.

#### Scenario: Combinação sugerida já ocupada

- **GIVEN** a combinação sugerida para o gerenciamento já está atribuída a outra extensão
- **WHEN** o TaskFlow é instalado
- **THEN** a instalação é concluída normalmente e nenhuma mensagem de falha é apresentada
- **AND** o comando de gerenciamento fica sem atalho atribuído

#### Scenario: Caminhos principais continuam disponíveis sem atalho

- **GIVEN** nenhum dos comandos tem atalho atribuído
- **WHEN** o usuário aciona o ícone da extensão e, em seguida, "Abrir gerenciamento"
- **THEN** o Quick Add e o Side Panel são abertos normalmente

#### Scenario: Combinação personalizada pelo usuário

- **GIVEN** o usuário atribuiu uma combinação diferente ao comando de gerenciamento na tela de atalhos do navegador
- **WHEN** o usuário aciona essa combinação
- **THEN** o Side Panel é aberto na listagem de tarefas

### Requirement: Atalhos efetivos apresentados e personalizáveis no Side Panel

O Side Panel SHALL apresentar, ao fim da listagem, um bloco com os atalhos em vigor para o Quick Add e para o gerenciamento, obtidos do navegador no momento em que o bloco é apresentado, e não apenas na instalação. Para cada comando sem atalho atribuído, o bloco SHALL informar explicitamente essa ausência em vez de omitir o comando ou exibir a combinação sugerida como se estivesse em vigor. O bloco SHALL oferecer uma ação que abre a tela de atalhos do navegador para personalização, apresentada de forma que funcione a partir de uma página de extensão. Quando não for possível obter os atalhos, o bloco SHALL informar isso sem impedir o uso da listagem. Todo o conteúdo do bloco SHALL estar em pt-BR, SHALL ser alcançável e acionável pelo teclado e SHALL respeitar os limites de contraste definidos em `interface-accessibility`. O bloco MUST NOT ser apresentado como uma tela separada do gerenciamento nem substituir a listagem.

#### Scenario: Atalhos em vigor são exibidos

- **GIVEN** os dois comandos têm atalhos atribuídos
- **WHEN** o Side Panel apresenta a listagem de tarefas
- **THEN** o bloco exibe, ao fim da listagem, o nome de cada ação com a combinação em vigor

#### Scenario: Comando sem atalho é sinalizado

- **GIVEN** o comando de gerenciamento está sem atalho atribuído
- **WHEN** o Side Panel apresenta a listagem de tarefas
- **THEN** o bloco informa explicitamente que essa ação está sem atalho
- **AND** continua exibindo a combinação em vigor do Quick Add

#### Scenario: Combinação alterada pelo usuário é refletida

- **GIVEN** o usuário alterou a combinação do gerenciamento na tela de atalhos do navegador
- **WHEN** o Side Panel volta a apresentar a listagem de tarefas
- **THEN** o bloco exibe a nova combinação, e não a sugerida no pacote

#### Scenario: Personalização a partir do bloco

- **WHEN** o usuário aciona pelo teclado a ação de personalizar atalhos
- **THEN** o navegador apresenta a tela de atalhos das extensões

#### Scenario: Atalhos não podem ser obtidos

- **GIVEN** a consulta dos atalhos ao navegador falhará
- **WHEN** o Side Panel apresenta a listagem de tarefas
- **THEN** o bloco informa que não foi possível obter os atalhos
- **AND** a listagem de tarefas continua utilizável
