## Context

O modelo atual guarda cada lembrete como `{ id, offsetMinutes, lastTriggeredFor? }`, limita a criação aos offsets `0`, `15`, `60` e `1440`, calcula `dueAt - offsetMinutes` no domínio e projeta um alarme nomeado por tarefa e lembrete. `ReminderService` recarrega a tarefa ao receber o alarme, serializa operações dentro da instância do service worker e grava a ocorrência depois de notificar. Os dados ficam no envelope `schemaVersion: 1`; o backup público também está em `formatVersion: 1` e já possui um ponto de extensão para migrações.

O `PlannedReminder` e o adapter de `chrome.alarms` já trabalham com um `triggerAt` absoluto, portanto a mudança pode permanecer concentrada na representação persistida, nas funções puras que resolvem a ocorrência, na validação e na interface. O service worker Manifest V3 continua interrompível, alarmes podem ser atrasados pelo navegador e storage e notificações não participam de uma transação comum.

## Goals / Non-Goals

**Goals:**

- representar deslocamentos arbitrários e horários absolutos sem duplicar o fluxo de agendamento;
- preservar identidade, estado processado e backups dos lembretes existentes;
- tornar cálculo, validação, reconciliação, expiração e deduplicação funções determinísticas e testáveis;
- impedir tentativas repetidas e notificações retroativas dentro dos limites oferecidos pelas APIs do Chrome;
- manter as superfícies, o background e os adapters finos, sem novas permissões ou dependências.

**Non-Goals:**

- garantir entrega exatamente no segundo planejado ou acordar o dispositivo;
- oferecer semântica de calendário, recorrência, snooze ou fuso IANA por tarefa;
- resolver genericamente concorrência de escrita entre todos os contextos da extensão;
- substituir o modelo de um alarme por ocorrência por fila, heap ou dispatcher global;
- manter compatibilidade de escrita com versões antigas depois que o storage passar à versão 2.

## Decisions

### 1. União discriminada pequena para o agendamento persistido

`TaskReminder` passa a ser:

```ts
type TaskReminder =
  | {
      id: string;
      type: 'OFFSET';
      offsetMinutes: number;
      processedFor?: string;
    }
  | {
      id: string;
      type: 'AT';
      at: string;
      processedFor?: string;
    };
```

`OFFSET` é duração exata antes de `dueAt` e acompanha mudanças do prazo. `AT` é um instante ISO 8601 UTC e não se move quando o prazo muda. Ambos continuam pertencendo à tarefa e exigem `dueAt`; nenhuma entidade ou repository adicional é criado.

Uma função pura resolve o instante efetivo:

```text
OFFSET -> Date.parse(dueAt) - offsetMinutes * 60_000
AT     -> Date.parse(at)
```

O formulário envia uma lista discriminada de rascunhos. Em edição, cada item existente leva seu `id`; itens novos recebem UUID no domínio. Assim, alterar a configuração mantém a identidade do lembrete, enquanto a mudança do instante efetivo cria naturalmente outra ocorrência.

**Alternativas consideradas:** representar tudo como offset seria compatível, mas moveria silenciosamente um horário absoluto quando o prazo mudasse. Guardar somente `triggerAt` perderia a relação dos lembretes relativos com o prazo. Uma regra de calendário com data, hora e timezone anteciparia a complexidade da `TF-006`.

### 2. O instante efetivo é também a chave da ocorrência

`processedFor` guarda o `triggerAt` efetivo como ISO 8601 UTC. Uma ocorrência está pendente quando `processedFor` é diferente do instante efetivo atual. Essa única regra cobre alteração de prazo, alteração de offset, alteração de horário absoluto, reabertura e migração.

A validação limita a dez lembretes, exige `Number.isSafeInteger(offsetMinutes) && offsetMinutes >= 0`, exige `at <= dueAt`, rejeita itens novos ou alterados que já venceram e rejeita qualquer par cujo instante efetivo seja igual. Além disso, o instante efetivo resolvido precisa caber no intervalo representável por `Date` (`|epoch| <= 8.640.000.000.000.000`): um deslocamento seguro pode, combinado ao prazo, produzir um instante impossível de representar, e o sistema rejeita esse lembrete em vez de falhar ao liquidá-lo. Presets são somente atalhos de UI e produzem itens `OFFSET` normais.

**Alternativas consideradas:** manter `lastTriggeredFor` como prazo seria ambíguo para `AT` e não detectaria edição do offset com identidade preservada. Um hash opaco da configuração dificultaria backups legíveis e diagnóstico sem acrescentar garantia.

### 3. Um plano uniforme alimenta o scheduler existente

O domínio continuará produzindo `PlannedReminder { taskId, reminderId, triggerAt }`. O nome `taskflow:reminder:<taskId>:<reminderId>` permanece estável; mudar o instante com o mesmo nome substitui o alarme anterior. A comparação do `scheduledTime` recebido com o instante efetivo continua descartando eventos de planos antigos.

`reconcileTask` e `reconcileAll` continuam calculando o conjunto desejado, removendo alarmes gerenciados que não pertencem ao plano e criando somente os ausentes ou divergentes. Falha parcial não grava estado de agendamento dentro da tarefa: a configuração persistida permanece a fonte de verdade e uma nova execução converge o conjunto.

O modelo mantém um alarme por ocorrência. O limite de dez por tarefa reduz crescimento acidental, enquanto rejeições da API — inclusive por capacidade global — continuam gerando feedback de lembretes pendentes. Um dispatcher único evitaria o limite global de alarmes, mas aumentaria substancialmente o estado e os pontos de falha sem evidência de volume que o justifique.

### 4. Reconciliação e listeners permanecem compatíveis com Manifest V3

Os listeners de `runtime.onInstalled`, `runtime.onStartup` e `alarms.onAlarm` permanecem registrados sincronamente na inicialização do background. A reconciliação global ocorre na instalação, no início do perfil, após restauração e nos pontos de mutação já cobertos; mutações por tarefa reconciliam somente seu próprio prefixo.

Nenhum timer, cache ou fila em memória é fonte de verdade. A fila local de `ReminderService` continua apenas como exclusão mútua durante uma execução do worker; reinícios recuperam todo o estado por `chrome.storage.local` e `chrome.alarms`. Não será exigido `persistAcrossSessions`, evitando elevar a versão mínima do Chrome apenas para uma otimização que não substitui a reconciliação.

**Alternativas consideradas:** `setTimeout` não sobrevive à suspensão. Reconciliar e notificar em cada avaliação do worker pode competir com o próprio evento que o despertou e produzir notificações retroativas. Manter os gatilhos explícitos atuais é menor e preserva a semântica aprovada.

### 5. Entrega usa tentativa única com claim persistido

O tratamento de um alarme segue:

```text
recarregar tarefa
  -> resolver e validar ocorrência contra id, status, configuração e scheduledTime
  -> comparar clock com triggerAt + 5 minutos
  -> registrar processedFor condicionalmente nos dados mais recentes
  -> criar notificação com id determinístico taskId:reminderId:processedFor
  -> reconciliar a tarefa
```

O registro condicional deve reler a tarefa e só aplicar `processedFor` se a mesma ocorrência ainda estiver pendente; ele não pode salvar o snapshot lido antes da validação sobre uma edição mais recente. Eventos simultâneos continuam serializados no service worker. Se o claim falhar, não há notificação. Se `chrome.notifications.create` falhar depois do claim, a ocorrência permanece consumida e não é tentada novamente.

Essa ordem implementa `at-most-once`, priorizando ausência de duplicidade. O identificador determinístico da notificação é uma segunda barreira, pois uma criação repetida substituiria a notificação ativa com o mesmo ID. Não existe exatamente uma vez entre storage e notificações: persistir antes pode perder uma entrega se o worker morrer, enquanto notificar antes pode repeti-la se morrer antes da gravação.

**Alternativa considerada:** manter a ordem atual, notificar e depois gravar, favoreceria nova tentativa após falha, mas conservaria a janela de duplicação que esta Change deve fechar.

### 6. Cinco minutos definem o limite de atraso observável

O handler compara o relógio injetado com o instante efetivo. Eventos recebidos até cinco minutos depois ainda são entregáveis; eventos posteriores são marcados como processados sem notificação. Reconciliações e restaurações nunca sintetizam notificações para instantes passados: apenas liquidam a ocorrência.

A tolerância existente entre `scheduledTime` e horário recalculado continua separada: ela identifica alarme obsoleto, enquanto os cinco minutos medem atraso real de entrega. Ambas ficam em constantes de domínio e são cobertas por testes de fronteira.

**Alternativas consideradas:** tolerância zero tornaria o sistema excessivamente sensível ao agendamento de melhor esforço do Chrome. Tolerância configurável por usuário acrescentaria estado e UI sem necessidade demonstrada.

### 7. Fuso local somente na borda

`datetime-local` continua sendo convertido imediatamente pelo navegador para ISO 8601 UTC. Um lembrete `AT` persiste esse instante; se o fuso do dispositivo mudar, sua apresentação muda para a hora local equivalente, mas o disparo não muda. Um offset representa minutos reais: `1440` são exatamente 24 horas, inclusive ao atravessar mudança de horário de verão.

As conversões reutilizam os helpers atuais de data e validam ida e volta para rejeitar horários locais inexistentes. Não será adicionada biblioteca temporal nem identificador IANA.

**Alternativa considerada:** preservar relógio de parede e timezone exigiria resolver ambiguidades de horário de verão e recálculo futuro, o que pertence às regras de calendário da `TF-006`.

### 8. Interface usa presets mais uma lista editável

O bloco de lembretes do `TaskForm` mantém os quatro atalhos existentes e acrescenta uma lista de até dez itens. Cada item permite escolher “antes do prazo” com valor e unidade convertidos para minutos ou “data e hora” com `datetime-local`, além de remover o item. Ativar um preset insere ou remove o item `OFFSET` correspondente sem criar duplicata.

Erros são associados ao item e ao grupo de lembretes. O primeiro controle inválido continua recebendo foco, e inclusão, remoção, tipo e valores permanecem operáveis por teclado. A UI não acessa storage nem APIs Chrome diretamente.

**Alternativas consideradas:** uma caixa livre de minutos seria menor em código, mas não oferece uso adequado para horas e dias. Um construtor de regras de calendário extrapolaria a Change.

### 9. Storage e backup evoluem independentemente para a versão 2

O envelope interno passa a `schemaVersion: 2`. A leitura aceita v1, decodifica sua estrutura conhecida e migra cada lembrete para `OFFSET`. Quando `lastTriggeredFor` existe, calcula `processedFor = lastTriggeredFor - offsetMinutes`; isso preserva uma ocorrência processada mesmo se o prazo atual da tarefa já tiver mudado. A gravação sempre usa v2. Depois da decodificação, a coleção inteira é submetida às invariantes dos lembretes — limite de dez, exigência de prazo, identificadores de tarefa e de lembrete únicos, instantes efetivos representáveis e sem repetição e `AT` até o prazo — e qualquer violação recusa a coleção sem sobrescrever os dados. Versões futuras ou dados inválidos continuam recusados sem sobrescrita.

O backup passa a `formatVersion: 2` e adiciona a migração v1 -> v2 na cadeia existente. O arquivo de referência v1 permanece imutável e ganha-se uma fixture v2 com lembretes relativos, absolutos e processados. A validação estrita passa a aceitar somente a união atual, até dez itens e instantes efetivos únicos.

Storage e backup mantêm versões separadas mesmo avançando juntos nesta Change: um é detalhe interno e o outro é contrato público. Nenhum dado fora das tarefas entra no arquivo.

**Alternativas consideradas:** manter `schemaVersion: 1` apesar da forma incompatível impediria rollback seguro e quebraria o significado da versão. Exportar a forma antiga perderia lembretes absolutos. Renomear o backup sem migração quebraria a promessa existente de compatibilidade futura.

### 10. Comunicação e permissões não mudam

Popup, Side Panel e background continuam com instâncias próprias de repository e sincronização por `storage.onChanged`. Não será criada mensageria genérica nem centralização de todas as mutações no background. O claim condicional reduz a janela de escrita obsoleta no fluxo do alarme, mas não tenta solucionar conflitos simultâneos de edição do produto inteiro.

As permissões permanecem exatamente `activeTab`, `alarms`, `contextMenus`, `notifications`, `sidePanel` e `storage`, sem `host_permissions`. Não há dependência nova.

## Risks / Trade-offs

- [O worker termina depois do claim e antes da notificação] -> A ocorrência pode não aparecer, mas não será duplicada; essa é a consequência explícita de `at-most-once`.
- [Uma edição em outra superfície compete com o claim] -> O claim relê e valida a ocorrência imediatamente antes da gravação e evita persistir um snapshot antigo; a concorrência geral entre repositories permanece fora do escopo.
- [A API limita ou rejeita a criação de alarmes] -> A tarefa permanece persistida, a UI informa lembretes pendentes e a reconciliação posterior tenta convergir novamente; o limite de dez por tarefa reduz pressão acidental.
- [O dispositivo dorme por mais de cinco minutos] -> O alarme atrasado é consumido sem notificação para cumprir a regra contra avisos tardios.
- [Um horário local é ambíguo durante transição de horário de verão] -> A conversão segue a resolução do runtime do navegador e persiste o instante UTC resultante; regras explícitas de timezone ficam para a `TF-006`.
- [Uma versão antiga é reinstalada depois da migração] -> Ela recusa `schemaVersion: 2` e preserva os dados, mas não consegue editá-los; rollback funcional exige restaurar código v2 ou um backup v1 anterior.
- [A migração contém lembrete v1 estruturalmente aceito pelo storage, mas fora dos quatro presets] -> Todo inteiro não negativo aceito pelo decoder v1 é preservado como `OFFSET` enquanto o instante efetivo resultante for representável; um offset legado que produza instante impossível de representar faz a coleção ser recusada sem sobrescrita, e não é silenciosamente descartado nem convertido. A migração de backup continua respeitando a validação pública da versão 1.

## Migration Plan

1. Introduzir o novo modelo e as funções puras de resolução, ocorrência, validação, expiração e migração, mantendo testes v1 antes de alterar adapters ou UI.
2. Atualizar o decoder para ler v1 e v2, gravar somente v2 e verificar migração idempotente, dados futuros e rollback seguro.
3. Evoluir o formato de backup para v2, adicionar migração e fixture v2 e provar a leitura permanente da fixture v1.
4. Adaptar serviço, claim condicional, scheduler e notifier mantendo nomes de alarme e permissões.
5. Atualizar o formulário e os testes acessíveis dos presets e da lista personalizada.
6. Executar validação automatizada, build MV3 e validação manual de offset, horário absoluto, mudança de prazo, atraso e restauração.

Rollback antes de qualquer dado v2 pode simplesmente reverter a Change. Depois de uma gravação v2, a versão anterior deve recusar o envelope sem alterá-lo; não haverá migração destrutiva v2 -> v1 porque lembretes absolutos não têm representação fiel no formato antigo.
