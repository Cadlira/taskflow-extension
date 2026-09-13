## 1. Integridade de tarefas no domínio

- [x] 1.1 Expor a verificação de URL `http`/`https` hoje privada em `task-draft.ts` para reuso no domínio, sem mudar o comportamento, e verificar que os testes existentes de `task-draft` continuam passando.
- [x] 1.2 Criar `src/domain/task-integrity.ts` com a validação estrita de uma tarefa persistida (id, textos sem espaços nas extremidades e com limites, status, prioridade, instantes no formato `toISOString()`, `completedAt` somente em `DONE`, tags normalizadas, URL, lembretes com prazo, offsets permitidos, sem offset ou id repetido), descartando propriedades desconhecidas e coletando todos os erros com posição, título e campo, e verificar com testes unitários um caso válido e cada rejeição prevista em `task-backup`.
- [x] 1.3 Adicionar a validação da coleção com unicidade de `id` e agregação dos erros de todas as tarefas, e verificar em testes a recusa por duplicidade e a contagem total de erros.
- [x] 1.4 Criar testes de ida e volta que produzem tarefas por `createTask`, `updateTask`, `applyStatus`, `settleElapsedReminders` e `markReminderTriggered` e verificar que todas passam em `task-integrity`.

## 2. Formato de arquivo versionado

- [x] 2.1 Criar `src/application/backup/backup-file.ts` com `CURRENT_BACKUP_FORMAT_VERSION = 1`, `BACKUP_MIGRATIONS` vazio, codificação do arquivo (`format`, `formatVersion`, `exportedAt`, `app.version`, `tasks`, indentação de 2 espaços) e geração do nome `taskflow-backup-AAAA-MM-DD-HHmm.json` em hora local, e verificar em testes a forma exata do JSON e o nome com relógio fixo.
- [x] 2.2 Implementar a leitura com JSON inválido, `format` ausente ou diferente, `formatVersion` inválida, versão mais nova e `tasks` ausente ou não lista, delegando as tarefas à validação de domínio, e verificar cada motivo de recusa em testes unitários.
- [x] 2.3 Implementar a aplicação encadeada de migrações com versão atual e migrações injetáveis, e verificar em teste uma cadeia sintética 1 → 2 → 3 aplicada em ordem e validada ao final, além de nenhuma migração para arquivo da versão atual.
- [x] 2.4 Adicionar `tests/fixtures/backups/taskflow-backup-v1.json` com tarefas representativas (todos os status, lembretes processados e pendentes, tags, URL, propriedades desconhecidas) e verificar em teste que a leitura produz exatamente as tarefas esperadas, sem as propriedades desconhecidas.

## 3. Persistência com substituição atômica

- [x] 3.1 Adicionar `replaceAll(tasks)` à porta `TaskRepository` e ao `InMemoryTaskRepository` de `tests/support/fakes.ts`, com emissão de alteração e `failNext.replaceAll`, e verificar por typecheck e pelos testes de fakes existentes.
- [x] 3.2 Implementar `ChromeTaskRepository.replaceAll` pelo `mutate` existente e verificar com `fakeBrowser`: gravação única do envelope `schemaVersion: 1`, substituição completa, notificação de assinantes, recusa sem gravar quando os dados atuais são incompatíveis e dados anteriores intactos quando `storage.local.set` falha.

## 4. Caso de uso de backup

- [x] 4.1 Criar `createBackupService` com `exportBackup` a partir de `repository.list()`, e verificar com fakes a exportação com e sem tarefas, o retorno `LOCAL_DATA_INCOMPATIBLE` e `STORAGE_UNAVAILABLE` sem conteúdo e a inclusão de todas as tarefas independentemente de filtros.
- [x] 4.2 Implementar `prepareRestore` com verificação de 20 MiB antes de `text()`, bloqueio por dados locais incompatíveis, leitura do formato e prévia (`exportedAt`, `formatVersion`, `appVersion`, total do arquivo e total local), e verificar em testes que `text()` não é chamado para arquivo grande nem com dados incompatíveis e que nenhum dado é gravado em nenhuma recusa.
- [x] 4.3 Implementar `restore` com `settleElapsedReminders`, `replaceAll`, releitura e comparação, e `reconcileAll` dos lembretes planejados, e verificar em testes: timestamps preservados, lembrete vencido marcado sem notificação, alarmes das tarefas substituídas removidos e novos criados, falha de gravação sem alteração, falha de alarmes com `remindersPending` e tarefas mantidas, divergência concorrente com `verified: false`.
- [x] 4.4 Criar `createChromeBackupService` em `src/composition/` com `ChromeTaskRepository`, `ChromeReminderScheduler`, relógio real e `browser.runtime.getManifest().version`, e verificar que o teste de arquitetura continua impedindo APIs Chrome em `domain` e `application`.
- [x] 4.5 Criar teste de integração com `fakeBrowser`, repository e scheduler reais que semeia `taskflow.tasks` e uma chave sentinela, exporta e restaura um arquivo com propriedades extras, e verificar que nome e valor da sentinela não aparecem no arquivo, que a sentinela permanece inalterada, que nenhuma chave nova é criada e que as tarefas gravadas não têm propriedades extras.

## 5. Interface de backup no Side Panel

- [x] 5.1 Criar `src/components/backup/download-text-file.ts` com `Blob`, `URL.createObjectURL`, `<a download>` temporário e revogação da URL, e verificar em teste de componente com happy-dom o nome do arquivo, o tipo `application/json` e a revogação.
- [x] 5.2 Criar `backup-labels.ts` e `BackupManager.vue` com exportação, feedback de sucesso e erro, aviso de arquivo não criptografado e estados `idle`/`reading`, e verificar em testes de componente com serviço fake a exportação bem-sucedida, a falha e o bloqueio por dados incompatíveis.
- [x] 5.3 Adicionar ao `BackupManager.vue` o seletor de arquivo, a limpeza do input após leitura e a apresentação das recusas com os 5 primeiros erros e a contagem restante, e verificar em testes de componente cada motivo de recusa e a lista truncada.
- [x] 5.4 Adicionar a prévia com datas locais, versões e totais, as ações "Exportar dados atuais", "Cancelar" e "Restaurar" com `ConfirmDialog`, e verificar em testes que cancelar na prévia ou no diálogo não chama `restore`, que exportar mantém a prévia e que o backup vazio informa a remoção de todas as tarefas locais.
- [x] 5.5 Tratar o resultado da restauração com sucesso e total restaurado, aviso de lembretes pendentes, aviso de restauração não confirmada e erro de gravação, e verificar mensagens, regiões `aria-live`/`role="alert"` e foco em testes de componente.
- [x] 5.6 Integrar o modo `backup` ao `TaskManager.vue` pelo botão "Backup" do cabeçalho e por "Restaurar backup" no estado vazio, com "Voltar" à listagem e `store.load()` após restauração, e fornecer o serviço em `src/entrypoints/sidepanel/main.ts`, e verificar em testes do `TaskManager` a navegação, a listagem atualizada após restauração e a ausência de alteração ao voltar.
- [x] 5.7 Verificar em teste que o popup não oferece exportação nem restauração e que `src/entrypoints/popup/main.ts` não fornece o serviço de backup.

## 6. Manifest, documentação e validação final

- [ ] 6.1 Confirmar que `tests/manifest/manifest-permissions.test.ts` passa sem alteração e verificar, após `npm run build`, que `.output/chrome-mv3/manifest.json` contém exatamente `sidePanel`, `storage`, `alarms` e `notifications`, sem `downloads` e sem `host_permissions`.
- [ ] 6.2 Atualizar `docs/architecture.md` (formato v1, compatibilidade, `replaceAll`, isolamento de credenciais, fluxo de restauração) e `README.md` (como exportar e restaurar, limites e aviso de arquivo não criptografado) somente com o comportamento implementado, e verificar por leitura que não há menção a backup automático, mesclagem ou criptografia como disponíveis.
- [ ] 6.3 Executar o fluxo manual na extensão empacotada no Chrome: exportar com tarefas e lembretes, restaurar em perfil limpo, confirmar alarmes recriados, recusar arquivo inválido e de versão mais nova, cancelar a restauração e confirmar a sincronização com o popup aberto, e registrar o resultado em `verification.md` da Change.
- [ ] 6.4 Executar `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:coverage`, `npm run build` e `npx openspec validate adicionar-backup-importacao-exportacao --type change --strict --no-interactive`, corrigindo qualquer falha antes de solicitar a revisão final.
