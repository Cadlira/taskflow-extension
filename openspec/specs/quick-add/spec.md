# quick-add Specification

## Purpose

Define uma captura rápida no popup para registrar tarefas frequentes com poucos passos, sem impedir o acesso ao formulário completo de gerenciamento no Side Panel.

## Requirements

### Requirement: Formulário compacto de criação

O popup SHALL oferecer título, prazo opcional com data e hora, solicitante opcional, responsável opcional e prioridade, usando `MEDIUM` como prioridade inicial. Campos não exibidos SHALL assumir os padrões do modelo de tarefa.

#### Scenario: Popup é aberto

- **WHEN** o usuário abre o popup da extensão
- **THEN** o foco inicial fica no título e o formulário apresenta os campos compactos com prioridade `MEDIUM`

#### Scenario: Tarefa rápida válida é criada

- **WHEN** o usuário informa um título válido, opcionalmente preenche os demais campos e confirma
- **THEN** o sistema persiste uma nova tarefa `TODO` e informa o sucesso

#### Scenario: Validação falha no Quick Add

- **WHEN** o usuário tenta criar uma tarefa rápida com dados inválidos
- **THEN** o popup permanece aberto, não persiste a tarefa e mostra o erro junto ao campo correspondente

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

O Quick Add desta Change SHALL permitir URL de origem somente pelo formulário completo e não SHALL ler aba ativa, conteúdo da página ou texto selecionado.

#### Scenario: Popup é aberto em uma página web

- **WHEN** o usuário abre o Quick Add durante a navegação
- **THEN** nenhum dado da página atual é lido ou anexado automaticamente à tarefa
