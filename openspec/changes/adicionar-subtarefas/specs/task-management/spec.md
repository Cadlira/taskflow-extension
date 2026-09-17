## MODIFIED Requirements

### Requirement: Modelo de tarefa local

O sistema SHALL representar cada tarefa com `id`, `title`, `description`, `requester`, `assignee`, `status`, `priority`, `dueAt`, `reminders`, `recurrence`, `seriesId`, `subtasks`, `tags`, `sourceUrl`, `createdAt`, `updatedAt` e `completedAt`. O identificador SHALL ser único e adequado a uma futura sincronização sem depender de sequência centralizada. `recurrence` e `seriesId` SHALL ser opcionais e SHALL estar ausentes em tarefas que não pertencem a uma série; suas regras estão definidas em `task-recurrence`. `subtasks` SHALL estar presente em toda tarefa, vazia quando não houver itens; suas regras estão definidas em `task-subtasks`.

#### Scenario: Criação preenche identidade e auditoria

- **WHEN** uma tarefa válida é criada
- **THEN** o sistema gera um identificador UUID, define `createdAt` e `updatedAt` e não define `completedAt`

#### Scenario: Campos opcionais permanecem opcionais

- **WHEN** uma tarefa é criada somente com os campos obrigatórios
- **THEN** o sistema a aceita sem exigir descrição, solicitante, responsável, prazo, lembretes, recorrência, subtarefas, tags ou URL de origem

#### Scenario: Tarefa sem série não tem campos de recorrência

- **WHEN** uma tarefa é criada sem regra de recorrência
- **THEN** o sistema não define `recurrence` nem `seriesId` para ela

#### Scenario: Tarefa sem subtarefas tem lista vazia

- **WHEN** uma tarefa é criada sem subtarefas
- **THEN** o sistema a persiste com `subtasks` vazia

### Requirement: Pesquisa e filtros

O Side Panel SHALL permitir pesquisa textual sem diferenciar maiúsculas de minúsculas em título, descrição, solicitante, responsável, tags e títulos das subtarefas. SHALL permitir combinar filtros por status, prioridade e situação de prazo, que SHALL considerar somente os valores da própria tarefa.

#### Scenario: Pesquisa encontra campos relevantes

- **WHEN** o usuário pesquisa um termo presente em qualquer campo pesquisável
- **THEN** somente tarefas correspondentes permanecem na lista

#### Scenario: Pesquisa encontra tarefa pelo título de subtarefa

- **GIVEN** uma tarefa "Preparar reunião" com a subtarefa "Reservar sala"
- **WHEN** o usuário pesquisa "sala"
- **THEN** o cartão da tarefa "Preparar reunião" permanece na lista

#### Scenario: Filtros são combinados

- **WHEN** o usuário seleciona filtros de status, prioridade e situação de prazo
- **THEN** o sistema apresenta somente tarefas que satisfazem simultaneamente todos os filtros ativos

#### Scenario: Marcação de subtarefas não afeta filtros

- **GIVEN** o filtro de status `A fazer` ativo e uma tarefa `TODO` com todas as subtarefas marcadas
- **WHEN** o usuário visualiza a listagem
- **THEN** a tarefa continua exibida

#### Scenario: Filtros são limpos

- **WHEN** o usuário aciona limpar filtros
- **THEN** o sistema volta a apresentar todas as tarefas conforme a ordenação escolhida
