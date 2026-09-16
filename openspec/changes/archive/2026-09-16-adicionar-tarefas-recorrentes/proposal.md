## Why

Compromissos que se repetem — pagar contas todo dia 10, enviar o relatório toda segunda, revisar backups a cada 15 dias — hoje só existem no TaskFlow como tarefas avulsas recriadas à mão. A cada repetição o usuário redigita título, prazo e lembretes, e nada registra que aquelas conclusões pertencem ao mesmo compromisso.

A `TF-005` tornou os lembretes confiáveis e, sem querer, deixou a recorrência barata: a identidade de uma ocorrência de lembrete é o seu instante efetivo, de modo que mover o prazo já re-arma sozinho todo lembrete relativo. Uma série pode reaproveitar essa maquinaria inteira sem nenhum agendamento novo.

## What Changes

- Tarefas com prazo passam a aceitar uma **regra de recorrência opcional**: diária com intervalo de dias, semanal com um conjunto de dias da semana, ou mensal por dia do mês. A série pode não ter fim ou terminar em uma data limite.
- **Cada ocorrência é uma tarefa real.** Fechar a ocorrência aberta gera a próxima; as ocorrências passadas permanecem como histórico de conclusões e nunca são alteradas retroativamente.
- **Concluir** a ocorrência aberta gera a próxima automaticamente. **Cancelar** passa a perguntar, em diálogo, se o usuário quer *pular esta ocorrência* ou *encerrar a série* — tanto pela ação "Cancelar tarefa" quanto pelo seletor de status do cartão.
- A próxima ocorrência é calculada a partir do instante **agendado**, não do instante da conclusão, de modo que concluir atrasado não desloca a série. Ocorrências perdidas são **puladas**, não acumuladas: ignorar uma tarefa diária por uma semana produz uma tarefa atrasada, não sete.
- **Editar apenas esta ocorrência** e **editar a série** passam a ser distinguíveis: mover o prazo de uma ocorrência isolada não muda o calendário das seguintes; alterar a regra vale da ocorrência aberta em diante.
- Lembretes **relativos** são copiados para a nova ocorrência e voltam a ficar pendentes automaticamente. Lembretes de **horário absoluto** passam a ser recusados em tarefas recorrentes, porque um instante fixo não pode acompanhar a série.
- A série é ancorada no **fuso corrente do navegador**, sem gravar fuso IANA na tarefa. "Todo dia às 9h" continua às 9h locais ao atravessar horário de verão.
- **BREAKING** — o armazenamento passa a `schemaVersion: 3` e o backup a `formatVersion: 3`. Como nas versões anteriores, uma versão mais antiga do TaskFlow recusa os dados novos em vez de sobrescrevê-los.
- **Nenhuma permissão nova no manifest.**

## Non-Goals

Ficam explicitamente fora desta Change:

- `RRULE`, iCalendar, importação ou exportação de calendário.
- Regras de posição ("segunda terça do mês"), anuais, "último dia útil" ou dias úteis.
- Fixar a série em um fuso IANA específico, independente de onde o navegador esteja.
- Fim de série por contagem de ocorrências (apenas data limite ou sem fim).
- Geração em segundo plano: nenhuma ocorrência nasce sem o usuário fechar a anterior. Não há alarme novo nem despertar periódico do service worker.
- Materializar várias ocorrências futuras de uma vez.
- Edição ou exclusão em massa das ocorrências passadas de uma série.
- Visão dedicada de histórico, progresso ou sequência da série — o campo que a torna possível é criado aqui, mas a visualização pertence à `TF-008` e à `TF-009`.

## Capabilities

### New Capabilities

- `task-recurrence`: regra de recorrência diária, semanal e mensal; cálculo da próxima ocorrência com ancoragem no agendado, avanço sobre ocorrências perdidas e resolução de data civil local; geração da próxima ocorrência ao fechar a aberta; identidade e invariantes da série; distinção entre editar a ocorrência e editar a série; encerramento da série.

### Modified Capabilities

- `task-management`: o modelo de tarefa ganha os campos `seriesId` e `recurrence`; concluir e cancelar uma ocorrência recorrente passam a ter efeito adicional sobre a série; excluir a ocorrência aberta encerra a série.
- `task-reminders`: lembretes de horário absoluto passam a ser recusados em tarefas com recorrência; lembretes relativos são transportados para a nova ocorrência sem a marca de ocorrência processada.
- `task-backup`: o formato passa a `formatVersion: 3`, com migração da versão 2 e validação estrita dos campos de recorrência.
- `interface-accessibility`: o diálogo de confirmação passa a admitir mais de duas ações, com foco circular entre todas; cancelar uma tarefa recorrente pelo seletor de status passa a exigir confirmação, e sair do seletor deixa de aplicar a escolha nesse caso.

## Impact

**Domínio e aplicação**

- Novo `src/domain/task-recurrence.ts`: tipos da regra, validação, cálculo da próxima ocorrência e construção da ocorrência seguinte.
- `src/domain/task.ts`: campos `seriesId` e `recurrence` na `Task`.
- `src/domain/task-draft.ts`: recorrência no rascunho, validação e erros de campo; regra que recusa lembretes absolutos em série.
- `src/domain/task-integrity.ts`: validação estrita da recorrência em tarefas restauradas.
- `src/application/task-service.ts`: geração da próxima ocorrência ao fechar a aberta; encerrar série.
- `src/application/task-repository.ts` e `src/infrastructure/chrome/chrome-task-repository.ts`: nova operação `saveMany`, necessária porque fechar a ocorrência e criar a seguinte precisam ser uma única gravação.

**Persistência**

- `src/infrastructure/storage/stored-task-collection.ts`: `schemaVersion: 3` e migração aditiva da versão 2.
- `src/application/backup/backup-file.ts`: `formatVersion: 3` e migração na cadeia existente; novo arquivo de referência em `tests/fixtures/backups/`.

**Interface**

- `src/components/tasks/TaskForm.vue`: editor da regra de recorrência e ação de encerrar a série.
- `src/components/tasks/TaskList.vue` e `src/components/tasks/task-labels.ts`: indicação de tarefa recorrente no cartão.
- `src/components/tasks/TaskManager.vue`: diálogo de pular ou encerrar, nos dois caminhos de cancelamento.
- `src/components/ConfirmDialog.vue`: suporte a mais de duas ações, preservando o foco circular e o comportamento de Escape.

**Sem impacto**

`src/domain/task-reminders.ts`, `src/application/reminder-service.ts` e `src/infrastructure/chrome/chrome-reminder-scheduler.ts` não mudam: a nova ocorrência entra no mesmo caminho de persistência e reconciliação já existente.

**Permissões**

Nenhuma alteração no `manifest`. A recorrência é aritmética de calendário sobre dados já persistidos.
