## MODIFIED Requirements

### Requirement: Modelo de tarefa local

O sistema SHALL representar cada tarefa com `id`, `title`, `description`, `requester`, `assignee`, `status`, `priority`, `dueAt`, `reminders`, `recurrence`, `seriesId`, `tags`, `sourceUrl`, `createdAt`, `updatedAt` e `completedAt`. O identificador SHALL ser único e adequado a uma futura sincronização sem depender de sequência centralizada. `recurrence` e `seriesId` SHALL ser opcionais e SHALL estar ausentes em tarefas que não pertencem a uma série; suas regras estão definidas em `task-recurrence`.

#### Scenario: Criação preenche identidade e auditoria

- **WHEN** uma tarefa válida é criada
- **THEN** o sistema gera um identificador UUID, define `createdAt` e `updatedAt` e não define `completedAt`

#### Scenario: Campos opcionais permanecem opcionais

- **WHEN** uma tarefa é criada somente com os campos obrigatórios
- **THEN** o sistema a aceita sem exigir descrição, solicitante, responsável, prazo, lembretes, recorrência, tags ou URL de origem

#### Scenario: Tarefa sem série não tem campos de recorrência

- **WHEN** uma tarefa é criada sem regra de recorrência
- **THEN** o sistema não define `recurrence` nem `seriesId` para ela

### Requirement: Ciclo de vida da tarefa

O sistema SHALL aceitar os status `TODO`, `IN_PROGRESS`, `DONE` e `CANCELLED`. Concluir SHALL definir status `DONE` e `completedAt`; mover uma tarefa para fora de `DONE` SHALL limpar `completedAt`; cancelar SHALL definir `CANCELLED` e manter `completedAt` vazio. Quando a tarefa carregar uma regra de recorrência, concluir e cancelar SHALL adicionalmente aplicar as regras de geração e de encerramento definidas em `task-recurrence`, sem alterar o efeito sobre o status e sobre `completedAt` da própria tarefa.

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

#### Scenario: Ocorrência recorrente é concluída

- **GIVEN** uma tarefa que carrega uma regra de recorrência
- **WHEN** o usuário a conclui
- **THEN** o sistema define status `DONE` e registra `completedAt` nessa tarefa
- **AND** aplica a geração da próxima ocorrência definida em `task-recurrence`

### Requirement: Exclusão confirmada

O sistema SHALL permitir exclusão definitiva somente após confirmação explícita do usuário. Quando a tarefa excluída carregar uma regra de recorrência, a confirmação SHALL informar que a série será encerrada.

#### Scenario: Exclusão confirmada

- **WHEN** o usuário confirma a exclusão de uma tarefa
- **THEN** o sistema remove a tarefa da persistência e da listagem

#### Scenario: Exclusão cancelada

- **WHEN** o usuário cancela a confirmação de exclusão
- **THEN** a tarefa permanece inalterada

#### Scenario: Exclusão de ocorrência que carrega a regra

- **GIVEN** uma tarefa que carrega uma regra de recorrência
- **WHEN** o usuário aciona a exclusão
- **THEN** a confirmação informa que a série será encerrada antes de o usuário confirmar
