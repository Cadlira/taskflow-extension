## Context

A motivação está em `proposal.md` e os contratos observáveis em `specs/task-backup/spec.md` e `specs/task-reminders/spec.md`. Este documento registra apenas como encaixar o backup na arquitetura existente.

Estado atual relevante:

- As tarefas ficam em uma única chave `taskflow.tasks` de `chrome.storage.local`, no envelope `{ schemaVersion: 1, tasks }`. O decoder (`src/infrastructure/storage/stored-task-collection.ts`) valida só a estrutura: aceita qualquer `offsetMinutes` inteiro não negativo, não verifica limites de texto, esquema de URL nem coerência entre `DONE` e `completedAt`, e descarta propriedades desconhecidas.
- `TaskRepository` expõe `list`, `get`, `save`, `delete` e `subscribe`. `ChromeTaskRepository.mutate` serializa escritas por instância e relê a coleção antes de gravar; dados incompatíveis geram `TaskStorageError('INCOMPATIBLE_DATA')` e nunca são sobrescritos.
- Popup, Side Panel e background criam instâncias próprias do repository e reagem a `storage.onChanged`; não há mensagens entre contextos.
- `TaskService` reconcilia os alarmes de uma tarefa após cada mutação. `ReminderService.reconcileAll`, executado no background na instalação e na inicialização, liquida lembretes vencidos e chama `ReminderScheduler.reconcileAll`.
- Regras de domínio já existentes: `TASK_LIMITS`, normalização de tags e `isHttpUrl` (privado) em `task-draft.ts`; `REMINDER_OFFSETS` e `settleElapsedReminders` em `task-reminders.ts`; `applyStatus` garante `completedAt` somente em `DONE`.
- Um teste de arquitetura impede que `domain` e `application` importem Vue, Pinia, WXT, infraestrutura ou APIs `browser`/`chrome`.
- Permissões atuais: `sidePanel`, `storage`, `alarms` e `notifications`, fixadas por teste.

## Goals / Non-Goals

**Goals:**

- tornar o formato do arquivo um contrato público estável, separado do formato interno do storage;
- validar o arquivo com as mesmas invariantes que o domínio garante ao criar e editar tarefas;
- restaurar com uma única gravação e reaproveitar a reconciliação de lembretes existente;
- manter o isolamento de dados que não sejam tarefas por construção, não por filtragem;
- manter tudo testável sem DOM nem APIs do Chrome, exceto as bordas de download e storage.

**Non-Goals:**

- resolver concorrência entre instâncias do repository de forma geral (lock distribuído, versão por coleção);
- criar uma camada genérica de import/export reutilizável por futuros formatos;
- manter snapshots internos ou histórico de restaurações;
- sanitizar conteúdo digitado pelo usuário, como tokens em `sourceUrl`.

## Decisions

### 1. Formato de arquivo próprio, versionado independentemente do storage

```json
{
  "format": "taskflow-backup",
  "formatVersion": 1,
  "exportedAt": "2026-09-13T18:30:00.000Z",
  "app": { "version": "0.1.0" },
  "tasks": [
    {
      "id": "…",
      "title": "…",
      "status": "TODO",
      "priority": "MEDIUM",
      "reminders": [],
      "tags": [],
      "createdAt": "…",
      "updatedAt": "…"
    }
  ]
}
```

Na versão 1, cada item de `tasks` tem exatamente a forma de `Task`. `formatVersion` e `schemaVersion` do storage evoluem separadamente: uma mudança interna de armazenamento não obriga uma nova versão do arquivo, e vice-versa. `app.version` é apenas informativo, exibido na prévia e nunca usado para decidir compatibilidade.

O arquivo é gerado com `JSON.stringify(backup, null, 2)` para permitir inspeção e edição manual.

**Alternativas consideradas:** exportar o envelope do storage diretamente acopla o contrato público a um detalhe interno e faria qualquer mudança de persistência quebrar backups antigos. CSV não representa lembretes e tags sem perda. Checksum ou assinatura foram descartados: a validação completa já detecta corrupção, e a edição manual é um uso legítimo.

### 2. Compatibilidade por migrações encadeadas e rejeição de versões futuras

O leitor do formato fica em `src/application/backup/backup-file.ts`, sem dependências de Chrome:

```text
texto --JSON.parse--> objeto
  format != "taskflow-backup"         -> NOT_TASKFLOW_BACKUP
  formatVersion não inteiro ou < 1    -> INVALID_FORMAT_VERSION
  formatVersion > atual               -> NEWER_FORMAT_VERSION
  formatVersion < atual               -> migrations[v-1], ..., migrations[atual-2]
  estrutura da versão atual           -> tarefas candidatas -> validação de domínio
```

- `CURRENT_BACKUP_FORMAT_VERSION = 1` e `BACKUP_MIGRATIONS` é uma lista ordenada em que o item `i` converte a versão `i + 1` na versão `i + 2`. Na versão 1 a lista é vazia.
- A função de leitura recebe versão atual e migrações como parâmetros com valores padrão, para que os testes exercitem uma cadeia sintética (1 → 2 → 3) sem inventar versões em produção. Esse é o único ponto de extensão e existe porque a compatibilidade futura é requisito explícito desta Change.
- A regra "toda mudança de conteúdo incrementa `formatVersion`" torna seguro ignorar propriedades desconhecidas em versões suportadas: em um arquivo da mesma versão, elas só podem vir de edição manual, e nunca de dados legítimos que uma versão antiga descartaria.
- `tests/fixtures/backups/taskflow-backup-v1.json` é o arquivo de referência. Ele é tratado como imutável; versões futuras adicionam novos arquivos de referência e mantêm os anteriores.

**Alternativas consideradas:** aceitar versões futuras ignorando campos desconhecidos permitiria perda silenciosa de dados em downgrade. Usar versionamento semântico (`1.2`) no arquivo complica a regra de compatibilidade sem benefício para um único consumidor.

### 3. Validação de integridade no domínio, estrita ao formato persistido

Uma nova função pura `validatePersistedTask(value, index)` em `src/domain/task-integrity.ts` recebe um valor desconhecido e retorna `Task` ou uma lista de `BackupIssue` (`{ taskIndex, taskTitle?, field, message }`). Uma função de coleção agrega os resultados e verifica a unicidade dos `id`.

- Reaproveita `TASK_LIMITS`, `REMINDER_OFFSETS`, `isTaskStatus`, `isTaskPriority` e a verificação de URL, que passa a ser exportada de `task-draft.ts` (ou movida para um módulo compartilhado do domínio) sem mudança de comportamento.
- **Estrita, sem normalizar:** textos com espaços nas extremidades, strings vazias em campos opcionais, tags duplicadas ignorando caixa e instantes que não estejam no formato `toISOString()` são recusados. O TaskFlow nunca persiste esses valores, então só aparecem em arquivos editados à mão, e a restauração deve devolver exatamente o que foi exportado.
- Propriedades desconhecidas são descartadas ao construir o `Task` resultante, que contém somente os campos conhecidos.
- Todos os erros são coletados, sem parar no primeiro, e a UI mostra os 5 primeiros e a quantidade restante.

**Alternativas consideradas:** reaproveitar `decodeStoredTaskCollection` aceitaria dados que o domínio considera inválidos e quebraria a promessa de restaurar somente tarefas válidas. Converter para `TaskDraft` e usar `createTask` geraria novos `id` e timestamps, contrariando a restauração fiel. Normalizar silenciosamente alteraria dados sem o usuário perceber.

### 4. Caso de uso `BackupService` na camada de aplicação

`src/application/backup/backup-service.ts`, criado por `createBackupService({ repository, scheduler, clock, appVersion })`:

```ts
exportBackup(): Promise<ExportBackupResult>
// { ok: true; fileName; content; taskCount } | { ok: false; reason: 'LOCAL_DATA_INCOMPATIBLE' | 'STORAGE_UNAVAILABLE' }

prepareRestore(file: { size: number; text(): Promise<string> }): Promise<PrepareRestoreResult>
// { ok: true; prepared: PreparedRestore } | { ok: false; reason; issues?: BackupIssue[]; extraIssueCount? }

restore(prepared: PreparedRestore): Promise<RestoreResult>
// { ok: true; restoredCount; remindersPending; verified } | { ok: false; reason }
```

- `prepareRestore` recebe um objeto com a mesma forma de `File`: o componente passa o `File` real e os testes passam um objeto simples. O tamanho (`BACKUP_MAX_BYTES = 20 * 1024 * 1024`) é verificado antes de `text()`.
- `prepareRestore` lê a coleção local para contar as tarefas da prévia. Se a leitura falhar com `INCOMPATIBLE_DATA`, retorna `LOCAL_DATA_INCOMPATIBLE` antes de ler o arquivo.
- `PreparedRestore` contém as tarefas validadas e a prévia (`exportedAt`, `formatVersion`, `appVersion`, `fileTaskCount`, `localTaskCount`). É um valor imutável mantido pela UI até a confirmação ou o cancelamento.
- Os nomes de arquivo usam o relógio injetado e a hora local: `taskflow-backup-AAAA-MM-DD-HHmm.json`.
- As mensagens de erro de formato ficam em um módulo de rótulos da UI (`src/components/backup/backup-labels.ts`), mapeadas a partir de `reason`, seguindo o padrão de `task-labels.ts`. As mensagens de validação de campo são geradas no domínio, como já acontece em `task-draft.ts`.
- O serviço nunca registra conteúdo de arquivo nem de tarefas em logs.

**Alternativas consideradas:** colocar a lógica no componente ou na store dificultaria os testes e violaria a regra de entrypoints e componentes finos. Estender `TaskService` misturaria um fluxo de coleção inteira com os casos de uso por tarefa.

### 5. `TaskRepository.replaceAll` com gravação única

```ts
/** Substitui toda a coleção em uma única gravação. Nunca sobrescreve dados incompatíveis. */
replaceAll(tasks: Task[]): Promise<void>;
```

`ChromeTaskRepository.replaceAll` usa o `mutate` existente com `() => tasks`. Assim, herda a serialização da instância e a leitura prévia que lança `INCOMPATIBLE_DATA` sem gravar, e grava com um único `storage.local.set` na chave `taskflow.tasks`. Como a coleção inteira é um único valor, a gravação é atômica do ponto de vista do storage: o resultado é o conjunto novo ou o conjunto anterior. `InMemoryTaskRepository` em `tests/support/fakes.ts` ganha a mesma operação, com emissão de alteração e `failNext.replaceAll`.

**Alternativas consideradas:** chamar `delete` e `save` por tarefa produziria N escritas e N eventos, e deixaria estados intermediários em caso de falha. Uma chave temporária seguida de troca não traz ganho, porque `storage.local` não tem transações entre chaves e a chave única já é atômica.

### 6. Sequência da restauração

```text
restore(prepared)
  now = clock()
  tasks = prepared.tasks.map(t => settleElapsedReminders(t, now))
  repository.replaceAll(tasks)            -- falha: { ok: false }, nada gravado
  persisted = repository.list()           -- releitura imediata
  verified = deepEqual(persisted, tasks)
  try scheduler.reconcileAll(tasks.flatMap(t => planReminders(t, now)))
  catch -> remindersPending = (há lembretes planejados)
  return { ok: true, restoredCount, remindersPending, verified }
```

- A verificação vem logo após a gravação para reduzir a janela em que outra instância pode alterar os dados; a reconciliação de alarmes vem em seguida. Uma falha na releitura é tratada como `verified: false`, já que a gravação foi aceita.
- `reconcileAll` remove todos os alarmes `taskflow:reminder:*` que não estão no plano, o que cobre as tarefas substituídas. O `ChromeReminderScheduler` já é usado pelo Side Panel por meio do `TaskService`, então nenhuma nova API ou mensagem para o background é necessária.
- Timestamps não são alterados. `settleElapsedReminders` é o único ajuste, e é a mesma regra da reconciliação global.
- Após o sucesso, a UI chama `store.load()` como garantia adicional ao `storage.onChanged`, que já atualiza todas as superfícies.

### 7. Exportação montada a partir do domínio

`exportBackup` usa apenas `repository.list()`, que retorna `Task[]` já decodificado, e monta o objeto do formato com propriedades explícitas. Nenhum código de backup chama `storage.local.get(null)` nem conhece chaves do storage. Na restauração, a única escrita é `replaceAll`. O isolamento é coberto por um teste de integração com `fakeBrowser`, `ChromeTaskRepository` real e o serviço de backup:

- o teste semeia `taskflow.tasks` e uma chave `taskflow.test-secret` com valor sentinela e verifica que o conteúdo exportado não contém o nome nem o valor;
- restaura um arquivo com propriedades extras no topo e nas tarefas, e verifica que `taskflow.test-secret` permanece igual, que nenhuma chave nova existe e que as tarefas persistidas não carregam as propriedades extras.

**Alternativa considerada:** uma lista de chaves excluídas (denylist) sobre um dump do storage falharia silenciosamente sempre que uma Change futura adicionasse uma chave sensível.

### 8. Download e seleção de arquivo na borda da UI

- **Download:** um helper de UI `src/components/backup/download-text-file.ts` cria `Blob([content], { type: 'application/json' })`, gera a URL com `URL.createObjectURL`, clica em um `<a download>` temporário e revoga a URL em seguida. Nenhuma API `chrome.downloads`, portanto nenhuma permissão nova.
- **Seleção:** um `<input type="file" accept=".json,application/json">` visualmente associado a um botão "Escolher arquivo de backup". O valor do input é limpo após cada leitura para permitir escolher o mesmo arquivo novamente.
- **Superfície:** somente o Side Panel. O popup fecha ao perder o foco para diálogos do sistema, o que tornaria o fluxo não confiável; ele permanece inalterado.

**Alternativas consideradas:** `chrome.downloads` exigiria a permissão `downloads`. A File System Access API (`showSaveFilePicker`) adiciona variação de suporte e permissões de diretório sem necessidade para um arquivo único.

### 9. Integração na interface do Side Panel

- `TaskManager.vue` ganha o modo `'backup'`, ao lado de `'list' | 'create' | 'edit'`, aberto por um botão "Backup" no cabeçalho e por "Restaurar backup" no estado vazio. Nesse modo, renderiza `BackupManager.vue` com a ação "Voltar".
- `BackupManager.vue` recebe o `BackupService` por `inject`, fornecido em `src/entrypoints/sidepanel/main.ts` por `createChromeBackupService()` (novo em `src/composition/`, que lê `browser.runtime.getManifest().version`). O popup não recebe esse serviço.
- Estados do componente: `idle`, `reading`, `rejected` (motivo e erros), `preview` e `restoring`. A prévia usa uma seção acessível com o resumo e a ação "Exportar dados atuais". O botão "Restaurar" abre o `ConfirmDialog` existente com texto explícito de substituição.
- O feedback segue o padrão existente: região `aria-live` para sucesso ou aviso e `role="alert"` para erros. Os avisos cobrem "lembretes pendentes" (reutilizando `REMINDERS_PENDING_MESSAGE`) e "restauração não confirmada".
- Quando a store está com `loadError` causado por dados incompatíveis, o modo backup ainda pode ser aberto, mas as ações retornam o bloqueio pelo serviço. A decisão fica no serviço e não é duplicada na UI.
- Não há store Pinia de backup: o estado é local ao fluxo e descartado ao sair.

**Alternativas consideradas:** uma página de opções dedicada exigiria outro entrypoint para um fluxo pouco frequente. Uma store Pinia adicionaria estado global sem nenhum outro consumidor.

## Risks / Trade-offs

- [Outra instância grava entre a leitura e a escrita da restauração, por exemplo o background marcando `lastTriggeredFor`, e reescreve a coleção anterior] → A janela é curta (dois `await`). A releitura imediata detecta a divergência e a UI informa "restauração não confirmada". Um lock entre contextos fica fora do escopo.
- [A reconciliação global do background roda em paralelo com dados antigos e recria alarmes de tarefas substituídas] → `ReminderService.handleAlarm` já descarta alarmes sem tarefa ou lembrete correspondente e os remove, então nenhuma notificação indevida é exibida.
- [Tarefa persistida por um caminho legado não passa na validação estrita, e o próprio backup exportado é recusado na restauração] → Todos os caminhos atuais do domínio produzem tarefas válidas. Testes de ida e volta cobrem tarefas criadas, editadas, com mudança de status e com lembretes processados. Como último recurso, o arquivo é JSON legível e corrigível à mão.
- [Arquivo de backup contém dados pessoais e possivelmente tokens em `sourceUrl`] → A prévia e a área de backup informam que o arquivo não é criptografado. A criptografia fica como não objetivo.
- [Restauração acidental substitui dados recentes] → Prévia com totais, ação "Exportar dados atuais" e confirmação explícita no `ConfirmDialog`. Desfazer pertence à `TF-008`.
- [Arquivo maior que a cota de `storage.local` (10 MiB) passa no limite de leitura de 20 MiB] → A gravação é rejeitada pelo storage, os dados anteriores permanecem e o usuário vê "backup não restaurado". O limite de 20 MiB existe para que backups formatados de coleções próximas da cota continuem legíveis.
- [Arquivo grande bloqueia a interface durante `JSON.parse` e a validação] → O volume esperado para uso pessoal é pequeno. O estado `reading` desabilita as ações e o limite de 20 MiB impede entradas desproporcionais.
- [Diferenças no suporte a `<a download>` dentro do Side Panel] → Validação manual na extensão empacotada está prevista nas tasks antes de concluir.

## Migration Plan

- Não há migração do storage: `schemaVersion` permanece 1 e `replaceAll` grava o mesmo envelope.
- A primeira versão do formato de arquivo é introduzida junto com o arquivo de referência v1.
- Rollback: reverter a Change remove a interface e o serviço de backup sem afetar os dados. Arquivos já exportados continuam válidos para uma reintrodução futura, porque o contrato v1 fica documentado e fixado pelo arquivo de referência.
