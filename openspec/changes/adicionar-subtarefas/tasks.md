## 1. Domínio das subtarefas

- [x] 1.1 Criar `src/domain/task-subtasks.ts` com o tipo `Subtask`, `TaskSubtaskDraft` (sem `done`), `MAX_SUBTASKS = 20` e o limite de título de 200 caracteres, adicionar `subtasks: Subtask[]` à `Task` em `src/domain/task.ts` e verificar que `npm run typecheck` aponta apenas os pontos de construção de `Task` a ajustar nas tarefas seguintes
- [x] 1.2 Implementar `validateSubtaskDrafts` (trim, título obrigatório, limite de 200, identificadores não vazios e não repetidos, limite de 20) com erros posicionais, e verificar com testes em `tests/domain/task-subtasks.test.ts` cobrindo cada erro e a normalização do título
- [x] 1.3 Implementar `buildSubtasks` gerando `id` e `done: false` para itens novos e aplicando o `done` da tarefa atual por `id` para itens existentes, e verificar com testes de renomear mantendo marcação, remover, reordenar e item marcado na tarefa atual mas exibido desmarcado no rascunho
- [x] 1.4 Implementar `setSubtaskDone` (nova instância com `updatedAt`, mesma instância quando não há mudança, `undefined` para item inexistente), `countSubtaskProgress` e `resetSubtasks`, e verificar com testes que status, `completedAt`, prazo e lembretes da tarefa não mudam

## 2. Rascunho, pesquisa e recorrência

- [x] 2.1 Adicionar `subtasks` ao `TaskDraft` e `subtaskItems` aos erros em `src/domain/task-draft.ts`; `createTask` produz `[]` sem rascunho de subtarefas e `updateTask` preserva as existentes quando o rascunho não informa o campo; verificar com testes em `tests/domain/task-draft.test.ts`, incluindo que alterar o status da tarefa não altera marcações
- [x] 2.2 Verificar com testes em `tests/domain/task-draft.test.ts` que `updateTask` usa as marcações da tarefa relida, cobrindo o cenário de marcação feita em outra superfície durante a edição
- [x] 2.3 Incluir os títulos das subtarefas em `matchesSearch` em `src/domain/task-queries.ts` e verificar com testes em `tests/domain/task-queries.test.ts` que a pesquisa encontra a tarefa pelo título do item e que filtros de status, prioridade e prazo ignoram as marcações
- [x] 2.4 Copiar as subtarefas desmarcadas e com novos identificadores em `buildNextOccurrence` (`src/domain/task-recurrence.ts`) e verificar com testes em `tests/domain/task-recurrence.test.ts` a ordem, os títulos, os novos `id` e a ocorrência fechada inalterada
- [x] 2.5 Atualizar `tests/support/task-fixtures.ts` para produzir tarefas com `subtasks: []` e verificar que a suíte de domínio existente continua passando

## 3. Persistência e esquema 4

- [x] 3.1 Elevar `CURRENT_SCHEMA_VERSION` para 4 em `src/infrastructure/storage/stored-task-collection.ts`, decodificando `subtasks` obrigatório na versão 4 e atribuindo `[]` nas versões 1 a 3, e verificar com testes em `tests/infrastructure/chrome-task-repository.test.ts` de leitura das versões 3 e 4
- [x] 3.2 Acrescentar à validação da coleção os invariantes de limite e unicidade de `id` das subtarefas e verificar com testes de que uma coleção v4 inválida é recusada como incompatível e não é sobrescrita
- [x] 3.3 Adicionar `updateTaskConditionally(id, change)` à `TaskRepository` em `src/application/task-repository.ts` e implementá-la em `src/infrastructure/chrome/chrome-task-repository.ts` sobre `mutateConditional`, e verificar com testes de gravação quando há mudança, ausência de gravação quando não há, tarefa inexistente e rejeição do armazenamento
- [x] 3.4 Atualizar o dublê de repositório em `tests/support/fakes.ts` com `updateTaskConditionally` e verificar que a suíte existente continua passando

## 4. Backup versão 4

- [x] 4.1 Estender `src/domain/task-integrity.ts` com o campo `subtasks` em `BackupField` e as regras de lista obrigatória, limite de 20, `id` não vazio e único na tarefa, título estrito e marcação booleana, descartando propriedades desconhecidas, e verificar com testes em `tests/domain/task-integrity.test.ts` por regra inválida e pelo mesmo `id` de subtarefa aceito em tarefas diferentes
- [x] 4.2 Elevar `CURRENT_BACKUP_FORMAT_VERSION` para 4 em `src/application/backup/backup-file.ts` e acrescentar a migração 3 → 4 que atribui `subtasks: []` sem alterar as migrações anteriores, e verificar com testes em `tests/application/backup-file.test.ts` de arquivos v3 e de versão superior recusada
- [x] 4.3 Criar `tests/fixtures/backups/taskflow-backup-v4.json` com tarefa sem subtarefas, tarefa com itens marcados e desmarcados e uma série, e verificar em `tests/integration/backup.test.ts` que os arquivos de referência das versões 1, 2, 3 e 4 produzem as tarefas esperadas
- [x] 4.4 Verificar com teste que a exportação gera `formatVersion` 4 e inclui as subtarefas na ordem persistida com identificador, título e marcação

## 5. Casos de uso e store

- [x] 5.1 Implementar `TaskService.setSubtaskDone(taskId, subtaskId, done)` em `src/application/task-service.ts` usando `updateTaskConditionally` e `setSubtaskDone` do domínio, com resultado discriminado para salvo, sem alteração, tarefa inexistente e subtarefa inexistente, e verificar com testes em `tests/application/task-service.test.ts` que nenhum alarme é reconciliado e que o status da tarefa não muda
- [x] 5.2 Verificar com teste em `tests/application/task-service.test.ts` que concluir uma ocorrência recorrente com subtarefas marcadas grava a ocorrência fechada com as marcações e a seguinte com itens desmarcados na mesma gravação
- [x] 5.3 Expor a ação de marcar subtarefa em `src/stores/task-store.ts` com a mesma tradução de falhas de armazenamento das demais mutações e mensagem específica para subtarefa inexistente, e verificar com testes em `tests/stores/task-store.test.ts`

## 6. Formulário

- [x] 6.1 Adicionar a seção de subtarefas ao `src/components/tasks/TaskForm.vue` entre descrição e prazo, com adicionar, renomear e remover, rótulos com posição, marcação exibida apenas como texto e envio do rascunho sem `done`, e verificar com testes em `tests/components/tasks/TaskForm.test.ts`
- [x] 6.2 Implementar "Mover para cima" e "Mover para baixo" com os limites indisponíveis na primeira e na última posição e o foco acompanhando o item movido, e verificar com testes de teclado
- [x] 6.3 Tornar "Adicionar subtarefa" indisponível no limite de 20 com mensagem associada e exibir erros por item, e verificar com teste de que o foco vai para o título da primeira subtarefa inválida conforme a ordem dos campos
- [x] 6.4 Verificar com teste que abandonar a edição após adicionar, remover ou reordenar não altera as subtarefas persistidas

## 7. Cartão da listagem

- [x] 7.1 Exibir em `src/components/tasks/TaskList.vue` o progresso textual "N de M" somente quando houver subtarefas, com rótulos em `src/components/tasks/task-labels.ts`, e verificar com testes em `tests/components/tasks/TaskList.test.ts` para tarefa ativa, concluída e sem subtarefas
- [x] 7.2 Adicionar o controle expansível com `aria-expanded` e `aria-controls`, recolhido por padrão e mantido expandido após atualização da lista, e verificar com testes que simulam atualização vinda do armazenamento
- [x] 7.3 Renderizar as caixas de marcação rotuladas pelo título e ligar a ação ao `TaskManager.vue` com estado de processamento por subtarefa (`aria-disabled`, acionamentos repetidos ignorados), e verificar com testes de marcação por Espaço, foco preservado e ausência de segunda gravação
- [x] 7.4 Tratar falha e subtarefa inexistente restaurando a marcação persistida, informando a mensagem e mantendo o foco na caixa, e verificar com testes dos dois caminhos
- [x] 7.5 Verificar com testes em `tests/components/tasks/TaskManager.test.ts` que concluir uma tarefa com subtarefas pendentes não abre diálogo e que marcar a última subtarefa não conclui a tarefa
- [x] 7.6 Verificar que `tests/styles/contrast.test.ts` cobre os novos textos e indicadores do cartão e continua passando

## 8. Validação final

- [x] 8.1 Verificar que `tests/manifest/manifest-permissions.test.ts` continua passando sem alteração e que `wxt.config.ts` e o manifest gerado não ganharam nenhuma permissão nova
- [x] 8.2 Verificar que `tests/architecture/layer-boundaries.test.ts` continua passando, confirmando que `task-subtasks.ts` não importa Vue, Pinia, WXT, infraestrutura nem APIs do Chrome
- [x] 8.3 Atualizar `docs/architecture.md` (modelo, `schemaVersion: 4`, `formatVersion: 4` e remoção de subtarefas da lista de itens futuros) e `README.md` quando descrever funcionalidades, e verificar a acentuação pt-BR dos textos alterados
- [x] 8.4 Executar `npm run validate` e confirmar que lint, typecheck, testes e build de produção passam
- [ ] 8.5 Exercitar manualmente no navegador: criar tarefa com subtarefas, reordenar, marcar pelo cartão com o formulário aberto em outra superfície, concluir tarefa com itens pendentes, concluir ocorrência recorrente com itens marcados, pesquisar por título de subtarefa e restaurar um backup da versão 3
