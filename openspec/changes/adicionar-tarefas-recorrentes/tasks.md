## 1. Domínio da recorrência

- [x] 1.1 Criar `src/domain/task-recurrence.ts` com os tipos `Recurrence`, `RecurrenceFrequency` e os limites da regra, e verificar que `npm run typecheck` passa
- [x] 1.2 Implementar a validação da regra (frequência, intervalo de 1 a 365, de um a sete dias da semana distintos, dia do mês de 1 a 31, `until` representável) e verificar com testes em `tests/domain/task-recurrence.test.ts` cobrindo cada limite inválido
- [x] 1.3 Implementar o passo civil local de cada frequência preservando a hora local do dia, com ajuste do dia do mês para o último dia quando ele não existir, e verificar com testes de 31 de janeiro para fevereiro e de fevereiro para 31 de março
- [x] 1.4 Implementar o cálculo da próxima ocorrência ancorado em `anchorAt ?? dueAt`, com avanço repetido enquanto o instante não for futuro e encerramento quando ultrapassar `until`, e verificar com testes de conclusão atrasada, de dez dias perdidos e de limite atingido
- [x] 1.5 Cobrir o comportamento de horário de verão com testes em fuso que o pratica: hora local preservada entre ocorrências e hora local inexistente que não descarta nem duplica a ocorrência
- [x] 1.6 Implementar a construção da próxima ocorrência (novo `id`, `TODO`, sem `completedAt`, mesmo `seriesId`, regra transferida, campos editáveis copiados, lembretes por deslocamento com identificadores próprios e sem `processedFor`) e verificar com testes que comparam a tarefa gerada com a fechada

## 2. Modelo de tarefa e validação de rascunho

- [x] 2.1 Adicionar `seriesId` e `recurrence` à `Task` em `src/domain/task.ts` e verificar que `npm run typecheck` passa sem alterar chamadas existentes
- [x] 2.2 Adicionar a recorrência ao `TaskDraft` e ao campo de erros em `src/domain/task-draft.ts`, atribuindo `seriesId` na primeira vez que uma regra válida é salva, e verificar com testes em `tests/domain/task-draft.test.ts`
- [x] 2.3 Implementar a exigência de prazo para recorrência e a recusa mútua entre recorrência e lembrete de instante absoluto, nos dois sentidos, e verificar com testes que cobrem as duas mensagens de erro
- [x] 2.4 Implementar a preservação de `anchorAt` quando o prazo de uma ocorrência é alterado isoladamente e sua ausência quando o instante agendado coincide com `dueAt`, e verificar com testes de adiamento pontual seguido de cálculo da próxima ocorrência
- [x] 2.5 Implementar o encerramento da série removendo a regra e preservando `seriesId`, e verificar com teste de que a tarefa permanece íntegra e não gera ocorrência ao ser fechada

## 3. Persistência e esquema 3

- [x] 3.1 Elevar `CURRENT_SCHEMA_VERSION` para 3 em `src/infrastructure/storage/stored-task-collection.ts`, com decoder estrito de `seriesId` e `recurrence` e migração aditiva da versão 2, e verificar com testes em `tests/infrastructure/chrome-task-repository.test.ts` de leitura da versão 2 e da versão 3
- [x] 3.2 Manter a recusa íntegra de versões desconhecidas e de registros incompatíveis, e verificar com teste de que dados de versão superior não são sobrescritos
- [x] 3.3 Adicionar `saveMany(tasks)` à `TaskRepository` em `src/application/task-repository.ts` e implementá-la em `src/infrastructure/chrome/chrome-task-repository.ts` como leitura, aplicação das tarefas e gravação única, e verificar com teste de que uma rejeição do armazenamento não persiste nenhuma das tarefas
- [x] 3.4 Atualizar os dublês de repositório em `tests/support/fakes.ts` para cobrir `saveMany` e verificar que a suíte existente continua passando

## 4. Backup versão 3

- [x] 4.1 Estender a validação estrita de tarefa persistida em `src/domain/task-integrity.ts` com `seriesId` e recorrência, incluindo a exigência de prazo e de `seriesId` e a proibição de lembrete absoluto na mesma tarefa, e verificar com testes em `tests/domain/task-integrity.test.ts` por campo inválido
- [x] 4.2 Verificar com teste que um arquivo com duas tarefas ativas do mesmo `seriesId`, apenas uma carregando a regra, é aceito
- [x] 4.3 Elevar `CURRENT_BACKUP_FORMAT_VERSION` para 3 em `src/application/backup/backup-file.ts` e acrescentar a migração da versão 2 à cadeia sem alterar as anteriores, e verificar com testes em `tests/application/backup-file.test.ts`
- [x] 4.4 Criar `tests/fixtures/backups/taskflow-backup-v3.json` com ao menos uma série e verificar, em `tests/integration/backup.test.ts`, que os arquivos de referência das versões 1, 2 e 3 continuam produzindo as tarefas esperadas
- [x] 4.5 Verificar com teste que a exportação inclui `seriesId` e a regra completa da ocorrência que a carrega, e que arquivos de versão superior continuam recusados

## 5. Geração da próxima ocorrência

- [x] 5.1 Implementar em `src/application/task-service.ts` a geração ao concluir a ocorrência que carrega a regra, usando `saveMany` para fechar a ocorrência e criar a seguinte em uma única gravação, e verificar com testes em `tests/application/task-service.test.ts`
- [x] 5.2 Implementar a distinção entre pular e encerrar ao cancelar, garantindo que pular gera a próxima e encerrar remove a regra sem gerar, e verificar com testes dos dois caminhos
- [x] 5.3 Garantir que reabrir uma ocorrência terminal não devolve a regra nem gera ocorrência, e verificar com teste de série cuja ocorrência seguinte já existe
- [x] 5.4 Garantir que a reconciliação de lembretes da nova ocorrência ocorre pelo caminho existente de `persist`, sem alterar `task-reminders.ts`, `reminder-service.ts` nem `chrome-reminder-scheduler.ts`, e verificar com teste de que os alarmes da nova ocorrência são planejados e os da fechada removidos
- [x] 5.5 Verificar com teste que um lembrete copiado cujo instante efetivo já passou é registrado como processado, sem notificação retroativa
- [x] 5.6 Verificar com teste que a falha da gravação da transição não persiste nem o fechamento nem a nova ocorrência e sinaliza a falha

## 6. Diálogo de confirmação com múltiplas ações

- [x] 6.1 Generalizar `src/components/ConfirmDialog.vue` para aceitar uma lista de ações além de abandonar, mantendo `role="alertdialog"`, foco inicial em abandonar, Escape e restauração de foco, e verificar com testes em `tests/components/ConfirmDialog.test.ts`
- [x] 6.2 Cobrir com testes a circulação de foco por Tab e Shift+Tab sobre três ações e a inércia do Escape durante o processamento
- [x] 6.3 Verificar que `BackupManager.vue` e o diálogo de exclusão de `TaskManager.vue` continuam funcionando sem alteração de comportamento, com as suítes existentes passando

## 7. Interface da recorrência

- [x] 7.1 Adicionar ao `src/components/tasks/TaskForm.vue` o editor da regra (frequência, parâmetros por frequência e limite opcional), com rótulos e erros por campo, e verificar com testes em `tests/components/tasks/TaskForm.test.ts`
- [x] 7.2 Adicionar a ação de encerrar a série no formulário da ocorrência que carrega a regra e verificar com teste de que a tarefa permanece e a regra é removida
- [x] 7.3 Apresentar a mensagem de erro específica quando a recorrência é combinada com lembrete de instante absoluto e verificar que o foco vai para o primeiro campo inválido conforme `interface-accessibility`
- [x] 7.4 Indicar tarefa recorrente no cartão em `src/components/tasks/TaskList.vue` e `src/components/tasks/task-labels.ts`, e verificar com teste em `tests/components/tasks/TaskList.test.ts` que a indicação é textual e não depende apenas de cor
- [x] 7.5 Informar na confirmação de exclusão que a série será encerrada, quando a tarefa carregar a regra, e verificar com teste em `tests/components/tasks/TaskManager.test.ts`

## 8. Cancelamento com confirmação nos dois caminhos

- [ ] 8.1 Implementar em `TaskManager.vue` a confirmação de pular ou encerrar acionada pelo botão "Cancelar tarefa" e verificar com testes dos três desfechos: pular, encerrar e abandonar
- [ ] 8.2 Implementar a mesma confirmação acionada pelo seletor de status por Enter e por ponteiro, sem persistir antes da escolha, e verificar com testes de ambos os acionamentos
- [ ] 8.3 Implementar a regra de que sair do seletor não aplica o cancelamento recorrente e restaura o status persistido sem gravar, e verificar com teste do caminho de `blur`
- [ ] 8.4 Garantir que abandonar a confirmação devolve o foco ao controle acionado, seletor ou botão, e verificar com testes de foco em ambos os caminhos
- [ ] 8.5 Verificar com testes que Enter, `blur`, Escape e escolha por ponteiro do seletor permanecem inalterados para tarefas sem recorrência
- [ ] 8.6 Implementar em `TaskForm.vue` a confirmação de pular ou encerrar ao salvar com status `Cancelada` em ocorrência que carrega a regra, e verificar com testes dos três desfechos: pular, encerrar e abandonar

## 9. Validação final

- [ ] 9.1 Verificar que `tests/manifest/manifest-permissions.test.ts` continua passando sem alteração e que `wxt.config.ts` e o manifest gerado não ganharam nenhuma permissão nova
- [ ] 9.2 Verificar que `tests/architecture/layer-boundaries.test.ts` continua passando, confirmando que `task-recurrence.ts` não importa Vue, Pinia, WXT, infraestrutura nem APIs do Chrome
- [ ] 9.3 Executar `npm run validate` e confirmar que lint, typecheck, testes e build de produção passam
- [ ] 9.4 Exercitar manualmente no navegador uma série diária, uma semanal com dois dias e uma mensal de dia 31, cobrindo concluir, pular, encerrar, adiar apenas uma ocorrência e restaurar um backup da versão 3
