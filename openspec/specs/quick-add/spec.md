# quick-add Specification

## Purpose

Define uma captura rápida no popup para registrar tarefas frequentes com poucos passos, sem impedir o acesso ao formulário completo de gerenciamento no Side Panel.

## Requirements

### Requirement: Formulário compacto de criação

O popup SHALL oferecer título, prazo opcional com data e hora, solicitante opcional, responsável opcional e prioridade, usando `MEDIUM` como prioridade inicial. O campo "URL de origem" SHALL ser exibido somente depois que a ação "Usar página atual" capturar uma URL, SHALL permitir edição e SHALL oferecer a ação "Remover URL de origem", que oculta o campo e retira a URL da tarefa. Campos não exibidos SHALL assumir os padrões do modelo de tarefa. Depois de uma criação bem-sucedida, o formulário SHALL voltar ao estado inicial, sem o campo "URL de origem".

#### Scenario: Popup é aberto

- **WHEN** o usuário abre o popup da extensão
- **THEN** o foco inicial fica no título e o formulário apresenta os campos compactos com prioridade `MEDIUM`
- **AND** o campo "URL de origem" não é exibido

#### Scenario: Tarefa rápida válida é criada

- **WHEN** o usuário informa um título válido, opcionalmente preenche os demais campos e confirma
- **THEN** o sistema persiste uma nova tarefa `TODO` e informa o sucesso
- **AND** o formulário volta ao estado inicial, sem o campo "URL de origem"

#### Scenario: Validação falha no Quick Add

- **WHEN** o usuário tenta criar uma tarefa rápida com dados inválidos
- **THEN** o popup permanece aberto, não persiste a tarefa e mostra o erro junto ao campo correspondente

#### Scenario: URL de origem capturada é editada para um valor inválido

- **GIVEN** a URL de origem foi capturada e o usuário a alterou para "ftp://exemplo.com"
- **WHEN** o usuário confirma o Quick Add
- **THEN** o popup não persiste a tarefa e mostra, junto ao campo "URL de origem", que a URL deve usar `http` ou `https`

#### Scenario: URL de origem capturada é removida

- **GIVEN** a URL de origem foi capturada
- **WHEN** o usuário aciona "Remover URL de origem" e confirma o Quick Add com um título válido
- **THEN** o campo deixa de ser exibido e a tarefa é persistida sem `sourceUrl`

### Requirement: Operação por teclado

O Quick Add SHALL permitir salvar pelo teclado sem impedir a digitação de conteúdo nos campos.

#### Scenario: Envio pelo formulário

- **WHEN** o foco está no formulário e o usuário aciona seu envio pelo teclado
- **THEN** o sistema executa a mesma validação e criação do botão de salvar

### Requirement: Acesso ao gerenciamento completo

O popup SHALL oferecer uma ação explícita para abrir o Side Panel do TaskFlow sem solicitar acesso à página atual.

#### Scenario: Abrir gerenciamento

- **WHEN** o usuário aciona "Abrir gerenciamento"
- **THEN** o sistema abre o Side Panel na janela atual

#### Scenario: Side Panel não pode ser aberto

- **WHEN** a API do navegador rejeita a abertura do Side Panel
- **THEN** o popup permanece disponível e informa a falha sem perder dados digitados

### Requirement: Quick Add não captura contexto automaticamente

O Quick Add MUST NOT ler a aba ativa, o conteúdo da página ou o texto selecionado ao ser aberto ou sem uma ação explícita do usuário. O Quick Add SHALL ler somente o título e a URL da aba ativa, e somente quando o usuário acionar "Usar página atual", conforme a capability `page-capture`. O Quick Add MUST NOT ler o conteúdo da página nem o texto selecionado em nenhuma circunstância.

#### Scenario: Popup é aberto em uma página web

- **WHEN** o usuário abre o Quick Add durante a navegação
- **THEN** nenhum dado da página atual é lido ou anexado automaticamente à tarefa

#### Scenario: Tarefa sem captura não recebe URL de origem

- **GIVEN** o usuário não acionou "Usar página atual"
- **WHEN** o usuário cria uma tarefa pelo Quick Add
- **THEN** a tarefa é persistida sem `sourceUrl`

#### Scenario: Ação explícita lê somente título e URL

- **GIVEN** a aba ativa usa `https` e contém texto selecionado
- **WHEN** o usuário aciona "Usar página atual"
- **THEN** o Quick Add recebe somente o título e a URL da aba
- **AND** o texto selecionado e o conteúdo da página não são lidos
