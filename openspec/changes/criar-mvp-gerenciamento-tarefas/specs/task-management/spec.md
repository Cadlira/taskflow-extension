## Purpose

Define o gerenciamento local completo de tarefas do TaskFlow, incluindo ciclo de vida, validação, persistência, consulta e sinalização temporal consistente no popup e no Side Panel.

## ADDED Requirements

### Requirement: Modelo de tarefa local

O sistema SHALL representar cada tarefa com `id`, `title`, `description`, `requester`, `assignee`, `status`, `priority`, `dueAt`, `reminders`, `tags`, `sourceUrl`, `createdAt`, `updatedAt` e `completedAt`. O identificador SHALL ser único e adequado a uma futura sincronização sem depender de sequência centralizada.

#### Scenario: Criação preenche identidade e auditoria

- **WHEN** uma tarefa válida é criada
- **THEN** o sistema gera um identificador UUID, define `createdAt` e `updatedAt` e não define `completedAt`

#### Scenario: Campos opcionais permanecem opcionais

- **WHEN** uma tarefa é criada somente com os campos obrigatórios
- **THEN** o sistema a aceita sem exigir descrição, solicitante, responsável, prazo, lembretes, tags ou URL de origem

### Requirement: Validação essencial

O sistema SHALL exigir um título não vazio após remoção de espaços nas extremidades, com até 200 caracteres. Descrição SHALL aceitar até 4.000 caracteres; solicitante e responsável, até 120 caracteres cada; cada tag, até 30 caracteres, com no máximo 10 tags distintas sem diferenciar maiúsculas de minúsculas. Quando informada, a URL de origem SHALL usar `http` ou `https` e datas SHALL ser válidas.

#### Scenario: Título vazio é rejeitado

- **WHEN** o usuário tenta salvar uma tarefa cujo título contém apenas espaços
- **THEN** o sistema não persiste a tarefa e informa o erro junto ao campo de título

#### Scenario: Limite de campo é rejeitado

- **WHEN** um campo excede seu limite definido
- **THEN** o sistema não persiste a alteração e identifica o campo inválido

#### Scenario: Tags duplicadas são normalizadas

- **WHEN** o usuário informa tags que diferem apenas por caixa ou espaços nas extremidades
- **THEN** o sistema persiste uma única ocorrência normalizada de cada tag

#### Scenario: URL de origem inválida é rejeitada

- **WHEN** o usuário informa uma URL que não usa `http` ou `https`
- **THEN** o sistema não persiste a alteração e informa que a URL é inválida

### Requirement: Valores iniciais

O sistema SHALL iniciar uma nova tarefa com status `TODO` e prioridade `MEDIUM` quando esses valores não forem informados.

#### Scenario: Criação usa valores padrão

- **WHEN** o usuário cria uma tarefa sem escolher status ou prioridade
- **THEN** a tarefa é salva com status `TODO` e prioridade `MEDIUM`

### Requirement: Criação e edição completas

O Side Panel SHALL permitir criar e editar todos os campos da tarefa previstos para o MVP, preservando `id` e `createdAt` em edições e atualizando `updatedAt` somente quando a alteração for salva.

#### Scenario: Criação pelo formulário completo

- **WHEN** o usuário preenche dados válidos e confirma uma nova tarefa no Side Panel
- **THEN** a tarefa é persistida e aparece na listagem com os valores informados

#### Scenario: Edição confirmada

- **WHEN** o usuário altera uma tarefa existente com dados válidos e salva
- **THEN** o sistema preserva sua identidade e criação, atualiza os campos editáveis e define um novo `updatedAt`

#### Scenario: Edição cancelada

- **WHEN** o usuário abandona uma edição sem salvar
- **THEN** o sistema mantém os dados persistidos anteriores

### Requirement: Ciclo de vida da tarefa

O sistema SHALL aceitar os status `TODO`, `IN_PROGRESS`, `DONE` e `CANCELLED`. Concluir SHALL definir status `DONE` e `completedAt`; mover uma tarefa para fora de `DONE` SHALL limpar `completedAt`; cancelar SHALL definir `CANCELLED` e manter `completedAt` vazio.

#### Scenario: Tarefa é concluída

- **WHEN** o usuário conclui uma tarefa ativa
- **THEN** o sistema define status `DONE`, registra `completedAt` e atualiza `updatedAt`

#### Scenario: Tarefa concluída é reaberta

- **WHEN** o usuário altera uma tarefa `DONE` para `TODO` ou `IN_PROGRESS`
- **THEN** o sistema limpa `completedAt` e atualiza `updatedAt`

#### Scenario: Tarefa é cancelada

- **WHEN** o usuário cancela uma tarefa
- **THEN** o sistema define status `CANCELLED`, mantém `completedAt` vazio e atualiza `updatedAt`

#### Scenario: Status é alterado diretamente

- **WHEN** o usuário seleciona um status permitido no formulário
- **THEN** o sistema aplica as mesmas regras de conclusão, reabertura e cancelamento das ações rápidas

### Requirement: Exclusão confirmada

O sistema SHALL permitir exclusão definitiva somente após confirmação explícita do usuário.

#### Scenario: Exclusão confirmada

- **WHEN** o usuário confirma a exclusão de uma tarefa
- **THEN** o sistema remove a tarefa da persistência e da listagem

#### Scenario: Exclusão cancelada

- **WHEN** o usuário cancela a confirmação de exclusão
- **THEN** a tarefa permanece inalterada

### Requirement: Persistência local compartilhada

O sistema SHALL persistir tarefas no armazenamento local da extensão e SHALL apresentar os mesmos dados após fechar e reabrir popup, Side Panel ou navegador. Alterações no armazenamento SHALL atualizar qualquer superfície aberta sem exigir recarregamento manual.

#### Scenario: Dados sobrevivem ao fechamento da interface

- **WHEN** uma tarefa é salva e a superfície da extensão é fechada e aberta novamente
- **THEN** a tarefa reaparece com os dados persistidos

#### Scenario: Outra superfície altera os dados

- **WHEN** uma tarefa é alterada em uma superfície enquanto outra superfície está aberta
- **THEN** a superfície aberta reflete a alteração recebida do armazenamento

#### Scenario: Falha de persistência

- **WHEN** o armazenamento local rejeita uma operação
- **THEN** o sistema informa que a alteração não foi salva e não apresenta sucesso enganoso

### Requirement: Listagem e estados da interface

O Side Panel SHALL listar tarefas com título, status, prioridade e prazo quando existente, e SHALL oferecer estados distinguíveis de carregamento, lista vazia e erro.

#### Scenario: Lista vazia

- **WHEN** não existem tarefas persistidas
- **THEN** o sistema apresenta um estado vazio com ação para criar a primeira tarefa

#### Scenario: Falha ao carregar

- **WHEN** a leitura das tarefas falha
- **THEN** o sistema apresenta mensagem de erro e uma ação para tentar novamente

### Requirement: Pesquisa e filtros

O Side Panel SHALL permitir pesquisa textual sem diferenciar maiúsculas de minúsculas em título, descrição, solicitante, responsável e tags. SHALL permitir combinar filtros por status, prioridade e situação de prazo.

#### Scenario: Pesquisa encontra campos relevantes

- **WHEN** o usuário pesquisa um termo presente em qualquer campo pesquisável
- **THEN** somente tarefas correspondentes permanecem na lista

#### Scenario: Filtros são combinados

- **WHEN** o usuário seleciona filtros de status, prioridade e situação de prazo
- **THEN** o sistema apresenta somente tarefas que satisfazem simultaneamente todos os filtros ativos

#### Scenario: Filtros são limpos

- **WHEN** o usuário aciona limpar filtros
- **THEN** o sistema volta a apresentar todas as tarefas conforme a ordenação escolhida

### Requirement: Ordenação

O Side Panel SHALL permitir ordenar por prazo, prioridade ou status. Na ordenação por prazo, tarefas com prazo mais próximo SHALL aparecer primeiro e tarefas sem prazo SHALL aparecer por último; empates SHALL usar `createdAt` mais recente primeiro.

#### Scenario: Ordenação por prazo

- **WHEN** o usuário escolhe ordenar por prazo
- **THEN** as tarefas são exibidas por `dueAt` crescente, seguidas das tarefas sem prazo

#### Scenario: Ordenação por prioridade

- **WHEN** o usuário escolhe ordenar por prioridade
- **THEN** as tarefas são exibidas na ordem `URGENT`, `HIGH`, `MEDIUM`, `LOW`, com `createdAt` mais recente como desempate

#### Scenario: Ordenação por status

- **WHEN** o usuário escolhe ordenar por status
- **THEN** as tarefas são agrupadas na ordem `TODO`, `IN_PROGRESS`, `DONE`, `CANCELLED`, com prazo como desempate

### Requirement: Sinalização de prazo

O sistema SHALL considerar atrasada uma tarefa `TODO` ou `IN_PROGRESS` cujo prazo já passou. SHALL considerar próxima do vencimento uma tarefa ativa com prazo entre o instante atual e as próximas 24 horas. Tarefas `DONE`, `CANCELLED` ou sem prazo não SHALL receber essas classificações.

#### Scenario: Tarefa ativa atrasada

- **WHEN** uma tarefa `TODO` ou `IN_PROGRESS` possui `dueAt` anterior ao instante atual
- **THEN** o sistema a identifica visualmente como atrasada e permite filtrá-la como tal

#### Scenario: Tarefa vence nas próximas 24 horas

- **WHEN** uma tarefa ativa possui `dueAt` futuro em até 24 horas
- **THEN** o sistema a identifica como próxima do vencimento

#### Scenario: Tarefa terminal não é atrasada

- **WHEN** uma tarefa `DONE` ou `CANCELLED` possui prazo passado
- **THEN** o sistema não a classifica como atrasada nem próxima do vencimento

### Requirement: Datas independentes de fuso na persistência

O sistema SHALL persistir instantes em formato ISO 8601 UTC e SHALL exibi-los e editá-los no fuso local do navegador.

#### Scenario: Prazo é salvo e reaberto

- **WHEN** o usuário informa uma data e hora local, salva e reabre a tarefa
- **THEN** o sistema apresenta a mesma data e hora local, preservando o instante UTC persistido
