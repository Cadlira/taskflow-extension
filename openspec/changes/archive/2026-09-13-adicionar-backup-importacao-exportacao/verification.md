# Verificação manual — `adicionar-backup-importacao-exportacao` (TF-002)

## Ambiente

- Data: 2026-09-13.
- Chrome: 152.0.7977.84 (Windows).
- Build: `npm run build`, carregado de `.output/chrome-mv3` sem compactação.
- Perfil: temporário e descartável (`taskflow-e2e`), extensão carregada via CDP `Extensions.loadUnpacked` (o Chrome estável não aceita mais `--load-extension`).
- Superfícies: `sidepanel.html` e `popup.html` abertos como abas da extensão; `chrome.storage.local` e `chrome.alarms` inspecionados no próprio contexto da extensão.

## Itens verificados

### 1. Exportar com tarefas e lembretes — PASSOU

Tarefa `Tarefa E2E backup` criada pelo formulário do Side Panel com prazo `2026-09-14T21:30:00.000Z` e lembrete `offsetMinutes: 15`.

- Nome do arquivo gerado: `taskflow-backup-2026-09-13-1846.json` (hora local).
- Conteúdo: `format: "taskflow-backup"`, `formatVersion: 1`, `exportedAt: "2026-09-13T21:46:14.317Z"`, `app: { version: "0.1.0" }`, `tasks` com a tarefa e o lembrete pendente (`id`, `offsetMinutes`, `dueAt`, timestamps).
- A interface informou `Backup com 1 tarefa exportado` e o arquivo não continha dados além de tarefas.

### 2. Restaurar em perfil limpo — PASSOU

`chrome.storage.local` e os alarmes foram esvaziados no perfil temporário antes da restauração (nenhuma tarefa local, nenhum alarme). O arquivo exportado foi escolhido pelo seletor e a prévia apresentou: exportado em `13/09/2026, 18:46`, formato `1`, `TaskFlow 0.1.0`, `Tarefas no arquivo: 1`, `Tarefas locais: 0`, com os avisos de substituição e de arquivo não criptografado. Após `Restaurar` + `Substituir tarefas`:

- A interface voltou à listagem com `Restauração concluída: 1 tarefa restaurada.` e a tarefa visível.
- A coleção persistida voltou com o mesmo `id`, `createdAt`, `updatedAt`, `dueAt` e lembrete, no envelope `schemaVersion: 1`.

### 3. Alarmes recriados — PASSOU

Após a restauração, `chrome.alarms.getAll()` retornou exatamente:

```text
taskflow:reminder:55c15773-df97-471a-9ba7-ffe85dbbde22:3afe2c29-bee1-4e01-900c-5d8915dfa478
scheduledTime: 1789420500000 (2026-09-14T21:15:00Z = prazo − 15 min)
```

O mesmo alarme existia antes de limpar o perfil, confirmando a recriação a partir dos lembretes planejados das tarefas restauradas.

### 4. Recusar arquivo inválido — PASSOU

Arquivo `{"a":1}` escolhido no seletor: a interface exibiu `O arquivo não é um backup do TaskFlow. Nenhuma tarefa foi alterada.` em `role="alert"`, com foco no alerta, sem oferecer a restauração e sem alterar o armazenamento.

### 5. Recusar versão mais nova — PASSOU

Arquivo com `formatVersion: 99`: a interface exibiu `O backup foi gerado por uma versão mais nova do TaskFlow. Atualize a extensão para restaurá-lo.` e não alterou as tarefas.

### 6. Cancelar a restauração — PASSOU

Com um arquivo válido na prévia, `Restaurar` abriu o `ConfirmDialog` (`Substituir todas as tarefas?`); `Cancelar` fechou o diálogo, manteve a prévia disponível e não chamou `restore`: a coleção persistida permaneceu byte a byte igual à verificada antes do cancelamento.

### 7. Sincronização com o popup aberto — PASSOU

O `popup.html` foi aberto e permaneceu aberto durante a validação. Seu estado Pinia já continha a tarefa restaurada (`Tarefa E2E backup:TODO`) sem recarregamento manual. Em seguida, no Side Panel, a tarefa foi alterada para `IN_PROGRESS` pelo seletor de status; a store do popup passou a `Tarefa E2E backup:IN_PROGRESS` sem nenhum recarregamento, comprovando a sincronização por `storage.onChanged`.

## Limitações do método

- "Perfil limpo" foi simulado esvaziando `chrome.storage.local` e os alarmes em um perfil temporário descartável, em vez de um segundo perfil do Chrome recém-criado; para o fluxo de restauração, o efeito (nenhuma tarefa e nenhum alarme locais) é equivalente.
- O download foi capturado interceptando o `Blob` e o `<a download>` na própria página; isso não altera o caminho real do código de exportação (serviço, formato e nome do arquivo), mas não exercita o salvamento físico do arquivo pelo navegador.
- A entrega da notificação do lembrete não foi aguardada; o item verificado foi o alarme recriado. O disparo e a notificação já são cobertos pelos testes automatizados de `TF-001`.

## Conclusão

Todos os passos previstos na task 6.3 foram executados na extensão empacotada e passaram, sem falhas ou divergências em relação a `specs/task-backup/spec.md` e `specs/task-reminders/spec.md`.
