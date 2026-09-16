## Context

Ver `proposal.md` — Why para a motivação. O que restringe a solução:

- A coleção inteira de tarefas vive sob uma única chave do `chrome.storage.local`, em `schemaVersion: 2`, e toda leitura decodifica e valida a coleção completa. `TaskRepository.replaceAll` já grava a coleção inteira de uma vez.
- `src/domain` e `src/application` não podem importar Vue, Pinia, WXT, infraestrutura nem APIs do Chrome. O teste `tests/architecture/layer-boundaries.test.ts` verifica isso. `Date` e `Intl` são permitidos.
- A `TF-005` definiu que a identidade de uma ocorrência de lembrete é o seu **instante efetivo**: `isReminderPending` compara `processedFor` com o instante recalculado. Mudar o prazo muda o instante e o lembrete relativo volta a ficar pendente sozinho.
- A `TF-005` também definiu que deslocamentos são **durações exatas**, explicitamente não interpretadas como dia civil anterior, e que nenhum fuso IANA é gravado na tarefa.
- Os alarmes são projeção descartável dos dados persistidos, reconciliada de forma idempotente. Nenhum timer em memória.
- `ConfirmDialog.vue` é binário por construção: o foco circula sobre um array fixo de dois botões.
- O seletor de status do cartão tem semântica própria e detalhada em `interface-accessibility`: Enter aplica, sair do seletor aplica, Escape restaura sem gravar.

## Goals / Non-Goals

**Goals:**

- Manter recorrência inteiramente no domínio, como aritmética de calendário sobre dados já persistidos.
- Reaproveitar integralmente o agendamento e a reconciliação de lembretes da `TF-005`, sem tocar em `task-reminders.ts`, `reminder-service.ts` ou `chrome-reminder-scheduler.ts`.
- Manter uma única gravação por transição de ocorrência, para que a série nunca fique sem ocorrência aberta.
- Preservar a semântica do seletor de status para todas as tarefas que não carregam regra.

**Non-Goals:**

- Abstrair uma "entidade série" ou um repositório próprio para séries.
- Introduzir qualquer biblioteca de datas ou de recorrência.
- Criar um mecanismo genérico de propagação de edições entre ocorrências.

## Decisions

### A regra de recorrência mora na ocorrência aberta

A `Task` ganha dois campos opcionais, e nenhuma entidade nova é criada:

```ts
// src/domain/task.ts
seriesId?: string;        // presente em toda ocorrência da série, inclusive terminais
recurrence?: Recurrence;  // presente apenas na ocorrência que ainda vai gerar a próxima

// src/domain/task-recurrence.ts
interface RecurrenceBase {
  anchorAt?: string;  // instante agendado, quando difere de dueAt
  until?: string;     // instante ISO 8601 UTC limite da série
}

type Recurrence =
  | (RecurrenceBase & { frequency: 'DAILY';   intervalDays: number })
  | (RecurrenceBase & { frequency: 'WEEKLY';  weekdays: number[] })
  | (RecurrenceBase & { frequency: 'MONTHLY'; dayOfMonth: number });
```

**Alternativas consideradas.** Uma coleção separada de séries (template mais instâncias) é a modelagem ortodoxa, mas exigiria chave de armazenamento nova, seção nova no backup, validação nova, plumbing de `subscribe` e tratamento de órfãos — máquina desproporcional para uma extensão local de um usuário. Uma tarefa rolante única, que apenas avança o próprio prazo ao ser concluída, é mais barata, mas destrói o histórico de conclusões, torna "editar apenas esta ocorrência" inexpressável e conflita com a regra de `completedAt` do ciclo de vida, já que a tarefa precisaria ser des-concluída imediatamente.

`seriesId` fica no topo da `Task`, e não dentro de `recurrence`, para sobreviver nas ocorrências terminais. É o que torna possível, sem outra migração, a `TF-008` e a `TF-009` enxergarem o histórico de uma série.

### O invariante é sobre a regra, não sobre o status

O invariante da série é "no máximo uma ocorrência carrega a regra", e não "no máximo uma ocorrência aberta". A diferença aparece ao reabrir: uma ocorrência `DONE` que já gerou a seguinte pode voltar a `TODO`, e nesse momento existem duas ocorrências ativas da mesma série. Isso é aceitável e não gera nada — a reaberta não recebe a regra de volta. O invariante formulado sobre o status seria violado por uma operação legítima já especificada em `task-management`.

### Fuso local do navegador, resolvido por data civil

"Todo dia às 9h" é calendário civil, não duração. O avanço decompõe o instante agendado em data e hora locais, avança a **data**, e recompõe pelo construtor local de `Date`. A hora local do dia é preservada por construção, inclusive atravessando horário de verão.

**Alternativas consideradas.** Somar milissegundos (`+86_400_000`) derreteria a série a cada mudança de horário de verão. Gravar um fuso IANA por série permitiria "9h de São Paulo onde quer que eu esteja", mas exigiria resolver civil para instante em um fuso nomeado, com busca de offset e política própria para horas ambíguas e inexistentes — exatamente o motor de calendário que o escopo recusa, e quebraria o princípio da `TF-005` de não gravar fuso na tarefa. A consequência aceita é que a série acompanha o fuso do navegador no momento da geração.

**Atenção de implementação.** `fromLocalDateTimeInput` em `src/components/tasks/date-time.ts:47` compara o `Date` construído com o que foi digitado e devolve `INVALID_DATE_INPUT` quando eles divergem. Essa política é correta para digitação manual, mas é o oposto do que a geração precisa: numa hora local inexistente por avanço de horário de verão, ela descartaria a ocorrência. O resolvedor de recorrência deve **aceitar** o instante que o fuso local resolve. As duas políticas são deliberadamente diferentes e não devem compartilhar a mesma função.

Isso também não contradiz a `TF-005`: deslocamento de lembrete continua sendo duração exata; recorrência é passo civil. São conceitos distintos aplicados a campos distintos.

### Ancoragem no agendado, com avanço sobre o que passou

```
proxima(recorrencia, agora):
    instante = recorrencia.anchorAt ?? tarefa.dueAt
    repetir:
        instante = passo(recorrencia, instante)   # DAILY | WEEKLY | MONTHLY
    ate instante > agora
    se recorrencia.until definido e instante > until: sem proxima ocorrencia
    devolve instante
```

Ancorar no instante agendado, e não no instante da conclusão, elimina deriva: concluir a tarefa de segunda numa quarta produz a segunda seguinte. O laço de avanço resolve atrasos sem materializar ocorrências perdidas: dez dias ignorados produzem uma ocorrência futura, não dez atrasadas.

**Alternativas consideradas.** Ancorar na conclusão é mais simples, mas faz a série escorregar a cada atraso. Materializar todas as ocorrências perdidas é mais fiel ao calendário, mas transforma uma semana de férias em uma enxurrada de tarefas atrasadas.

Para `MONTHLY`, o dia inexistente é ajustado para o último dia do mês, e o ajuste **não é permanente**: o passo seguinte volta a usar `dayOfMonth`, de modo que 31 de janeiro leva ao último dia de fevereiro e depois a 31 de março. Pular meses que não têm o dia perderia ocorrências em silêncio.

### Geração disparada apenas pelo fechamento da ocorrência

Nenhuma ocorrência nasce sem o usuário fechar a anterior. Consequência direta: **nenhum alarme novo, nenhum despertar periódico do service worker, nenhuma reconciliação de geração**. Toda a superfície de risco de Manifest V3 que a `TF-005` teve de enfrentar não reaparece aqui, porque a geração sempre acontece dentro de uma operação de interface que já está executando.

**Alternativas consideradas.** Gerar em segundo plano por alarme diário manteria a lista "sempre em dia", ao custo de um alarme dedicado, de reconciliação própria e de uma classe inteira de bugs de ciclo de vida do worker. Rolar ocorrências vencidas de forma preguiçosa na leitura tornaria a lista dependente de quando o usuário abre a extensão. O preço da escolha é que uma série nunca fechada simplesmente permanece atrasada, que é a representação honesta do que aconteceu.

### `anchorAt` separa adiar uma ocorrência de mudar a série

Sem esse campo, adiar "só esta segunda para quarta" mudaria o cálculo da próxima e a série migraria para quartas permanentemente. `anchorAt` guarda o instante agendado quando ele difere de `dueAt`; o cálculo usa `anchorAt ?? dueAt`. É gravado apenas quando difere, mantendo ausente o caso comum.

**Alternativa considerada.** Recalcular sempre a partir de `dueAt` dispensa o campo, mas corrompe a série a cada adiamento pontual — o gesto mais frequente em tarefas recorrentes.

### `saveMany` na persistência

Fechar a ocorrência e criar a seguinte precisam ser uma única gravação. `TaskRepository` ganha `saveMany(tasks: Task[]): Promise<void>`, implementado como uma leitura, aplicação das duas tarefas e uma gravação da coleção.

**Alternativas consideradas.** Dois `save` sequenciais deixam a série sem ocorrência aberta se a segunda gravação falhar, e a reconciliação de alarmes não conserta isso, porque ela só projeta alarmes e não recria tarefas. Reutilizar `replaceAll` exigiria a lista completa na camada de aplicação e ampliaria a janela de corrida. `saveMany` é a menor primitiva que resolve o problema.

### Lembretes de instante absoluto são recusados em séries

Um lembrete `AT` não pode acompanhar a próxima ocorrência: seu instante é fixo e, transportado, já estaria vencido. A validação recusa a combinação nos dois sentidos — adicionar `AT` a uma tarefa recorrente e adicionar recorrência a uma tarefa com `AT`.

**Alternativas consideradas.** Descartar os `AT` silenciosamente na geração é perda de dados sem aviso. Convertê-los no deslocamento equivalente muda a intenção do usuário sem que ele peça.

Os lembretes `OFFSET` são copiados com identificadores próprios e sem `processedFor`, o que pode reusar `buildReminders(drafts, [], generateId)`. A partir daí, `persist` na `TaskService` já chama `planReminders` e `scheduler.reconcileTask` para a nova tarefa, e os alarmes se armam sozinhos. Identificadores novos são suficientes porque o nome do alarme já é `taskflow:reminder:{taskId}:{reminderId}` e o `taskId` difere.

### Sair do seletor de status não confirma um cancelamento recorrente

O cancelamento recorrente exige confirmação nos dois caminhos. No caminho do botão isso é trivial. No caminho do seletor há um conflito real com `interface-accessibility`, que determina que sair do seletor aplica a escolha exibida e que o foco permanece onde o usuário o levou — um modal aberto no `blur` viola as duas coisas.

A regra adotada: **uma escolha que exige confirmação não é confirmada por sair do campo**. Enter e ponteiro são confirmação forte e abrem o diálogo; `blur` não aplica nada e restaura o status persistido, reaproveitando a semântica que o Escape do seletor já tem. Assim o modal nunca é aberto a partir de um evento de foco, que é a parte de fato arriscada em acessibilidade.

**Alternativas consideradas.** Abrir o diálogo também no `blur` mantém coerência absoluta, mas rouba um foco que o usuário acabou de mover deliberadamente. Aplicar "pular" como padrão no `blur` reintroduz a gravação sem confirmação que a decisão de escopo recusou.

### `ConfirmDialog` generalizado, não um componente novo

O componente passa a aceitar uma lista de ações além de abandonar, com o foco circulando sobre todas elas. É o único diálogo da aplicação e já é usado por `BackupManager` e `TaskManager`; um segundo componente duplicaria armadilha de foco, `role="alertdialog"`, Escape e restauração de foco — justamente o que a `TF-003` consertou.

### `until` é um instante, não uma data civil

Consistente com todo o resto do modelo, que persiste instantes ISO 8601 UTC. A interface oferece um seletor de data e grava o fim do dia local correspondente. Guardar uma data civil exigiria uma segunda convenção temporal no mesmo documento.

### Migração aditiva de esquema e de formato

`schemaVersion` passa a 3 e `formatVersion` do backup passa a 3. A migração da versão anterior é puramente aditiva: nenhuma tarefa existente ganha `recurrence` ou `seriesId`. A regra de rollback já estabelecida é preservada — uma versão anterior encontra dados da versão 3, recusa o formato e não sobrescreve.

## Risks / Trade-offs

- **O resolvedor civil ser implementado com a política de validação do formulário** → descartaria ocorrências em horas locais inexistentes. Mitigação: cenário dedicado na spec, teste com fuso que pratica horário de verão, e a proibição explícita de reusar `fromLocalDateTimeInput` na geração.
- **Regressão de acessibilidade no seletor de status**, o controle mais delicado do projeto → mitigação: os cenários existentes de Enter, `blur` e Escape são preservados integralmente para tarefas sem recorrência, e os novos cenários cobrem cada caminho do caso recorrente.
- **A série morrer numa falha de gravação parcial** → mitigação: `saveMany` como única gravação, com cenário de falha especificado.
- **Uma série sem fim acumular ocorrências concluídas indefinidamente** no armazenamento → aceito: o crescimento é de uma tarefa por ocorrência fechada, e a `TF-002` já oferece exportação. Retenção e limpeza pertencem à `TF-008`.
- **Sequência da série interrompida ao reabrir uma ocorrência terminal** → aceito e especificado: a reaberta não recupera a regra, e a ocorrência seguinte continua existindo.
- **O usuário esperar que a série "ande sozinha"** enquanto ele ignora as ocorrências → aceito e consequência direta de não gerar em segundo plano; a interface deve deixar claro que a próxima ocorrência nasce ao fechar a atual.

## Migration Plan

1. Elevar `CURRENT_SCHEMA_VERSION` para 3 em `stored-task-collection.ts`, com decoder da versão 3 e migração da versão 2 que apenas repassa as tarefas. Manter a recusa de versões desconhecidas.
2. Elevar `CURRENT_BACKUP_FORMAT_VERSION` para 3 em `backup-file.ts` e acrescentar a migração da versão 2 à cadeia existente, sem alterar as migrações anteriores.
3. Acrescentar `tests/fixtures/backups/taskflow-backup-v3.json` e manter os arquivos de referência das versões 1 e 2 legíveis.
4. Rollback: uma versão anterior do TaskFlow recusa `schemaVersion: 3` e `formatVersion: 3` e preserva os dados sem sobrescrever, como já ocorre entre as versões 1 e 2. Não há caminho de downgrade de dados, e isso é intencional.
