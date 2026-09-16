# task-reminders Specification

## Purpose

Define lembretes locais confiáveis para tarefas com prazo, usando mecanismos persistentes do navegador que funcionem com o ciclo de vida interrompível de service workers Manifest V3.

## Requirements

### Requirement: Configuração de lembretes relativos ao prazo

O sistema SHALL permitir zero a dez lembretes distintos para uma tarefa com prazo. Cada lembrete SHALL possuir identificador único e SHALL ser configurado como um deslocamento inteiro não negativo em minutos antes do prazo ou como um instante absoluto igual ou anterior ao prazo. O sistema SHALL manter como atalhos os deslocamentos no horário do prazo, 15 minutos antes, 1 hora antes e 24 horas antes. Quando a tarefa carregar uma regra de recorrência, o sistema SHALL aceitar somente lembretes por deslocamento e SHALL recusar lembretes de instante absoluto, porque um instante fixo não acompanha as ocorrências seguintes da série.

#### Scenario: Lembretes são configurados

- **GIVEN** uma tarefa com prazo futuro
- **WHEN** o usuário salva deslocamentos personalizados e horários absolutos futuros distintos
- **THEN** o sistema persiste até dez lembretes e programa cada instante efetivo

#### Scenario: Atalhos existentes permanecem disponíveis

- **WHEN** o usuário configura um lembrete por um dos atalhos existentes
- **THEN** o sistema o persiste como deslocamento de `0`, `15`, `60` ou `1440` minutos antes do prazo

#### Scenario: Lembrete sem prazo é rejeitado

- **WHEN** o usuário configura qualquer lembrete sem informar prazo
- **THEN** o sistema não salva a alteração e informa que lembretes exigem um prazo

#### Scenario: Limite de lembretes é excedido

- **WHEN** o usuário tenta salvar mais de dez lembretes na mesma tarefa
- **THEN** o sistema não salva a alteração e informa o limite permitido

#### Scenario: Deslocamento inválido é rejeitado

- **WHEN** o usuário informa deslocamento negativo, fracionário ou que não possa ser representado com segurança em minutos
- **THEN** o sistema não salva a alteração e identifica o lembrete inválido

#### Scenario: Horário absoluto posterior ao prazo é rejeitado

- **WHEN** o usuário informa um horário absoluto posterior ao prazo da tarefa
- **THEN** o sistema não salva a alteração e informa que o lembrete deve ocorrer até o prazo

#### Scenario: Novo lembrete já vencido é rejeitado

- **WHEN** o usuário adiciona ou altera um lembrete cujo instante efetivo não está no futuro
- **THEN** o sistema não salva a alteração e informa que o horário do lembrete já passou

#### Scenario: Lembretes duplicados são evitados

- **WHEN** dois lembretes da tarefa, ainda que de tipos diferentes, resultam no mesmo instante efetivo
- **THEN** o sistema não salva a alteração e informa que os horários não podem se repetir

#### Scenario: Lembrete absoluto é recusado em tarefa recorrente

- **GIVEN** uma tarefa que carrega uma regra de recorrência
- **WHEN** o usuário tenta salvar um lembrete de instante absoluto nessa tarefa
- **THEN** o sistema não salva a alteração e informa que tarefas recorrentes aceitam somente lembretes por deslocamento

#### Scenario: Recorrência é recusada em tarefa com lembrete absoluto

- **GIVEN** uma tarefa com ao menos um lembrete de instante absoluto
- **WHEN** o usuário tenta salvar uma regra de recorrência nessa tarefa
- **THEN** o sistema não salva a alteração e informa que os lembretes de horário absoluto precisam ser removidos ou convertidos antes

### Requirement: Agendamento persistente

O sistema SHALL usar o mecanismo de alarmes da extensão como disparador e dados persistidos como fonte de verdade. O sistema não SHALL depender de timers em memória nem pressupor que o service worker permanece ativo.

#### Scenario: Service worker é suspenso

- **WHEN** o navegador suspende o service worker antes do instante de um lembrete
- **THEN** o alarme registrado pode reativar o worker e o lembrete continua elegível para entrega

#### Scenario: Agendamento falha após salvar a tarefa

- **WHEN** a tarefa é persistida, mas a API de alarmes rejeita o agendamento
- **THEN** o sistema mantém a configuração persistida, informa que o lembrete está pendente e permite nova tentativa por reconciliação

### Requirement: Reconciliação de alarmes

O sistema SHALL reconciliar idempotentemente os alarmes com os lembretes persistidos ao instalar ou iniciar a extensão, após criar, editar, concluir, cancelar ou excluir uma tarefa e após restaurar um backup. A reconciliação SHALL tratar os alarmes como projeção descartável dos dados persistidos e SHALL convergir após uma execução parcial ou repetida.

#### Scenario: Prazo é alterado

- **WHEN** o prazo de uma tarefa com lembretes é modificado
- **THEN** os alarmes relativos são reprogramados a partir do novo prazo
- **AND** os lembretes absolutos preservam seus instantes, desde que continuem válidos para o novo prazo

#### Scenario: Configuração de lembrete é alterada

- **WHEN** o usuário altera o deslocamento ou o instante absoluto de um lembrete e salva
- **THEN** o alarme anterior é removido e um alarme para o novo instante efetivo é programado

#### Scenario: Lembrete é removido

- **WHEN** o usuário remove uma configuração de lembrete e salva
- **THEN** o alarme correspondente deixa de existir

#### Scenario: Tarefa se torna terminal

- **WHEN** uma tarefa é concluída ou cancelada
- **THEN** seus alarmes pendentes são removidos

#### Scenario: Tarefa é reaberta

- **WHEN** uma tarefa terminal volta para `TODO` ou `IN_PROGRESS`
- **THEN** lembretes futuros ainda configurados e não processados são reconciliados e voltam a ser programados

#### Scenario: Tarefa é excluída

- **WHEN** uma tarefa é excluída
- **THEN** todos os alarmes associados a ela são removidos

#### Scenario: Extensão é iniciada com alarmes ausentes

- **WHEN** existem lembretes futuros persistidos sem seus alarmes correspondentes
- **THEN** o sistema recria os alarmes ausentes sem duplicar os que já correspondem ao plano

#### Scenario: Reconciliação é interrompida parcialmente

- **GIVEN** uma tentativa anterior criou ou removeu somente parte dos alarmes planejados
- **WHEN** a reconciliação é executada novamente
- **THEN** o sistema mantém os alarmes corretos, remove os obsoletos e cria os ainda ausentes

#### Scenario: Backup é restaurado

- **WHEN** um backup substitui todas as tarefas locais
- **THEN** o sistema remove os alarmes que não correspondem aos lembretes pendentes restaurados e programa os alarmes futuros esperados

### Requirement: Lembretes vencidos não disparam tardiamente

O sistema SHALL ignorar durante a reconciliação qualquer ocorrência cujo instante efetivo já passou e SHALL registrá-la como processada sem apresentar notificação retroativa. Ao receber um evento de alarme, o sistema somente SHALL entregar a ocorrência até cinco minutos depois do instante efetivo; após esse limite, SHALL registrá-la como processada sem notificar.

#### Scenario: Extensão inicia depois do horário do lembrete

- **WHEN** a reconciliação encontra um lembrete ainda pendente cujo instante efetivo já passou
- **THEN** o sistema não apresenta notificação retroativa e marca a ocorrência como processada

#### Scenario: Alarme chega dentro da tolerância

- **WHEN** um alarme válido é recebido até cinco minutos depois de seu instante efetivo
- **THEN** a ocorrência permanece elegível para entrega

#### Scenario: Alarme chega além da tolerância

- **WHEN** um alarme é recebido mais de cinco minutos depois de seu instante efetivo
- **THEN** o sistema não apresenta notificação e marca a ocorrência como processada

### Requirement: Entrega de notificação válida

Ao receber um alarme, o sistema SHALL recarregar a tarefa persistida e somente SHALL tentar apresentar uma notificação se a tarefa existir, estiver em `TODO` ou `IN_PROGRESS`, mantiver o lembrete, corresponder ao instante efetivo usado no agendamento, ainda estiver pendente e estiver dentro da tolerância de atraso. Antes da tentativa de notificação, o sistema SHALL registrar condicionalmente a ocorrência como processada nos dados persistidos mais recentes. A notificação SHALL usar um identificador determinístico da ocorrência.

#### Scenario: Alarme válido dispara

- **WHEN** chega o alarme de uma ocorrência válida, pendente e dentro da tolerância
- **THEN** o sistema registra a ocorrência como processada
- **AND** tenta mostrar uma notificação com o título da tarefa e informação de prazo

#### Scenario: Alarme obsoleto dispara

- **WHEN** um alarme corresponde a tarefa inexistente, terminal, com lembrete removido ou com horário alterado
- **THEN** o sistema não mostra notificação e remove ou substitui o alarme obsoleto pela projeção atual

#### Scenario: Evento de alarme é recebido novamente

- **WHEN** uma ocorrência já registrada como processada volta a ser recebida
- **THEN** o sistema não tenta mostrar uma segunda notificação para essa ocorrência

#### Scenario: Registro da ocorrência falha

- **WHEN** os dados persistidos não podem registrar condicionalmente a ocorrência como processada
- **THEN** o sistema não tenta apresentar a notificação

#### Scenario: Criação da notificação falha após o registro

- **WHEN** a ocorrência foi registrada como processada, mas a API de notificações rejeita a criação
- **THEN** o sistema não tenta novamente a mesma ocorrência automaticamente

### Requirement: Semântica temporal dos lembretes personalizados

O sistema SHALL calcular lembretes relativos como durações exatas antes do prazo e SHALL preservar lembretes absolutos como instantes exatos. Datas e horas absolutas SHALL ser recebidas e exibidas no fuso local do navegador e SHALL ser persistidas em ISO 8601 UTC, sem associar um fuso IANA à tarefa.

#### Scenario: Lembrete relativo acompanha o prazo

- **GIVEN** uma tarefa com lembrete relativo futuro
- **WHEN** o usuário altera o prazo e mantém o lembrete válido
- **THEN** o instante do lembrete é recalculado pelo mesmo número de minutos antes do novo prazo

#### Scenario: Lembrete absoluto não acompanha o prazo

- **GIVEN** uma tarefa com lembrete absoluto futuro
- **WHEN** o usuário altera o prazo para outro instante posterior ao lembrete
- **THEN** o lembrete permanece no mesmo instante UTC

#### Scenario: Horário local é persistido como instante

- **WHEN** o usuário informa uma data e hora absoluta válida no fuso local do navegador e salva a tarefa
- **THEN** o sistema persiste o instante equivalente em ISO 8601 UTC
- **AND** o apresenta posteriormente convertido para o fuso local então vigente

#### Scenario: Deslocamento atravessa mudança de fuso

- **WHEN** um deslocamento de `1440` minutos é calculado em período que atravessa uma mudança de fuso ou horário de verão
- **THEN** o lembrete ocorre exatamente 24 horas antes do prazo, sem interpretação como dia civil anterior

### Requirement: Compatibilidade dos lembretes persistidos

O sistema SHALL migrar automaticamente a coleção persistida da versão 1 para a versão 2. Cada lembrete da versão 1 SHALL tornar-se um lembrete relativo com o mesmo identificador e deslocamento; quando houver `lastTriggeredFor`, a migração SHALL preservar a ocorrência processada convertendo o prazo registrado em seu instante efetivo. Dados de versão futura ou inválidos não SHALL ser sobrescritos.

#### Scenario: Lembrete pendente da versão 1 é migrado

- **GIVEN** uma coleção da versão 1 com lembrete sem `lastTriggeredFor`
- **WHEN** a coleção é lida pela versão 2
- **THEN** o lembrete é preservado como relativo, com o mesmo identificador e deslocamento, e permanece pendente

#### Scenario: Lembrete processado da versão 1 é migrado

- **GIVEN** uma coleção da versão 1 com `lastTriggeredFor` e deslocamento conhecido
- **WHEN** a coleção é lida pela versão 2
- **THEN** o sistema registra como processado o instante resultante de `lastTriggeredFor` menos o deslocamento

#### Scenario: Rollback encontra dados da versão 2

- **WHEN** uma versão anterior do TaskFlow encontra a coleção persistida na versão 2
- **THEN** ela recusa o formato e preserva os dados sem sobrescrevê-los

### Requirement: Transporte de lembretes para a próxima ocorrência

Ao gerar a próxima ocorrência de uma série, o sistema SHALL copiar para ela os lembretes por deslocamento da ocorrência fechada, preservando cada deslocamento em minutos, atribuindo identificador próprio a cada lembrete copiado e não transportando a marca de ocorrência processada. Os lembretes da nova ocorrência SHALL ser reconciliados a partir do prazo dela pelas regras já definidas de agendamento persistente e reconciliação de alarmes. Os lembretes da ocorrência fechada MUST NOT voltar a ficar pendentes.

#### Scenario: Lembretes por deslocamento acompanham a nova ocorrência

- **GIVEN** uma ocorrência de série com lembretes de 60 e 1440 minutos antes do prazo, ambos já processados
- **WHEN** o usuário conclui a ocorrência e a próxima é gerada
- **THEN** a nova ocorrência recebe lembretes de 60 e 1440 minutos antes do novo prazo
- **AND** esses lembretes ficam pendentes e têm identificadores próprios

#### Scenario: Alarmes da nova ocorrência são programados

- **WHEN** a próxima ocorrência é persistida com lembretes pendentes futuros
- **THEN** o sistema programa os alarmes correspondentes ao prazo dessa ocorrência

#### Scenario: Alarmes da ocorrência fechada são removidos

- **WHEN** a ocorrência que gerou a próxima passa a `DONE` ou `CANCELLED`
- **THEN** seus alarmes pendentes são removidos e ela não recebe notificações

#### Scenario: Lembrete copiado com instante já passado é liquidado

- **GIVEN** uma nova ocorrência cujo instante efetivo de um lembrete copiado já passou no momento da geração
- **WHEN** a ocorrência é persistida
- **THEN** o sistema registra essa ocorrência de lembrete como processada, sem notificação retroativa
