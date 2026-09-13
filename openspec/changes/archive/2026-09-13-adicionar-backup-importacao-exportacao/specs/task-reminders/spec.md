## MODIFIED Requirements

### Requirement: Reconciliação de alarmes

O sistema SHALL reconciliar alarmes com os lembretes persistidos ao instalar ou iniciar a extensão, após criar, editar, concluir, cancelar ou excluir uma tarefa e após restaurar um backup.

#### Scenario: Prazo é alterado

- **WHEN** o prazo de uma tarefa com lembretes é modificado
- **THEN** os alarmes anteriores são removidos e novos alarmes são programados para os instantes recalculados

#### Scenario: Lembrete é removido

- **WHEN** o usuário remove uma configuração de lembrete e salva
- **THEN** o alarme correspondente deixa de existir

#### Scenario: Tarefa se torna terminal

- **WHEN** uma tarefa é concluída ou cancelada
- **THEN** seus alarmes pendentes são removidos

#### Scenario: Tarefa é reaberta

- **WHEN** uma tarefa terminal volta para `TODO` ou `IN_PROGRESS`
- **THEN** lembretes futuros ainda configurados são reconciliados e voltam a ser programados

#### Scenario: Tarefa é excluída

- **WHEN** uma tarefa é excluída
- **THEN** todos os alarmes associados a ela são removidos

#### Scenario: Extensão é iniciada com alarmes ausentes

- **WHEN** existem lembretes futuros persistidos sem seus alarmes correspondentes
- **THEN** o sistema recria os alarmes ausentes

#### Scenario: Backup é restaurado

- **WHEN** um backup substitui todas as tarefas locais
- **THEN** o sistema remove os alarmes que não correspondem a lembretes pendentes das tarefas restauradas e programa os alarmes dos lembretes futuros dessas tarefas
