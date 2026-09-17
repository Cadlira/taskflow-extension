## Context

A motivação está em `proposal.md` (Why); o comportamento, em `specs/task-subtasks/spec.md` e nos deltas de `task-management`, `task-recurrence` e `task-backup`.

Estado atual relevante:

- A coleção é plana: `{ schemaVersion: 3, tasks: Task[] }` em `taskflow.tasks`, decodificada e migrada na leitura por `stored-task-collection.ts`. Não existe relação entre tarefas além de `seriesId`, que é só um rótulo.
- `ChromeTaskRepository` serializa escritas da mesma instância, relê a coleção antes de gravar e substitui a tarefa inteira por `id` (`saveMany`). Para uma alteração pontual que não pode sobrescrever dados concorrentes, já existe o precedente `claimReminderOccurrence`, que aplica uma função pura sobre a tarefa relida (`mutateConditional`).
- `updateTask` relê a tarefa (`requireTask`) no momento de salvar e reescreve todos os campos editáveis a partir do rascunho do formulário.
- `buildNextOccurrence` copia campo a campo os dados editáveis da ocorrência fechada.
- O backup tem sua própria versão (`formatVersion: 3`), cadeia de migrações em `backup-file.ts`, validação estrita em `task-integrity.ts` e arquivos de referência em `tests/fixtures/backups/`.
- As ações do cartão seguem as regras de foco, estado indisponível e falha de `interface-accessibility`; a lista é atualizada por `storage.onChanged`.

## Goals / Non-Goals

**Goals:**

- Adicionar subtarefas com um único campo novo na `Task`, sem nova entidade persistida nem relação entre registros.
- Garantir que marcar um item em uma superfície não seja desfeito por um formulário aberto em outra.
- Manter lembretes, alarmes, captura, Quick Add e manifest intocados.

**Non-Goals:**

- Qualquer mecanismo genérico de merge por campo ou controle otimista de versão da tarefa. A preservação cobre só a marcação das subtarefas; os demais campos continuam com a semântica atual de "último a salvar vence".
- Componentização genérica de "lista editável" compartilhada com o editor de lembretes.

## Decisions

### 1. Checklist embutido em vez de tarefa filha

`Task.subtasks: Subtask[]`, com `Subtask = { id: string; title: string; done: boolean }`.

- **Alternativa: `Task.parentId`.** Cada subtarefa seria uma `Task` completa. Isso obrigaria a definir o comportamento de prazo, lembretes, recorrência, filtros, ordenação e exclusão em cascata para filhas, além de integridade referencial na coleção e no backup (órfãs, ciclos, profundidade). Custo alto para um uso pessoal que só precisa de passos marcáveis.
- **Escolha:** checklist embutido. A profundidade única decorre do tipo, não de uma validação; exclusão, backup e sincronização entre superfícies funcionam por tarefa sem código novo.

`subtasks` é sempre um array, como `reminders` e `tags`, para evitar ramificações `undefined` no domínio e na UI. Não há `completedAt` por item: nenhum requisito o consome, e `TF-008`/`TF-009` poderão acrescentá-lo com migração aditiva.

### 2. Módulo de domínio `task-subtasks.ts`

Funções puras concentradas em `src/domain/task-subtasks.ts`:

- `MAX_SUBTASKS = 20` e `SUBTASK_TITLE_LIMIT = 200` (reutilizando o limite de título de `TASK_LIMITS`).
- `validateSubtaskDrafts(drafts)`: trim, título obrigatório e limite, identificadores do rascunho não vazios e não repetidos, limite de quantidade; erros posicionais em `subtaskItems`, no mesmo formato de `reminderItems`.
- `buildSubtasks(drafts, current, generateId)`: gera `id` para itens novos (`done: false`) e, para itens com `id`, usa o `done` de `current` — a tarefa relida no momento de salvar — ou `false` se o item não existir mais ali. É esse o ponto que implementa "marcações preservadas ao salvar o formulário".
- `setSubtaskDone(task, subtaskId, done, now)`: devolve a tarefa com o item alterado e `updatedAt` novo, a mesma instância quando o valor já é o pedido, ou `undefined` quando o item não existe.
- `countSubtaskProgress(subtasks)`: `{ done, total }`.
- `resetSubtasks(subtasks, generateId)`: cópia desmarcada com novos `id`, usada por `buildNextOccurrence`.

`TaskSubtaskDraft = { id?: string; title: string }` — o rascunho **não** carrega `done`. Isso torna impossível, pelo tipo, que o formulário altere marcações.

- **Alternativa:** o rascunho carregar `done` e o serviço fazer merge comparando com o estado de abertura do formulário. Exigiria guardar o snapshot original e decidir conflitos; descartada.

### 3. Marcação atômica no repositório

Nova operação da porta `TaskRepository`:

```ts
updateTaskConditionally(id: string, change: (task: Task) => Task | undefined): Promise<Task | undefined>
```

implementada em `ChromeTaskRepository` sobre o `mutateConditional` já existente: relê a coleção, aplica a função pura à tarefa atual e grava somente se ela devolver uma nova instância. `TaskService.setSubtaskDone(taskId, subtaskId, done)` usa essa operação com `setSubtaskDone` do domínio e devolve um resultado discriminado: salvo, sem alteração, tarefa inexistente ou subtarefa inexistente.

- **Alternativa: `requireTask` + `save`, como `changeStatus`.** Entre a leitura e a gravação, uma alteração da mesma instância pode ser sobrescrita pela tarefa inteira lida antes. Marcar itens em sequência rápida é o uso típico e tornaria isso frequente.
- **Alternativa: operação específica `setSubtaskDone` na porta.** Funciona, mas espalha regra de domínio no adapter; a forma genérica mantém o adapter burro e reaproveita o padrão de `claimReminderOccurrence`.

Marcar não passa por `persistTransition` nem pela reconciliação de lembretes, porque não altera status, prazo nem lembretes.

### 4. Edição no formulário e rascunho

`TaskDraft.subtasks?: readonly TaskSubtaskDraft[]`. `createTask` usa `buildSubtasks(drafts, [], generateId)`; `updateTask` usa `buildSubtasks(drafts, task.subtasks, generateId)` com a tarefa relida. Rascunhos sem `subtasks` (Quick Add, captura) produzem `[]` na criação. Na edição, a ausência de `subtasks` no rascunho preserva as existentes, para não apagar itens a partir de chamadores que não conhecem o campo.

O `TaskForm` mantém itens locais com uma chave de renderização estável (como `reminderKeyCounter`), `id` apenas para itens persistidos, botões "Mover para cima", "Mover para baixo" e "Remover" com o título e a posição no nome acessível, e a marcação exibida como texto ("Feita"/"Pendente"). O botão "Adicionar subtarefa" fica indisponível no limite, com mensagem associada. A ordem de foco do primeiro erro segue a posição dos campos no formulário; a seção de subtarefas fica depois da descrição e antes de prazo/lembretes.

### 5. Cartão: disclosure com caixas de marcação

`TaskList` exibe o progresso "N de M" em texto quando `total > 0` e um botão com `aria-expanded`/`aria-controls` ("Subtarefas, 2 de 5") que revela uma lista de `<input type="checkbox">` rotulados pelo título. O estado expandido fica em um `Set<string>` de ids de tarefas no componente: sobrevive a atualizações da lista e não é persistido.

Estado de processamento por item (`taskId:subtaskId`), independente de `busyTaskId`, para que marcar um item não bloqueie as ações do cartão nem os demais itens. Enquanto processa, a caixa usa `aria-disabled="true"` e ignora `click` com `preventDefault` — não `disabled`, que tiraria o foco. Em falha, a caixa volta ao valor persistido (a fonte continua sendo a store), a mensagem de falha existente é exibida e o foco não é movido.

- **Alternativa: lista sempre visível.** Com até 20 itens, o cartão perderia densidade na listagem. **Alternativa: marcar só pelo formulário.** Tira o principal ganho de uso.

### 6. Pesquisa

`matchesSearch` inclui `...task.subtasks.map((subtask) => subtask.title)`. Filtros, ordenação e `getDueSituation` não mudam.

### 7. Recorrência

`buildNextOccurrence` passa a incluir `subtasks: resetSubtasks(task.subtasks, context.generateId)`. A ocorrência fechada não é alterada.

- **Alternativa: copiar as marcações.** Uma nova ocorrência já parcialmente "feita" contraria o sentido de repetir o roteiro.

### 8. Persistência: `schemaVersion: 4`

- `CURRENT_SCHEMA_VERSION = 4`. Versões 1, 2 e 3 continuam decodificadas pelos caminhos atuais e recebem `subtasks: []`. Na versão 4, `subtasks` é obrigatório e decodificado com checagem estrutural (array, objeto, `id` e `title` string não vazia, `done` booleano); o invariante de unicidade de `id` e o limite entram no laço de `decodeCollection`, como os de lembretes e recorrência. Qualquer violação torna a coleção incompatível e nunca sobrescrita.
- **Alternativa: manter `schemaVersion: 3` e tratar `subtasks` ausente como `[]`.** Uma versão anterior do TaskFlow leria a coleção v3 e descartaria silenciosamente `subtasks` na primeira gravação — perda de dados. Incrementar a versão faz a versão antiga recusar em vez de sobrescrever, como nas Changes anteriores.

### 9. Backup: `formatVersion: 4`

- Migração 3 → 4 em `BACKUP_MIGRATIONS`: acrescenta `subtasks: []` a cada tarefa que seja objeto, sem tocar o restante; a validação posterior continua responsável por recusar o que for inválido.
- `task-integrity.ts` ganha o campo `subtasks` em `BackupField` e as regras da spec, coletando todos os problemas; propriedades desconhecidas nos itens são descartadas.
- Novo `tests/fixtures/backups/taskflow-backup-v4.json` com tarefa sem subtarefas, com itens marcados e desmarcados, e uma série.

## Risks / Trade-offs

- [Formulário salvo sobrescreve títulos ou remoções feitas em outra superfície durante a edição] → Aceito: é a semântica atual para todos os campos editáveis; somente a marcação, que é alterável fora do formulário, é preservada.
- [Item removido no formulário enquanto foi marcado em outra superfície] → A remoção prevalece; comportamento coerente com "o formulário define o conjunto de itens".
- [Dados v4 abertos por uma versão antiga do TaskFlow] → A versão antiga recusa a coleção como incompatível e não grava; mesmo tratamento de `schemaVersion: 3`.
- [Densidade do cartão] → Lista recolhida por padrão; só o progresso textual ocupa espaço.
- [Rodar a migração v3 → v4 em tarefas malformadas] → A migração não valida nem corrige; a validação de `task-integrity` continua recusando o arquivo inteiro.
- [Caixa com `aria-disabled` ainda recebe `change` nativo] → Tratar em `click` com `preventDefault` e cobrir com teste de acionamento repetido.

## Migration Plan

1. A primeira leitura de uma coleção v1–v3 após a atualização produz tarefas com `subtasks: []`; a primeira gravação persiste `schemaVersion: 4`. Não há escrita forçada na instalação.
2. Backups v1–v3 continuam restauráveis pela cadeia de migrações; novos backups são v4.
3. Rollback: uma versão anterior da extensão recusa a coleção v4 sem sobrescrevê-la. Para voltar, o usuário restaura um backup exportado antes da atualização; o caminho de exportação v4 → versão antiga não é suportado.
