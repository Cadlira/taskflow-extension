# Verificação manual — `adicionar-lembretes-personalizados` (TF-005)

Registro da tarefa 6.4: build MV3 carregado em perfil de teste e comportamentos observados no navegador real.

## Validação automatizada (tarefa 6.3)

`npm run validate` executado em 2026-09-15, com todas as etapas aprovadas:

- `npm run lint` — sem avisos ou erros;
- `npm run typecheck` — `vue-tsc --noEmit` sem erros;
- `npm run test` — 35 arquivos, **622 testes** aprovados;
- `npm run build` — WXT 0.21.4 gerou `.output/chrome-mv3` (171,79 kB no total).

`npx openspec validate adicionar-lembretes-personalizados --type change --strict --no-interactive` — "Change 'adicionar-lembretes-personalizados' is valid".

## Ambiente

- Data: 2026-09-15.
- Navegador: **Chromium 151.0.7922.34** (chrome-win64 do Playwright), janela 1920 × 1080, perfil temporário `chromium-tf005`, extensão carregada de `.output/chrome-mv3` com `--load-extension` e CDP em `127.0.0.1:9333`.
- Build: `npm run build` (WXT 0.21.4), executado imediatamente antes da validação.
- Método: CDP para páginas e para o contexto da extensão (storage, `chrome.alarms`, `chrome.notifications`); formulários Vue preenchidos pelo setter nativo de `value` com eventos `input`/`change`; toasts do Windows capturados por `System.Drawing`/`CopyFromScreen` a cada 3 s; seleção de arquivo simulada com `File` + `Object.defineProperty(input,'files')` + `change`.
- Nota de método: a tarefa pede "um perfil de teste"; foi usado o Chromium do Playwright, que executa o mesmo motor de `chrome.alarms` e `chrome.notifications`. O encerramento do navegador ao final foi confirmado.

## 6.4 Checklist manual — PASSOU

### 1. Presets — PASSOU

Tarefa "Validação manual TF-005 A" criada com prazo `2026-09-15T21:09:00.000Z` e atalhos **No horário do prazo** e **15 minutos antes**. Resultado persistido em `schemaVersion: 2`:

- `OFFSET 0` e `OFFSET 15` com identificadores distintos;
- alarmes `taskflow:reminder:<taskId>:<reminderId>` em `21:09:00Z` e `20:54:00Z`;
- checkbox dos atalhos marcado a partir dos itens persistidos na edição.

### 2. Offset personalizado — PASSOU

Na edição, um item "Antes do prazo" com valor `10` e unidade `minutos` foi adicionado. A tarefa persistiu `OFFSET 10` e o alarme `20:59:00Z` (prazo − 10 min).

### 3. Horário absoluto — PASSOU

Um item "Data e hora" com `17:55` local persistiu `AT 2026-09-15T20:55:00.000Z` (conversão do fuso local para UTC) e o alarme foi criado no instante absoluto, sem relação com o prazo. No horário, a notificação real foi entregue — toast do Windows "Lembrete do TaskFlow / Validação manual TF-005 A / Prazo: 15/09/2026, 18:51" — e a ocorrência foi registrada com `processedFor: "2026-09-15T20:55:00.000Z"`, com o alarme removido.

### 4. Mudança de prazo — PASSOU

O prazo foi alterado de `21:09:00Z` para `21:51:00Z` mantendo a configuração. Resultado:

- `OFFSET 0`, `OFFSET 15` e `OFFSET 10` recalculados para `21:51:00Z`, `21:36:00Z` e `21:41:00Z`, com os mesmos identificadores;
- `AT` preservado exatamente em `20:55:00.000Z`;
- nenhum alarme órfão permaneceu após a reconciliação.

### 5. Evento repetido — PASSOU

A tarefa "Validação manual TF-005 B" (prazo `20:58:00Z`, lembrete `OFFSET 0`) notificou no horário — segundo toast real capturado: "Lembrete do TaskFlow / Validação manual TF-005 B / Prazo: 15/09/2026, 17:58". Um segundo evento para a mesma ocorrência foi entregue ao service worker 42 s depois, com `scheduledTime` dentro da tolerância de alarme. O sistema descartou o evento:

- nenhuma segunda notificação foi criada (`chrome.notifications.getAll()` vazio);
- `processedFor` permaneceu `2026-09-15T20:58:00.000Z`;
- o alarme reservado foi removido.

### 6. Descarte após cinco minutos — PASSOU (com limitação de método)

Foi injetada no storage real a tarefa "Validação manual TF-005 D" com `dueAt = 2026-09-15T20:50:32.994Z` (6 minutos no passado no momento do disparo) e um lembrete `OFFSET 0` pendente; em seguida foi criado o alarme com `when` igual ao instante efetivo. O handler liquidou a ocorrência:

- `processedFor` gravado exatamente `2026-09-15T20:50:32.994Z`;
- nenhuma notificação criada e alarme removido.

Limitação: o atraso real do navegador além da janela não é reproduzível de forma determinística por controle do usuário. A fronteira exata (entrega até cinco minutos, descarte depois) é coberta pelos testes de domínio e de aplicação (`canDeliverReminder` nos limites e `handleAlarm` com relógio em `triggerAt + 5 min` e `+ 5 min + 1 ms`).

### 7. Reinício do navegador — PASSOU

O navegador foi encerrado e reaberto com o mesmo perfil. Depois da recriação do worker:

- a coleção permaneceu em `schemaVersion: 2`;
- as ocorrências processadas mantiveram `processedFor` (`AT 20:55:00Z`, `B 20:58:00Z`, `D 20:50:32.994Z`);
- os alarmes futuros da tarefa A foram mantidos em `21:36:00Z`, `21:41:00Z` e `21:51:00Z`;
- nenhum estado derivado de agendamento ficou persistido na tarefa.

### 8. Restauração dos backups v1 e v2 — PASSOU

Pela área de **Backup** do Side Panel, com as fixtures de referência `tests/fixtures/backups/taskflow-backup-v1.json` e `taskflow-backup-v2.json`:

- **v1:** a prévia mostrou "Versão do formato 2" e 4 tarefas; após a confirmação, o storage ficou com as 4 tarefas do arquivo, `rem-2` preservou `processedFor: "2026-09-19T12:00:00.000Z"` (conversão de `lastTriggeredFor` − deslocamento) e a reconciliação criou somente o alarme `rem-1` em `2026-09-20T11:00:00.000Z`.
- **v2:** a prévia mostrou "Versão do formato 2" e 3 tarefas; os lembretes relativos, o `AT` pendente e os dois processados foram preservados; a reconciliação criou somente `rem-rel-60` (`2026-09-20T11:00:00.000Z`) e `rem-abs-pending` (`2026-09-18T09:30:00.000Z`).

## Correções decorrentes do relatório de verificação

O relatório de verify apontou três problemas críticos e um aviso; todos foram tratados e cobertos por testes:

1. **Instante efetivo fora do intervalo de `Date` (crítico):** o domínio agora expõe `isRepresentableInstant` (`|epoch| <= 8.640.000.000.000.000`) e a checagem é aplicada na validação de rascunhos (`task-draft`), na validação de tarefas persistidas do backup (`task-integrity`) e na coleção decodificada do storage (`isReminderCollectionValid` em `task-reminders`). As funções de domínio que comparam ou formatam instantes (`isReminderPending`, `settleElapsedReminders`, `planReminders`, `findReminderOccurrence`, `claimReminderOccurrence`) tratam instantes não representáveis como não pendentes, sem lançar `RangeError`. A contradição do `design.md` entre "inteiro seguro" e "preservar qualquer inteiro da v1" foi resolvida: offsets legados são preservados enquanto o instante resultante for representável; caso contrário a coleção é recusada sem sobrescrita.
2. **Decoder v2 aceitava coleções semanticamente inválidas (crítico):** `decodeStoredTaskCollection` agora exige `Number.isSafeInteger` para deslocamentos e, após decodificar, valida a coleção inteira — identificadores de tarefa e de lembrete únicos, limite de dez, exigência de prazo, instantes efetivos representáveis e sem repetição e `AT` até o prazo — recusando tudo com `INCOMPATIBLE_DATA` sem sobrescrever. `save`, `delete` e `replaceAll` permanecem bloqueados diante desses dados.
3. **Trabalho na `main` (crítico):** o trabalho foi movido para a branch `feat/adicionar-lembretes-personalizados` antes das correções; o archive acontecerá na mesma feature branch.
4. **`lastTriggeredFor` inválido ignorado na migração (aviso):** a migração v1 do backup não omite mais valores inválidos — texto malformado, tipo incorreto, nulo ou instante convertido fora do intervalo são preservados na forma migrada para que a validação estrita da versão 2 recuse o arquivo, em vez de aceitá-lo como ocorrência pendente.

Testes adicionados: limites de `isRepresentableInstant`; invariantes de `isReminderCollectionValid`; guardas de domínio sem `RangeError`; deslocamento seguro com instante fora do intervalo em rascunho e integridade; oito casos v2 semanticamente inválidos no repository, incluindo a garantia de não sobrescrita e a recusa da migração v1 não representável; e três casos de `lastTriggeredFor` inválido na migração de backup. Resultado após as correções: lint, typecheck, **649 testes** e build aprovados; `openspec validate --strict` válido.

## Conclusão

Todos os itens do checklist 6.4 foram observados no navegador real, incluindo duas notificações reais. A única limitação é de método no item de descarte após cinco minutos, coberto por testes de fronteira determinísticos. Nenhum defeito funcional novo foi encontrado durante a validação manual.
