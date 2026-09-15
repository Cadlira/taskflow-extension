## MODIFIED Requirements

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

## ADDED Requirements

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
