# task-reminders Specification

## Purpose

Define lembretes locais confiáveis para tarefas com prazo, usando mecanismos persistentes do navegador que funcionem com o ciclo de vida interrompível de service workers Manifest V3.

## Requirements

### Requirement: Configuração de lembretes relativos ao prazo

O sistema SHALL permitir zero ou mais lembretes distintos para uma tarefa com prazo, escolhidos entre: no horário do prazo, 15 minutos antes, 1 hora antes e 1 dia antes. Um lembrete SHALL ser identificado de forma única dentro da tarefa.

#### Scenario: Lembretes são configurados

- **WHEN** o usuário salva uma tarefa com prazo e uma ou mais opções de lembrete
- **THEN** o sistema persiste cada lembrete selecionado e programa seu instante relativo ao prazo

#### Scenario: Lembrete sem prazo é rejeitado

- **WHEN** o usuário seleciona um lembrete sem informar prazo
- **THEN** o sistema não salva a alteração e informa que lembretes exigem um prazo

#### Scenario: Lembretes duplicados são evitados

- **WHEN** a mesma opção de lembrete é selecionada mais de uma vez
- **THEN** o sistema mantém uma única configuração para aquele deslocamento

### Requirement: Agendamento persistente

O sistema SHALL usar o mecanismo de alarmes da extensão como disparador e dados persistidos como fonte de verdade. O sistema não SHALL depender de timers em memória nem pressupor que o service worker permanece ativo.

#### Scenario: Service worker é suspenso

- **WHEN** o navegador suspende o service worker antes do instante de um lembrete
- **THEN** o alarme registrado pode reativar o worker e o lembrete continua elegível para entrega

#### Scenario: Agendamento falha após salvar a tarefa

- **WHEN** a tarefa é persistida, mas a API de alarmes rejeita o agendamento
- **THEN** o sistema mantém a configuração persistida, informa que o lembrete está pendente e permite nova tentativa por reconciliação

### Requirement: Reconciliação de alarmes

O sistema SHALL reconciliar alarmes com os lembretes persistidos ao instalar ou iniciar a extensão e após criar, editar, concluir, cancelar ou excluir uma tarefa.

#### Scenario: Prazo é alterado

- **WHEN** o prazo de uma tarefa com lembretes é modificado
- **THEN** os alarmes anteriores são removidos e novos alarmes são programados para os instantes recalculados

#### Scenario: Lembrete é removido

- **WHEN** o usuário remove uma configuração de lembrete e salva
- **THEN** o alarme correspondente deixa de existir

#### Scenario: Tarefa se torna terminal

- **WHEN** uma tarefa é concluída ou cancelada
- **THEN** seus alarmes pendentes são removidos

#### Scenario: Tarefa é reaberta

- **WHEN** uma tarefa terminal volta para `TODO` ou `IN_PROGRESS`
- **THEN** lembretes futuros ainda configurados são reconciliados e voltam a ser programados

#### Scenario: Tarefa é excluída

- **WHEN** uma tarefa é excluída
- **THEN** todos os alarmes associados a ela são removidos

#### Scenario: Extensão é iniciada com alarmes ausentes

- **WHEN** existem lembretes futuros persistidos sem seus alarmes correspondentes
- **THEN** o sistema recria os alarmes ausentes

### Requirement: Lembretes vencidos não disparam tardiamente

O sistema SHALL ignorar configurações cujo instante calculado já passou durante uma reconciliação e SHALL registrar que aquela ocorrência não está mais pendente, evitando notificações tardias ou duplicadas.

#### Scenario: Extensão inicia depois do horário do lembrete

- **WHEN** a reconciliação encontra um lembrete ainda marcado como pendente cujo instante já passou
- **THEN** o sistema não apresenta uma notificação retroativa e marca a ocorrência como processada

### Requirement: Entrega de notificação válida

Ao receber um alarme, o sistema SHALL recarregar a tarefa persistida e somente SHALL apresentar uma notificação se a tarefa existir, estiver em `TODO` ou `IN_PROGRESS`, mantiver aquele lembrete e ainda corresponder ao prazo usado no agendamento.

#### Scenario: Alarme válido dispara

- **WHEN** chega o horário de um alarme que ainda corresponde a uma tarefa ativa
- **THEN** o sistema mostra uma notificação com o título da tarefa e informação de prazo e registra a ocorrência como processada

#### Scenario: Alarme obsoleto dispara

- **WHEN** um alarme corresponde a tarefa inexistente, terminal ou com configuração alterada
- **THEN** o sistema não mostra notificação e remove o alarme obsoleto

#### Scenario: Evento de alarme é recebido novamente

- **WHEN** uma ocorrência já registrada como processada volta a ser recebida
- **THEN** o sistema não mostra uma segunda notificação para a mesma ocorrência
