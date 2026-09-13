## Context

A fundação atual contém entrypoints WXT carregáveis para popup, Side Panel e background, uma primeira porta de aplicação para navegação e qualidade automatizada. Ainda não existem entidade `Task`, persistência ou comportamento funcional do MVP. Consulte `proposal.md` para a motivação e as specs delta para os contratos observáveis.

O Manifest V3 pode suspender o service worker a qualquer momento; popup e Side Panel possuem ciclos de vida independentes. Os dados precisam permanecer locais, nenhuma permissão de host deve ser solicitada e a arquitetura deve permitir trocar o storage por uma API futura sem criar camadas enterprise.

## Goals / Non-Goals

**Goals:**

- manter regras de tarefa e de prazo testáveis sem Vue ou APIs Chrome;
- disponibilizar os mesmos casos de uso ao popup e ao Side Panel;
- concentrar serialização, migração e observação do storage em um adapter;
- tornar lembretes recuperáveis após suspensão/reinício do service worker;
- manter uma composição pequena e explícita, sem framework de DI.

**Non-Goals:**

- criar contratos de backend ou um mecanismo de sincronização ainda inexistente;
- resolver edição concorrente distribuída ou manter histórico de revisões;
- adicionar roteamento complexo, design system próprio ou board Kanban;
- implementar captura da aba ativa, menu de contexto ou interpretação de texto;
- criar abstrações genéricas para integrações futuras sem consumidor no MVP.

## Decisions

### 1. Modelo de domínio puro e timestamps UTC

`Task` será um tipo/entidade independente de Vue, Pinia, WXT e Chrome:

```ts
type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface Task {
  id: string;
  title: string;
  description?: string;
  requester?: string;
  assignee?: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt?: string;
  reminders: TaskReminder[];
  tags: string[];
  sourceUrl?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}
```

IDs serão gerados com `crypto.randomUUID()`: funcionam offline e reduzem colisões em uma sincronização futura. Instantes serão ISO 8601 UTC; conversão para o fuso local ocorrerá somente na borda da UI.

Não serão adicionados `cancelledAt`, `deletedAt`, versão por tarefa ou metadados de sync: nenhum comportamento atual os consome. Exclusão será física e cancelamento será representado pelo status.

**Alternativas consideradas:** sequência incremental acopla a identidade a uma única base; IDs derivados de timestamp aumentam risco de colisão. Datas locais sem offset recriam o problema de ambiguidade de fuso.

### 2. Lembrete como deslocamento persistido

Cada lembrete terá `id`, `offsetMinutes` e `lastTriggeredFor?: string`. `offsetMinutes` será contado antes de `dueAt`, com `0`, `15`, `60` e `1440` expostos no MVP. `lastTriggeredFor` guardará o instante de prazo para o qual a ocorrência foi processada, permitindo reagendamento quando o prazo mudar e impedindo duplicidade.

Uma futura Change poderá transformar o agendamento em união discriminada para horário absoluto/personalizado sem mudar a entidade `Task` nem os casos de uso principais.

**Alternativas consideradas:** guardar somente o instante absoluto perde a relação com alterações de prazo; criar uma entidade completa de recorrência agora seria overengineering.

### 3. Casos de uso e portas proporcionais

A aplicação terá casos de uso pequenos para listar, criar, atualizar, excluir e alterar status, apoiados por:

- `TaskRepository`: leitura, escrita, exclusão e assinatura de alterações;
- `ReminderScheduler`: reconciliar alarmes de uma tarefa e reconciliar todo o conjunto;
- `Clock` e `IdGenerator`: injetáveis onde regras temporais/identidade exigirem teste determinístico.

Validação e transições ficarão em funções de domínio puras. A composição concreta será feita em módulos simples importados pelos entrypoints.

**Alternativas consideradas:** acesso direto ao storage dentro de componentes impediria testes e troca futura; um framework de DI e uma classe por comando adicionariam cerimônia sem benefício.

### 4. Envelope versionado no storage

O adapter Chrome armazenará uma única chave namespaced, `taskflow.tasks`, com envelope:

```ts
interface StoredTaskCollection {
  schemaVersion: 1;
  tasks: Task[];
}
```

O adapter validará/normalizará dados lidos e será o único responsável pelo formato persistido. Migrações futuras serão encadeadas por `schemaVersion`. A interface de repository não exporá conceitos do Chrome.

**Alternativas consideradas:** uma chave por tarefa complica consultas, reconciliação e migração no volume pessoal esperado; IndexedDB é desnecessário para o MVP; usar diretamente o helper WXT na UI apenas troca uma API acoplada por outra.

### 5. Pinia apenas para estado de apresentação

Cada superfície terá uma store Pinia que carrega tarefas pelos casos de uso e mantém carregamento, erro, pesquisa, filtros, ordenação e seleção. O repository é a fonte persistente. A store observará mudanças externas por uma assinatura implementada com `browser.storage.onChanged`.

Filtros e ordenações serão seletores puros, testados separadamente. Popup e Side Panel não compartilharão memória; convergirão pelo storage.

**Alternativas consideradas:** estado Vue local seria suficiente para o popup, mas tornaria o Side Panel e seus filtros/formulários mais difíceis de coordenar; usar Pinia como repository misturaria persistência e apresentação.

### 6. Popup e Side Panel com componentes focados

O popup oferecerá título, prazo, solicitante, responsável e prioridade. Envio bem-sucedido limpa o formulário e mostra confirmação; erro preserva os dados. “Abrir gerenciamento” continuará chamando a porta já existente para o Side Panel.

O Side Panel concentrará lista, busca, filtros, ordenação e formulário completo. Um modal/diálogo simples fará confirmação de exclusão. Não haverá roteador no MVP; estados de lista/edição serão suficientes.

**Alternativas consideradas:** colocar gerenciamento completo no popup restringe área e perde estado ao fechar; página própria interrompe mais a navegação e não agrega capacidade necessária agora.

### 7. Alarmes idempotentes no background

O nome do alarme será determinístico: `taskflow:reminder:<taskId>:<reminderId>`. O scheduler calcula `dueAt - offsetMinutes`, cria alarmes futuros e remove alarmes obsoletos. Concluir, cancelar ou excluir remove alarmes da tarefa.

No `runtime.onInstalled` e `runtime.onStartup`, o background lista tarefas e reconcilia alarmes. Em `alarms.onAlarm`, recarrega a tarefa, valida identidade/configuração/status/prazo e verifica `lastTriggeredFor` antes de notificar. Depois registra a ocorrência processada. Alarmes passados encontrados na reconciliação também são marcados como processados, sem notificação tardia.

Falha ao criar alarme não desfaz uma tarefa já salva: a UI apresenta aviso, e reconciliações posteriores tentam recuperar o agendamento. Essa escolha prioriza não perder a tarefa e mantém estado suficiente para reparo.

**Alternativas consideradas:** `setTimeout` é incompatível com suspensão do service worker; manter somente alarmes sem configuração persistida impede reconstrução e validação; mensageria genérica entre todas as superfícies não é necessária.

### 8. Permissões e segurança

Serão adicionadas `storage`, `alarms` e `notifications`; `sidePanel` será mantida. Não serão adicionadas `activeTab`, `tabs`, `scripting`, `contextMenus` nem `host_permissions`. `sourceUrl` será digitada manualmente e validada como HTTP(S).

### 9. Estratégia de testes

- domínio: validação, normalização, transições, atraso/proximidade, pesquisa e ordenação;
- aplicação: casos de uso com fakes de repository, scheduler, relógio e gerador de IDs;
- infraestrutura: adapter de storage e alarmes com fake browser do WXT;
- UI: Quick Add, lista, filtros, estados de erro e confirmação com Vue Test Utils;
- integração de build: validar Manifest MV3 gerado e permissões esperadas.

## Risks / Trade-offs

- **[Atualização concorrente entre popup e Side Panel pode causar última escrita vencedora]** → repository centraliza escrita e as superfícies reagem a `storage.onChanged`; conflitos distribuídos ficam para a Change de sincronização.
- **[Alarmes do Chrome podem atrasar por economia de energia]** → comunicar lembrete como melhor esforço, validar o estado atual no disparo e não prometer precisão de relógio em segundo.
- **[Envelope único regrava a coleção]** → adequado ao volume pessoal do MVP; medir antes de migrar para IndexedDB ou registros separados.
- **[Limite fixo de 24 horas para “próxima do vencimento” pode não servir a todos]** → manter regra pura e documentada; tornar configurável em Change futura se necessário.
- **[Falha entre persistir e agendar cria estado temporariamente inconsistente]** → apresentar aviso e usar reconciliação idempotente em inicialização e alterações.
- **[Pinia adiciona dependência antes de grande complexidade de UI]** → uso restrito a estado de apresentação; não criar plugins ou padrões adicionais.

## Migration Plan

1. Introduzir domínio, portas e casos de uso sem alterar o Manifest.
2. Implementar e testar o repository com envelope `schemaVersion: 1`.
3. Implementar as superfícies Vue e conectar alterações do storage.
4. Implementar scheduler/background, então adicionar `storage`, `alarms` e `notifications` ao Manifest.
5. Executar lint, typecheck, testes, cobertura informativa e build; inspecionar o Manifest gerado.
6. Carregar `.output/chrome-mv3` manualmente e validar Quick Add, CRUD, sincronização entre superfícies e lembretes.

Como não há dados de versão anterior, nenhuma migração de usuário é necessária. Em rollback, remover o código funcional e as três permissões novas; a chave local poderá permanecer sem efeito para evitar perda de dados.
