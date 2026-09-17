## Why

Muitas tarefas do TaskFlow são, na prática, pequenos roteiros: "preparar a reunião" envolve reservar a sala, enviar a pauta e revisar os números. Hoje esses passos só cabem na descrição, sem marcação, sem progresso e sem garantia de que foram lembrados. O usuário acaba criando várias tarefas soltas e perde a relação entre elas, ou mantém uma lista em texto livre que não reflete o que já foi feito.

A `TF-001` estabilizou o modelo de tarefa e a `TF-006` provou que é possível estendê-lo sem quebrar lembretes, backup ou persistência. Esta é a hora de oferecer passos marcáveis dentro de uma tarefa, **sem** transformar o TaskFlow em uma árvore de tarefas.

## What Changes

- Cada tarefa passa a ter uma lista opcional de **subtarefas**: itens simples com título e marcação de feito. Uma tarefa sem subtarefas continua exatamente como hoje.
- **Um nível apenas, por construção.** Uma subtarefa não tem status, prioridade, prazo, lembretes, recorrência, tags nem subtarefas próprias. Ela não é uma tarefa, e por isso não aparece sozinha na listagem, não recebe alertas de atraso e não agenda notificações.
- **Tarefa e subtarefas são independentes.** Concluir, cancelar ou reabrir a tarefa não altera as marcações; marcar todas as subtarefas não conclui a tarefa. Nada é bloqueado e nenhum diálogo novo é exigido.
- **Ordem manual.** Os itens aparecem na ordem em que foram definidos; novos itens entram no fim e podem ser movidos para cima ou para baixo no formulário, sem arrastar e soltar. Marcar um item não muda sua posição.
- **Progresso calculado**, nunca gravado: o cartão mostra quantos itens estão feitos do total (por exemplo, "2 de 5") quando a tarefa tem subtarefas.
- **Edição em dois lugares com papéis distintos:** o formulário do Side Panel cria, renomeia, remove e reordena os itens; o cartão da listagem permite apenas marcar e desmarcar, em uma lista expansível.
- **Marcações não se perdem entre superfícies:** salvar o formulário preserva o estado de feito mais recente de cada item existente, mesmo que ele tenha sido marcado em outra superfície enquanto o formulário estava aberto.
- **Pesquisa** passa a encontrar a tarefa pelo título de suas subtarefas. Filtros, ordenação e sinalização de prazo continuam considerando somente a tarefa.
- **Recorrência:** a próxima ocorrência copia as subtarefas da ocorrência fechada, com novos identificadores e todas desmarcadas.
- Limites: até **20** subtarefas por tarefa, cada título com até **200** caracteres após remoção de espaços nas extremidades.
- **BREAKING** — o armazenamento passa a `schemaVersion: 4` e o backup a `formatVersion: 4`, com migração aditiva (tarefas existentes ficam com a lista vazia). Como nas versões anteriores, uma versão mais antiga do TaskFlow recusa os dados novos em vez de sobrescrevê-los.
- **Nenhuma permissão nova no manifest.**

## Non-Goals

Ficam explicitamente fora desta Change:

- Subtarefas aninhadas (mais de um nível) ou subtarefas como tarefas completas com `parentId`.
- Status, prazo, prioridade, responsável, lembretes ou recorrência próprios de uma subtarefa.
- Conclusão automática da tarefa ao marcar o último item, conclusão em cascata dos itens ou bloqueio/confirmação ao concluir a tarefa com itens pendentes.
- Converter uma subtarefa em tarefa, ou uma tarefa em subtarefa de outra.
- Arrastar e soltar para reordenar.
- Adicionar subtarefas pelo Quick Add do popup ou pela captura de página.
- Filtro ou ordenação por progresso ("com itens pendentes") e percentual persistido.
- Data de conclusão individual de cada item, histórico de marcações ou desfazer — pertencem à `TF-008`.
- Métricas de progresso agregadas — pertencem à `TF-009`.
- Geração de subtarefas por IA — pertence à `TF-011`.

## Capabilities

### New Capabilities

- `task-subtasks`: modelo e limites da lista de subtarefas; profundidade única; independência em relação ao status da tarefa; ordem manual; progresso calculado; edição no formulário; marcação pelo cartão com lista expansível acessível; preservação das marcações ao salvar o formulário.

### Modified Capabilities

- `task-management`: o modelo de tarefa ganha o campo `subtasks`; a pesquisa textual passa a considerar o título das subtarefas.
- `task-recurrence`: a geração da próxima ocorrência passa a copiar as subtarefas desmarcadas e com novos identificadores.
- `task-backup`: o formato passa a `formatVersion: 4`, com migração da versão 3, arquivo de referência da versão 4 e validação estrita das subtarefas.

## Impact

**Domínio e aplicação**

- Novo `src/domain/task-subtasks.ts`: tipo `Subtask`, limites, validação de rascunho, construção preservando marcações por `id`, marcação individual e cálculo de progresso.
- `src/domain/task.ts`: campo `subtasks` na `Task`.
- `src/domain/task-draft.ts`: subtarefas no `TaskDraft`, erros de campo e construção na criação e na edição.
- `src/domain/task-queries.ts`: `matchesSearch` considera títulos das subtarefas.
- `src/domain/task-recurrence.ts`: `buildNextOccurrence` copia as subtarefas desmarcadas.
- `src/domain/task-integrity.ts`: validação estrita de `subtasks` em tarefas restauradas.
- `src/application/task-service.ts`: caso de uso para marcar ou desmarcar uma subtarefa.

**Persistência**

- `src/infrastructure/storage/stored-task-collection.ts`: `schemaVersion: 4` e migração aditiva das versões 1 a 3.
- `src/application/backup/backup-file.ts`: `formatVersion: 4` e migração na cadeia existente; novo `tests/fixtures/backups/taskflow-backup-v4.json`.

**Interface**

- `src/components/tasks/TaskForm.vue`: editor da lista de subtarefas (adicionar, renomear, remover, mover).
- `src/components/tasks/TaskList.vue` e `src/components/tasks/task-labels.ts`: progresso e lista expansível com caixas de marcação no cartão.
- `src/stores/task-store.ts` e `src/components/tasks/TaskManager.vue`: ação de marcar subtarefa com o mesmo tratamento de processamento e falha das ações do cartão.

**Sem impacto**

`src/domain/task-reminders.ts`, `src/application/reminder-service.ts`, os adapters do Chrome de lembretes e captura, `src/components/quick-add/QuickAdd.vue` e o `manifest` não mudam. Tarefas criadas pelo Quick Add e pela captura recebem a lista vazia pelo caminho comum de criação.
