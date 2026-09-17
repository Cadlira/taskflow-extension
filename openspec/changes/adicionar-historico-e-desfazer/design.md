## Context

A motivação e o escopo estão em `proposal.md`; o comportamento está em `specs/task-trash`, `specs/task-undo` e nos deltas de `task-management` e `task-recurrence`. Este documento registra apenas como encaixar isso na arquitetura atual.

Estado atual relevante:

- As tarefas vivem numa única chave, `taskflow.tasks`, em `{ schemaVersion: 4, tasks }`. `ChromeTaskRepository` serializa as escritas da própria instância e sempre relê a coleção antes de gravar (`mutate` e `mutateConditional`). Dados incompatíveis nunca são sobrescritos.
- `TaskService.remove` chama `repository.delete` e depois `scheduler.reconcileTask(id, [])`. Não há volta.
- `TaskService.update` e `changeStatus` leem a tarefa, aplicam as regras puras e gravam. Fechar uma ocorrência recorrente grava a fechada e a próxima em um único `saveMany`, mas `TaskMutationResult` devolve apenas a tarefa fechada.
- O processamento de lembrete pelo background (`claimReminderOccurrence`) e `settleElapsedReminders` alteram `processedFor` **sem** alterar `updatedAt`.
- O popup só monta o Quick Add. Exclusão, status e edição acontecem apenas em `TaskManager.vue`, no Side Panel, que já alterna entre os modos `list` e `backup` e concentra as mensagens em `feedback`, limpas por `resetMessages()` ao abrir formulário, backup ou nova ação.
- A prévia da restauração de backup já oferece "Exportar dados atuais" (`BackupManager.vue`), o que dispensou tratar a restauração nesta Change.
- O manifest não pede `unlimitedStorage`: a cota do `storage.local` é de 10 MB.

## Goals / Non-Goals

**Goals:**

- Mover tarefa entre coleção e lixeira sempre em uma única gravação, sem estado intermediário observável.
- Descrever o desfazer como um valor puro, testável no domínio, sem histórico persistido.
- Reaproveitar o codec, as migrações e a validação de tarefas já existentes para os itens da lixeira.
- Não alterar `schemaVersion` da coleção nem `formatVersion` do backup.

**Non-Goals:**

- Mecanismo genérico de comandos, pilha de undo/redo ou barramento de eventos.
- Coordenação entre instâncias além da releitura antes de gravar que o projeto já adota.
- Limpeza da lixeira por alarme.

## Decisions

### 1. Lixeira em chave própria, não marca de exclusão na tarefa

A lixeira fica em `taskflow.trash`, fora de `taskflow.tasks`.

- **Alternativa rejeitada: `deletedAt` na `Task` (soft delete).** Exigiria filtrar tarefas excluídas em consultas, filtros, contagens, reconciliação de lembretes, captura e backup; mudaria `schemaVersion` e `formatVersion`; e levaria tarefas excluídas para o arquivo de backup, contrariando a decisão de privacidade. Um esquecimento em qualquer caminho faria uma tarefa excluída reaparecer ou disparar lembrete.
- **Com chave separada**, tudo que já lê `repository.list()` continua enxergando só tarefas vivas. O backup exclui a lixeira por construção, e `replaceAll` continua gravando só `taskflow.tasks`, o que já satisfaz "restauração de backup preserva a lixeira".

### 2. Formato da lixeira compartilha a versão e as migrações das tarefas

```
taskflow.trash = { schemaVersion: 4, items: [ { deletedAt: ISO-UTC, task: Task }, ... ] }
```

- `schemaVersion` da lixeira acompanha `CURRENT_SCHEMA_VERSION` das tarefas, e cada `task` é decodificada pelas mesmas funções de registro de `stored-task-collection.ts`, com as mesmas migrações e validações. Uma futura `schemaVersion: 5` migra as duas chaves pela mesma cadeia.
- **Alternativa rejeitada: versão independente (`schemaVersion: 1`) com codec próprio.** Duplicaria validação e obrigaria manter duas cadeias de migração para o mesmo objeto `Task`.
- Chave ausente equivale a lixeira vazia; não há migração de dados existentes.
- Envelope desconhecido, `deletedAt` inválido ou tarefa inválida tornam a lixeira incompatível: `TaskStorageError('INCOMPATIBLE_DATA')`, e nenhum caminho a sobrescreve.

### 3. Operações da lixeira no mesmo repository e na mesma fila

As operações novas ficam em uma porta própria, `TaskTrashRepository`, em `src/application/task-trash-repository.ts`, implementada pela **mesma classe** `ChromeTaskRepository`:

| Operação | Efeito, sempre em um único `storage.local.set` |
|---|---|
| `moveToTrash(id, deletedAt)` | remove de `tasks`, adiciona em `trash`, aplica retenção e limite |
| `listTrash(now)` | lê, descarta vencidos e grava somente se algo foi descartado |
| `restoreFromTrash(id, prepare)` | recusa se ausente ou se o id já existe em `tasks`; senão move de volta aplicando `prepare` |
| `deleteFromTrash(id)` / `emptyTrash()` | grava só `trash` |
| `purgeTrash(now)` | descarta vencidos; não grava se nada mudou |
| `subscribeTrash(onChange, onError)` | escuta `storage.onChanged` da chave `taskflow.trash` |

- **Por que a mesma classe:** a serialização de escritas é por instância (`pendingWrite`). Uma classe separada para a lixeira teria fila própria e poderia intercalar escritas entre as duas chaves na mesma superfície.
- **Por que uma porta separada:** mantém `TaskRepository` e seus fakes de teste intactos; só quem usa lixeira depende dela.
- **Atomicidade entre chaves:** um único `browser.storage.local.set({ 'taskflow.tasks': ..., 'taskflow.trash': ... })`. As duas chaves são lidas antes, e a gravação só acontece se ambas forem compatíveis.
- **Alternativa rejeitada:** gravar primeiro a lixeira e depois remover a tarefa. Uma falha entre as duas escritas deixaria a tarefa duplicada ou perdida.

### 4. Retenção e limite como regras puras

`src/domain/task-trash.ts` define `TRASH_RETENTION_DAYS = 30`, `TRASH_MAX_ITEMS = 100` e funções puras:

- `pruneTrash(items, now)`: remove itens com `deletedAt` anterior a `now - 30 dias`. Item com `deletedAt` no futuro (relógio ajustado) é mantido.
- `addToTrash(items, task, now)`: aplica `pruneTrash`, insere o novo item e descarta os mais antigos até 100.
- A ordenação para exibição é por `deletedAt` decrescente.

A limpeza roda em `moveToTrash`, `listTrash` e em `runtime.onInstalled` e `runtime.onStartup` no background. **Alternativa rejeitada:** alarme diário, que acordaria o service worker sem necessidade para um recurso que só importa quando a lixeira é aberta.

Custo: uma tarefa típica ocupa de 0,5 a 1 KB e uma no limite de todos os campos, cerca de 12 KB. O pior caso da lixeira fica perto de 1,2 MB, dentro da cota de 10 MB sem `unlimitedStorage`.

### 5. Desfazer descrito por um valor puro devolvido pela mutação

`src/domain/task-undo.ts` define:

```ts
type UndoPlan =
  | { kind: 'RESTORE_FROM_TRASH'; taskId: string }
  | {
      kind: 'REVERT';
      previous: Task;               // versão persistida antes da ação
      expectedUpdatedAt: string;    // updatedAt produzido pela ação
      generated?: { id: string; updatedAt: string }; // ocorrência criada pela ação
    };
```

- `TaskMutationResult` de `update` e `changeStatus` ganha `undo?: UndoPlan`; `remove` passa a devolver o plano de `RESTORE_FROM_TRASH`. Quando a ação não altera nada (`changed === task`), não há plano nem oferta.
- `previous` é a tarefa lida por `requireTask`, isto é, a versão persistida imediatamente antes da ação, e não o que a interface exibia.
- `persistTransition` passa a devolver também a ocorrência gerada, para preencher `generated`.
- Uma função pura, `revertTasks(tasks, plan, now)`, devolve a nova coleção ou o motivo da recusa (`CHANGED`, `REMOVED`, `GENERATED_CHANGED`). A tarefa revertida é `settleElapsedReminders({ ...previous, updatedAt: now }, now)`; a ocorrência gerada é removida da coleção, sem ir para a lixeira, porque desfazer a ação desfaz sua criação.
- `TaskService.undo(plan)` aplica o plano: `RESTORE_FROM_TRASH` usa `restoreFromTrash`; `REVERT` usa uma nova operação condicional sobre a coleção inteira, `revertConditionally(change)`, que executa `revertTasks` dentro de `mutateConditional`. Depois reconcilia os alarmes da tarefa revertida e remove os da ocorrência gerada.

**Alternativas rejeitadas:**

- **Guardar a ação inversa ("reabrir", "editar para X") e reexecutá-la pelos casos de uso.** Reexecutar `changeStatus` sobre uma recorrente poderia gerar outra ocorrência, e editar de volta passaria de novo pela validação do rascunho, que pode ter mudado.
- **Versão anterior persistida por tarefa.** Sobreviveria ao fechamento da superfície, mas grava a cada ação, cresce com a coleção e guarda conteúdo que o usuário substituiu, sem necessidade para um desfazer imediato.

### 6. Condição de concorrência por `updatedAt`, não por igualdade integral

O `REVERT` só é aplicado se a tarefa existe com `updatedAt === expectedUpdatedAt` e, quando houver `generated`, se a ocorrência existe com o `updatedAt` com que foi criada.

- **Por que não igualdade profunda:** o background registra `processedFor` sem alterar `updatedAt`. Com igualdade integral, qualquer lembrete disparado depois da ação bloquearia o desfazer, o que a spec proíbe.
- **Por que novo `updatedAt` ao reverter:** a reversão é uma gravação salva. Voltar ao `updatedAt` antigo faria uma oferta obsoleta de outra superfície, que espera exatamente aquele valor, ser aceita em cadeia.
- `settleElapsedReminders` na tarefa revertida cobre o lembrete processado ou vencido no intervalo, evitando notificação retroativa.
- Restaurar da lixeira, por outro lado, preserva `updatedAt`: não há condição de versão a proteger, só a ausência do identificador na coleção.

### 7. Oferta de desfazer vive na mensagem de sucesso da superfície

- A oferta é um campo opcional do `Feedback` de `TaskManager.vue`: `{ tone, text, undo?: UndoPlan }`. Como `resetMessages()` já é chamado ao abrir formulário, backup, lixeira e antes de cada ação, a oferta desaparece exatamente nos casos exigidos, sem timer e sem estado extra na store.
- A store expõe `undo(plan)`, que chama o serviço e atualiza a lista com o resultado, como as demais mutações.
- **Sem expiração por tempo:** evita o problema de limite de tempo em acessibilidade e o timer em memória, que o projeto já evita em lembretes. A oferta vale até a próxima ação, o que para uso pessoal é suficiente.
- O texto continua na região `aria-live`; o botão "Desfazer" fica imediatamente depois dela, fora da região, para não ser reanunciado e não mover o foco.
- O foco após desfazer usa as funções já existentes (`taskList.focusControl` com a ação `edit` e o fallback para a ação principal do estado).

### 8. Área da lixeira como novo modo do Side Panel

- `TaskManager.vue` ganha o modo `trash`, ao lado de `list` e `backup`, com acesso pelo cabeçalho e pelo estado de lista vazia, seguindo o padrão do backup.
- Novo `src/components/trash/TrashManager.vue`, com um serviço fornecido por `provide`/`inject` como o do backup: lista, restaurar, excluir definitivamente e esvaziar. Os dois últimos reutilizam `ConfirmDialog.vue`.
- Ao voltar à listagem depois de restaurar, a coleção já chega pela assinatura de `storage.onChanged`.

### 9. Identificador em conflito é recusado, não renumerado

Restaurar um item cujo `id` já existe na coleção, o que só acontece depois de restaurar um backup, é recusado. **Alternativa rejeitada:** gerar novo `id`, que quebraria a ligação de `seriesId`, criaria duplicatas visuais e esconderia do usuário que a tarefa já voltou por outro caminho.

### 10. Exclusão com lixeira incompatível falha

Se `taskflow.trash` não puder ser lida, `moveToTrash` falha e a tarefa permanece. **Alternativa rejeitada:** excluir definitivamente como antes, que tornaria silenciosa a perda justamente no caso em que o usuário conta com a lixeira. O caso só surge com downgrade ou corrupção, e a mensagem orienta a situação.

## Risks / Trade-offs

- **[Duas superfícies em janelas diferentes têm filas de escrita independentes]** → Mesmo risco já aceito pelo projeto: toda operação relê as chaves imediatamente antes de gravar, e o desfazer é condicional. A janela de corrida restante é a do intervalo entre leitura e `set` na mesma tarefa.
- **[Atomicidade de `storage.local.set` com duas chaves não é garantida explicitamente pela documentação]** → Na implementação do Chrome a chamada é aplicada como um único lote. Os testes do repository cobrem a gravação única, e a verificação manual inclui excluir e restaurar com as duas superfícies abertas.
- **[Cota cheia impede excluir]** → Mover para a lixeira acrescenta poucos bytes, então só falha no limite. A mensagem de erro existe e "Esvaziar lixeira" libera espaço.
- **[Downgrade para versão sem lixeira deixa `taskflow.trash` órfã com conteúdo excluído]** → A chave é ignorada pela versão anterior e retomada ao atualizar. Registrado em `docs/architecture.md` como consequência conhecida.
- **[Oferta de desfazer perdida ao fechar o Side Panel]** → Aceito: para exclusão, a lixeira cobre; para status e edição, a correção manual continua possível.
- **[Tarefa revertida com prazo e lembretes antigos pode ficar atrasada]** → Comportamento esperado: volta exatamente ao estado anterior; lembretes vencidos são marcados como processados.
- **[`persistTransition` e `TaskMutationResult` mudam de forma]** → Campos opcionais e aditivos; os consumidores atuais (store, Quick Add, captura) continuam compatíveis.

## Migration Plan

- Nenhuma migração de dados: `taskflow.tasks` e o formato de backup não mudam, e `taskflow.trash` nasce vazia na primeira exclusão.
- Rollback: reverter o código. A versão anterior ignora `taskflow.trash`; tarefas na lixeira deixam de ser acessíveis até uma nova atualização, sem afetar as tarefas vivas.
- Sem permissões novas; a validação do manifest continua igual.
