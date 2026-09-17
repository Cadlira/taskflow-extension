## Why

Hoje duas ações comuns do TaskFlow não têm volta. A exclusão, mesmo confirmada, remove a tarefa para sempre. Concluir, cancelar ou editar por engano só se corrige à mão, e numa tarefa recorrente o engano ainda cria uma ocorrência nova que precisa ser apagada. Para uso pessoal, o risco real é o clique errado e a exclusão arrependida, não a falta de auditoria. A proteção deve ser proporcional a isso: sem event sourcing, sem histórico por campo e sem gastar a cota de 10 MB do `storage.local`.

## What Changes

- **Lixeira local.** Excluir uma tarefa, ainda após o diálogo de confirmação, passa a movê-la para a lixeira em vez de apagá-la. A lixeira fica numa chave própria do armazenamento local, guarda cada item por **30 dias** e no máximo **100 itens**, e descarta primeiro os mais antigos.
- **Área "Lixeira" no Side Panel.** Lista as tarefas excluídas com a data de exclusão e oferece **Restaurar**, **Excluir definitivamente** e **Esvaziar lixeira**. As duas últimas pedem confirmação.
- **Restaurar da lixeira** devolve a tarefa com o mesmo identificador, campos e subtarefas. Lembretes vencidos nesse intervalo são marcados como processados, sem notificação retroativa, e os alarmes são reconciliados. A restauração é recusada se já existir tarefa com o mesmo identificador.
- **Desfazer a última ação.** Depois de **excluir**, **alterar o status** (incluindo concluir, cancelar, pular ou encerrar uma série) ou **salvar uma edição**, a mensagem de sucesso no Side Panel passa a oferecer "Desfazer". A oferta vale para a última ação da superfície e existe só em memória.
- **Desfazer é seguro diante de concorrência.** Só é aplicado se a tarefa ainda estiver na versão produzida pela ação. Se ela foi alterada ou removida em outro lugar, o sistema recusa e informa, sem sobrescrever nada.
- **Desfazer em série recorrente** devolve a regra à ocorrência fechada e remove, na mesma gravação, a ocorrência gerada pela ação, desde que ela não tenha sido alterada. Caso contrário, o desfazer inteiro é recusado.
- **Privacidade.** A lixeira não entra no arquivo de backup, não é alterada pela restauração de backup e nunca aparece em logs.
- A confirmação de exclusão continua existindo e passa a informar que a tarefa irá para a lixeira.
- **Sem BREAKING.** `taskflow.tasks` permanece em `schemaVersion: 4` e o backup em `formatVersion: 4`. A lixeira nasce com formato próprio versionado.
- **Nenhuma permissão nova no manifest.**

## Non-Goals

Ficam explicitamente fora desta Change:

- Histórico por campo, linha do tempo da tarefa ou trilha de auditoria.
- Refazer, pilha de vários desfazeres ou desfazer ações de outra superfície.
- Desfazer criação de tarefa, marcação de subtarefa, captura de página ou processamento de lembrete pelo background.
- Desfazer a restauração de backup ou guardar uma cópia da coleção antes de restaurar. A prévia já oferece "Exportar dados atuais", o que foi considerado proteção suficiente.
- Desfazer ou lixeira no popup, que continua dedicado ao Quick Add.
- Incluir a lixeira no backup, sincronizá-la ou exportá-la.
- Alarme ou despertar periódico para limpar a lixeira.
- Configuração de retenção pelo usuário.
- Remover o diálogo de confirmação de exclusão.

## Capabilities

### New Capabilities

- `task-trash`: lixeira local das tarefas excluídas, com retenção de 30 dias e limite de 100 itens; área da lixeira no Side Panel; restauração com reconciliação de lembretes e recusa diante de identificador existente; exclusão definitiva e esvaziamento com confirmação; isolamento em relação ao backup; proteção contra dados incompatíveis.
- `task-undo`: oferta de desfazer a última exclusão, alteração de status ou edição salva no Side Panel; validade da oferta; aplicação condicional sobre a versão persistida; reversão atômica da ocorrência gerada em séries recorrentes; tratamento de lembretes e foco após desfazer.

### Modified Capabilities

- `task-management`: a exclusão confirmada deixa de ser definitiva e passa a mover a tarefa para a lixeira. A confirmação informa esse destino e, para a ocorrência que carrega a regra, continua informando que a série será encerrada.
- `task-recurrence`: excluir a ocorrência que carrega a regra continua encerrando a série, mas restaurá-la da lixeira ou desfazer a exclusão devolve a tarefa com a regra, retomando a série.

## Impact

**Domínio e aplicação**

- Novo `src/domain/task-trash.ts`: item da lixeira, regras puras de retenção (30 dias), limite (100 itens) e ordem de descarte.
- Novo `src/domain/task-undo.ts`: descrição pura do que desfazer (versões anteriores, ocorrência gerada a remover e versões esperadas) e verificação das condições.
- `src/application/task-service.ts`: exclusão para a lixeira, resultado das mutações com a informação para desfazer, operação de desfazer, restauração, exclusão definitiva e esvaziamento da lixeira.
- `src/application/task-repository.ts` e `src/infrastructure/chrome/chrome-task-repository.ts`: operações atômicas sobre tarefas e lixeira na mesma gravação (`storage.local.set` com as duas chaves) e reversão condicional.
- `src/infrastructure/storage/`: novo codec da chave `taskflow.trash`, com versão própria e validação por `task-integrity`.
- `src/entrypoints/background.ts`: limpeza dos itens vencidos da lixeira na instalação e na inicialização, sem alarme novo.

**Interface**

- `src/stores/task-store.ts`: oferta de desfazer em memória por superfície.
- `src/components/tasks/TaskManager.vue`: ação "Desfazer" junto à mensagem de sucesso, texto da confirmação de exclusão e acesso à lixeira.
- Novo `src/components/trash/`: área da lixeira com restaurar, excluir definitivamente e esvaziar.

**Sem impacto**

`src/application/backup/`, o formato do backup, `src/domain/task-reminders.ts`, o popup e o Quick Add não mudam. A lixeira fica fora do backup porque o arquivo é montado a partir de `repository.list()`, e a restauração não grava chaves que não sejam tarefas.

**Documentação**

`docs/architecture.md` e `docs/roadmap.md` passam a registrar a lixeira, o desfazer e o andamento da `TF-008`.

**Permissões**

Nenhuma alteração no `manifest`.
