## 1. Domínio da lixeira e do desfazer

- [x] 1.1 Criar `src/domain/task-trash.ts` com o tipo `TrashItem` (`deletedAt`, `task`), `TRASH_RETENTION_DAYS = 30`, `TRASH_MAX_ITEMS = 100`, `pruneTrash`, `addToTrash` e a ordenação por exclusão mais recente, e verificar com testes em `tests/domain/task-trash.test.ts` cobrindo item com 29 e 31 dias, `deletedAt` no futuro, inserção com 100 itens descartando o mais antigo e ordem de exibição
- [x] 1.2 Criar `src/domain/task-undo.ts` com `UndoPlan` (`RESTORE_FROM_TRASH` e `REVERT` com `previous`, `expectedUpdatedAt` e `generated` opcional) e a função pura `revertTasks(tasks, plan, now)`, e verificar com testes em `tests/domain/task-undo.test.ts` de reversão aplicada com novo `updatedAt`, ocorrência gerada removida, recusas `CHANGED`, `REMOVED` e `GENERATED_CHANGED` sem alterar a coleção, e `processedFor` alterado sem mudança de `updatedAt` não bloqueando
- [x] 1.3 Verificar com teste em `tests/domain/task-undo.test.ts` que a tarefa revertida passa por `settleElapsedReminders`, marcando como processado o lembrete vencido entre a ação e o desfazer e mantendo pendente o lembrete futuro

## 2. Persistência da lixeira

- [x] 2.1 Criar o codec de `taskflow.trash` em `src/infrastructure/storage/` com envelope `{ schemaVersion, items }` que reutiliza a decodificação, as migrações e a validação de registros de `stored-task-collection.ts`, tratando chave ausente como lixeira vazia, e verificar com testes de leitura válida, envelope desconhecido, `deletedAt` inválido e tarefa inválida recusados como `INCOMPATIBLE_DATA`
- [x] 2.2 Criar a porta `TaskTrashRepository` em `src/application/task-trash-repository.ts` com `moveToTrash`, `listTrash`, `restoreFromTrash`, `deleteFromTrash`, `emptyTrash`, `purgeTrash` e `subscribeTrash`, e verificar com `npm run typecheck` e com `tests/architecture/layer-boundaries.test.ts` que a porta não importa infraestrutura
- [x] 2.3 Implementar `moveToTrash(id, deletedAt)` em `ChromeTaskRepository` sobre a fila existente, lendo as duas chaves e gravando ambas em um único `storage.local.set` com retenção e limite aplicados, e verificar com testes em `tests/infrastructure/chrome-task-repository.test.ts` de gravação única, tarefa inexistente, rejeição do armazenamento sem alterar nenhuma chave, lixeira incompatível sem gravar e coleção incompatível sem gravar
- [x] 2.4 Implementar `restoreFromTrash(id, prepare)` com resultados discriminados para restaurado, ausente na lixeira e identificador já existente, e verificar com testes de gravação única, `prepare` aplicado à tarefa devolvida, recusa sem gravar nos dois casos e rejeição do armazenamento
- [x] 2.5 Implementar `listTrash(now)` e `purgeTrash(now)` gravando somente quando algum item vencido foi descartado, além de `deleteFromTrash`, `emptyTrash` e `subscribeTrash` restrito à chave `taskflow.trash`, e verificar com testes de ausência de gravação sem vencidos, remoção de um item, esvaziamento e notificação apenas para a chave da lixeira
- [x] 2.6 Adicionar `revertConditionally(change)` à `TaskRepository` e implementá-la sobre `mutateConditional` aplicando a coleção inteira devolvida ou nenhuma gravação, e verificar com testes de aplicação, recusa sem gravação e rejeição do armazenamento
- [x] 2.7 Atualizar `tests/support/fakes.ts` com as novas operações e verificar que a suíte existente continua passando

## 3. Casos de uso

- [x] 3.1 Fazer `persistTransition` em `src/application/task-service.ts` devolver também a ocorrência gerada e acrescentar `undo?: UndoPlan` a `TaskMutationResult` em `update` e `changeStatus`, sem plano quando a ação não altera a tarefa, e verificar com testes em `tests/application/task-service.test.ts` para status simples, edição, conclusão recorrente, pular ocorrência e encerrar série
- [x] 3.2 Alterar `TaskService.remove` para usar `moveToTrash` com o instante do relógio, reconciliar os alarmes da tarefa para vazio e devolver o plano `RESTORE_FROM_TRASH`, e verificar com testes de alarmes removidos e de falha de gravação sem reconciliação
- [x] 3.3 Implementar `TaskService.restoreFromTrash(id)` aplicando `settleElapsedReminders` no `prepare` e reconciliando os alarmes da tarefa restaurada com indicação de lembretes pendentes, e verificar com testes de lembrete vencido processado sem notificação, lembrete futuro agendado, recusas por ausência e por identificador existente e falha de agendamento sem desfazer a restauração
- [x] 3.4 Implementar `TaskService.undo(plan)` delegando `RESTORE_FROM_TRASH` à restauração e `REVERT` a `revertConditionally` com `revertTasks`, reconciliando os alarmes da tarefa revertida e removendo os da ocorrência gerada, e verificar com testes de desfazer conclusão recorrente, desfazer encerramento da série, recusa por alteração concorrente sem gravação e falha de agendamento informada como pendente
- [x] 3.5 Expor listagem, exclusão definitiva, esvaziamento e assinatura da lixeira em um serviço composto em `src/composition/` (seguindo `chrome-backup-service.ts`) e verificar com teste que a composição usa a mesma instância de `ChromeTaskRepository` para tarefas e lixeira

## 4. Background

- [x] 4.1 Chamar `purgeTrash` em `runtime.onInstalled` e `runtime.onStartup` em `src/entrypoints/background.ts`, registrando falha com mensagem fixa sem conteúdo de tarefas, e verificar com testes em `tests/entrypoints/` que a limpeza é acionada nos dois eventos, que nenhum alarme novo é criado e que o log de falha não contém títulos

## 5. Store e desfazer na listagem

- [x] 5.1 Propagar o `UndoPlan` pelos resultados de `update`, `changeStatus` e `remove` em `src/stores/task-store.ts` e adicionar `undo(plan)` com a mesma tradução de falhas das demais mutações e mensagens específicas para tarefa alterada, removida e ausente da lixeira, e verificar com testes em `tests/stores/task-store.test.ts`
- [x] 5.2 Acrescentar `undo` opcional ao `Feedback` de `src/components/tasks/TaskManager.vue`, apresentando "Desfazer" logo após a região `aria-live` depois de excluir, alterar status (ações rápidas, seletor e diálogo de pular ou encerrar) e salvar edição, e verificar com testes em `tests/components/tasks/TaskManager.test.ts` de presença da oferta nesses casos e ausência ao criar tarefa e marcar subtarefa
- [x] 5.3 Verificar com testes que a oferta é substituída pela ação seguinte, some ao abrir formulário, backup ou lixeira, não expira com o avanço do relógio simulado e que sua apresentação não move o foco em relação às regras de foco após ações da listagem
- [x] 5.4 Implementar o acionamento de "Desfazer" com estado de processamento (`aria-disabled`, acionamentos repetidos ignorados), anúncio do resultado e foco na ação "Editar" do cartão visível ou na ação principal do estado apresentado, e verificar com testes de sucesso, cartão oculto por filtro, recusa por alteração concorrente e falha de gravação
- [x] 5.5 Atualizar o texto da confirmação de exclusão para informar a lixeira e os 30 dias, mantendo o aviso de encerramento da série, e a mensagem de sucesso para "movida para a lixeira", e verificar com testes para tarefa comum e ocorrência que carrega a regra

## 6. Área da lixeira

- [x] 6.1 Adicionar o modo `trash` ao `TaskManager.vue` com acesso pelo cabeçalho e pelo estado de lista vazia e retorno à listagem, e verificar com testes de navegação e de que abrir a lixeira limpa mensagens e oferta de desfazer
- [x] 6.2 Criar `src/components/trash/TrashManager.vue` listando itens do mais recente para o mais antigo com título e data local da exclusão, estado vazio com o prazo de 30 dias, estado de lixeira incompatível sem ações e atualização por assinatura, e verificar com testes em `tests/components/trash/TrashManager.test.ts`
- [x] 6.3 Implementar "Restaurar" com mensagens de sucesso, recusa por identificador existente, lembretes pendentes e falha, e verificar com testes de cada caminho e de que o item permanece na lixeira nas recusas
- [x] 6.4 Implementar "Excluir definitivamente" e "Esvaziar lixeira" com `ConfirmDialog.vue` informando que não podem ser desfeitos, e verificar com testes de confirmação, abandono com foco de volta ao controle de origem e estado vazio após esvaziar
- [x] 6.5 Implementar o foco após restaurar ou excluir definitivamente (ação "Restaurar" do item na mesma posição, do novo último item ou ação de voltar à listagem), e verificar com testes de teclado para item do meio, último item e item único
- [x] 6.6 Verificar que `tests/styles/contrast.test.ts` cobre os textos e indicadores da área da lixeira e do botão "Desfazer" e continua passando

## 7. Integração com backup e privacidade

- [x] 7.1 Verificar com testes em `tests/integration/backup.test.ts` que a exportação com itens na lixeira não inclui nenhum item nem a chave `taskflow.trash`, e que restaurar um backup mantém a lixeira com os mesmos itens
- [x] 7.2 Verificar com teste de integração que, após restaurar um backup contendo uma tarefa com o mesmo identificador de um item da lixeira, restaurar esse item é recusado e a tarefa restaurada pelo backup permanece inalterada
- [x] 7.3 Verificar com teste de integração a série recorrente: excluir a ocorrência que carrega a regra, restaurá-la da lixeira sem gerar ocorrência e concluí-la gerando a próxima

## 8. Validação final

- [x] 8.1 Verificar que `tests/manifest/manifest-permissions.test.ts` continua passando sem alteração e que `wxt.config.ts` e o manifest gerado não ganharam nenhuma permissão nova, inclusive `unlimitedStorage`
- [x] 8.2 Verificar que `tests/architecture/layer-boundaries.test.ts` continua passando, confirmando que `task-trash.ts`, `task-undo.ts` e a nova porta não importam Vue, Pinia, WXT, infraestrutura nem APIs do Chrome
- [x] 8.3 Atualizar `docs/architecture.md` (chave `taskflow.trash`, atomicidade entre chaves, limpeza sem alarme, desfazer em memória condicionado por `updatedAt` e consequência de downgrade) e `README.md` quando descrever funcionalidades, e verificar a acentuação pt-BR dos textos alterados
- [x] 8.4 Atualizar `docs/roadmap.md` com status, data de início e prompt da `TF-008`, e verificar a coerência da tabela e da seção da Change
- [x] 8.5 Executar `npm run validate` e confirmar que lint, typecheck, testes e build de produção passam
- [x] 8.6 Exercitar manualmente no navegador: excluir e desfazer, excluir com dois Side Panels abertos e restaurar pela lixeira no outro, concluir ocorrência recorrente e desfazer, editar e desfazer após editar a mesma tarefa em outra superfície, deixar um lembrete vencer com a tarefa na lixeira e restaurá-la, esvaziar a lixeira e restaurar um backup com itens na lixeira
