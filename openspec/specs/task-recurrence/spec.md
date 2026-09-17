# task-recurrence Specification

## Purpose

Define séries de tarefas recorrentes totalmente locais, com regras diárias, semanais e mensais, geração da próxima ocorrência ao fechar a ocorrência aberta e distinção entre editar uma ocorrência isolada e editar a série, sem motor de calendário, sem agendamento adicional e sem permissões novas.

## Requirements

### Requirement: Regra de recorrência da tarefa

O sistema SHALL permitir associar no máximo uma regra de recorrência a uma tarefa e SHALL exigir que essa tarefa tenha prazo. A regra SHALL usar uma das frequências `DAILY`, com intervalo inteiro de 1 a 365 dias; `WEEKLY`, com ao menos um e no máximo sete dias da semana distintos; ou `MONTHLY`, com dia do mês inteiro de 1 a 31. A regra MAY definir um instante limite `until` em ISO 8601 UTC, que SHALL ser igual ou posterior ao instante agendado da ocorrência aberta. Regras inválidas não SHALL ser persistidas.

#### Scenario: Recorrência diária é configurada

- **GIVEN** uma tarefa com prazo
- **WHEN** o usuário salva uma recorrência `DAILY` com intervalo de 1 dia
- **THEN** o sistema persiste a regra na tarefa

#### Scenario: Recorrência semanal com vários dias

- **WHEN** o usuário salva uma recorrência `WEEKLY` com segunda e quinta selecionadas
- **THEN** o sistema persiste a regra com os dois dias da semana

#### Scenario: Recorrência mensal é configurada

- **WHEN** o usuário salva uma recorrência `MONTHLY` com dia do mês 10
- **THEN** o sistema persiste a regra com o dia do mês informado

#### Scenario: Recorrência sem prazo é rejeitada

- **WHEN** o usuário tenta salvar uma recorrência em uma tarefa sem prazo
- **THEN** o sistema não salva a alteração e informa que a recorrência exige um prazo

#### Scenario: Intervalo diário inválido é rejeitado

- **WHEN** o usuário informa intervalo diário zero, negativo, fracionário ou maior que 365
- **THEN** o sistema não salva a alteração e identifica o campo inválido

#### Scenario: Recorrência semanal sem dia é rejeitada

- **WHEN** o usuário salva uma recorrência `WEEKLY` sem nenhum dia da semana selecionado
- **THEN** o sistema não salva a alteração e informa que ao menos um dia é obrigatório

#### Scenario: Dia do mês inválido é rejeitado

- **WHEN** o usuário informa dia do mês menor que 1 ou maior que 31
- **THEN** o sistema não salva a alteração e identifica o campo inválido

#### Scenario: Limite anterior ao instante agendado é rejeitado

- **WHEN** o usuário informa um `until` anterior ao instante agendado da ocorrência aberta
- **THEN** o sistema não salva a alteração e informa que o limite deve ser igual ou posterior ao prazo

### Requirement: Identidade da série

O sistema SHALL identificar cada série por um `seriesId` único, atribuído quando a recorrência é configurada pela primeira vez, e SHALL preservá-lo em todas as ocorrências geradas a partir dela, inclusive nas concluídas e canceladas. No máximo uma ocorrência da série SHALL carregar a regra de recorrência em um dado momento. Remover a recorrência de uma tarefa não SHALL remover seu `seriesId`.

#### Scenario: Primeira ocorrência recebe a série

- **GIVEN** uma tarefa com prazo e sem recorrência
- **WHEN** o usuário salva uma regra de recorrência válida
- **THEN** o sistema atribui um `seriesId` à tarefa e persiste a regra nela

#### Scenario: Ocorrência fechada preserva a série e perde a regra

- **GIVEN** uma ocorrência aberta que carrega a regra
- **WHEN** a ocorrência é fechada e a próxima é gerada
- **THEN** a ocorrência fechada mantém o mesmo `seriesId` e não carrega mais a regra
- **AND** somente a nova ocorrência carrega a regra

#### Scenario: Ocorrência fechada é reaberta

- **GIVEN** uma ocorrência `DONE` de uma série cuja ocorrência seguinte já existe
- **WHEN** o usuário a reabre para `TODO`
- **THEN** ela volta a ficar ativa mantendo o `seriesId` e sem receber a regra de volta
- **AND** nenhuma ocorrência nova é gerada e a ocorrência seguinte permanece inalterada

### Requirement: Cálculo da próxima ocorrência

O sistema SHALL calcular o instante agendado da próxima ocorrência a partir do instante agendado da ocorrência atual, e não do instante em que ela foi fechada. Para `DAILY`, SHALL avançar o número de dias do intervalo; para `WEEKLY`, SHALL avançar para o próximo dia da semana presente na regra; para `MONTHLY`, SHALL avançar para o mesmo dia do mês no mês seguinte, ajustado para o último dia do mês quando aquele dia não existir. O avanço SHALL preservar a hora local do dia e SHALL ser repetido enquanto o instante calculado não for futuro. Quando o instante calculado for posterior a `until`, a série não SHALL gerar nova ocorrência.

#### Scenario: Recorrência diária avança um dia

- **GIVEN** uma ocorrência diária de intervalo 1 agendada para hoje às 9h locais
- **WHEN** a próxima ocorrência é calculada
- **THEN** o instante agendado é amanhã às 9h locais

#### Scenario: Intervalo diário preserva a fase

- **GIVEN** uma ocorrência diária de intervalo 3 agendada para o dia 1
- **WHEN** as próximas ocorrências são calculadas em sequência
- **THEN** os instantes agendados caem nos dias 4, 7 e 10, sempre na mesma hora local

#### Scenario: Recorrência semanal vai para o próximo dia do conjunto

- **GIVEN** uma ocorrência semanal com segunda e quinta, agendada para uma segunda-feira
- **WHEN** a próxima ocorrência é calculada
- **THEN** o instante agendado é a quinta-feira da mesma semana, na mesma hora local

#### Scenario: Recorrência semanal com um único dia avança uma semana

- **GIVEN** uma ocorrência semanal apenas às sextas, agendada para uma sexta-feira
- **WHEN** a próxima ocorrência é calculada
- **THEN** o instante agendado é a sexta-feira seguinte, na mesma hora local

#### Scenario: Dia do mês inexistente é ajustado

- **GIVEN** uma ocorrência mensal de dia 31 agendada para 31 de janeiro
- **WHEN** a próxima ocorrência é calculada
- **THEN** o instante agendado é o último dia de fevereiro, na mesma hora local

#### Scenario: Ajuste do dia do mês não é permanente

- **GIVEN** uma ocorrência mensal de dia 31 agendada para o último dia de fevereiro por ajuste
- **WHEN** a próxima ocorrência é calculada
- **THEN** o instante agendado é 31 de março, na mesma hora local

#### Scenario: Fechar atrasado não desloca a série

- **GIVEN** uma ocorrência semanal de segunda-feira, fechada somente na quarta-feira
- **WHEN** a próxima ocorrência é calculada
- **THEN** o instante agendado é a segunda-feira seguinte, e não a quarta-feira seguinte

#### Scenario: Ocorrências perdidas são puladas

- **GIVEN** uma ocorrência diária agendada há dez dias e nunca fechada
- **WHEN** o usuário a fecha e a próxima ocorrência é calculada
- **THEN** o sistema gera uma única ocorrência, com o primeiro instante agendado que seja futuro
- **AND** nenhuma ocorrência é criada para os dias já passados

#### Scenario: Limite da série encerra a recorrência

- **GIVEN** uma ocorrência cuja próxima data agendada seria posterior a `until`
- **WHEN** o usuário fecha a ocorrência
- **THEN** nenhuma ocorrência nova é gerada e a série termina

#### Scenario: Hora local é preservada na mudança de horário de verão

- **GIVEN** uma série diária agendada às 9h locais e uma mudança de horário de verão entre duas ocorrências
- **WHEN** a próxima ocorrência é calculada
- **THEN** o instante agendado continua às 9h locais, ainda que o intervalo em horas absolutas não seja de exatamente 24 horas

#### Scenario: Hora local inexistente não descarta a ocorrência

- **GIVEN** uma série cuja hora local do dia não existe na data calculada por causa do avanço do horário de verão
- **WHEN** a próxima ocorrência é calculada
- **THEN** o sistema gera a ocorrência no instante que o fuso local resolve para aquela data e hora
- **AND** não descarta nem duplica a ocorrência

### Requirement: Geração da próxima ocorrência

Ao concluir a ocorrência que carrega a regra, ou ao pular uma ocorrência cancelada, o sistema SHALL gerar a próxima ocorrência como uma nova tarefa com identificador próprio, status `TODO`, sem `completedAt`, com o mesmo `seriesId`, com a regra de recorrência transferida e com os campos editáveis copiados da ocorrência fechada. As subtarefas SHALL ser copiadas na mesma ordem e com os mesmos títulos, cada uma com identificador próprio e desmarcada, sem alterar as subtarefas da ocorrência fechada. A ocorrência fechada e a nova ocorrência SHALL ser persistidas em uma única gravação, de modo que uma falha não deixe a série sem ocorrência aberta.

#### Scenario: Concluir gera a próxima ocorrência

- **GIVEN** uma ocorrência aberta de uma série sem limite atingido
- **WHEN** o usuário a conclui
- **THEN** a ocorrência passa a `DONE` com `completedAt` registrado
- **AND** o sistema cria uma nova ocorrência `TODO` com o instante agendado seguinte

#### Scenario: Nova ocorrência herda os campos editáveis

- **WHEN** a próxima ocorrência é gerada
- **THEN** ela recebe título, descrição, solicitante, responsável, prioridade, tags e URL de origem iguais aos da ocorrência fechada
- **AND** recebe um identificador próprio e novos `createdAt` e `updatedAt`

#### Scenario: Nova ocorrência recebe subtarefas desmarcadas

- **GIVEN** uma ocorrência aberta com as subtarefas "A" marcada e "B" desmarcada
- **WHEN** o usuário a conclui
- **THEN** a nova ocorrência tem as subtarefas "A" e "B", nessa ordem, desmarcadas e com identificadores diferentes dos originais
- **AND** a ocorrência fechada mantém "A" marcada e "B" desmarcada

#### Scenario: Gravação da geração falha

- **WHEN** a gravação que fecha a ocorrência e cria a seguinte é rejeitada pelo armazenamento
- **THEN** nenhuma das duas alterações é persistida
- **AND** o sistema informa que a alteração não foi salva

#### Scenario: Tarefa sem recorrência não gera ocorrência

- **WHEN** o usuário conclui uma tarefa sem regra de recorrência
- **THEN** nenhuma ocorrência nova é criada

### Requirement: Pular ou encerrar ao cancelar uma ocorrência

Cancelar uma ocorrência que carrega a regra SHALL exigir que o usuário escolha explicitamente entre pular a ocorrência e encerrar a série, tanto pela ação de cancelar do cartão quanto pelo seletor de status. Pular SHALL registrar a ocorrência como `CANCELLED` e gerar a próxima; encerrar SHALL registrar a ocorrência como `CANCELLED`, remover a regra e não gerar nova ocorrência. Abandonar a escolha MUST NOT persistir alteração alguma.

#### Scenario: Usuário pula a ocorrência

- **GIVEN** uma ocorrência aberta de uma série
- **WHEN** o usuário cancela a tarefa e escolhe pular esta ocorrência
- **THEN** a ocorrência passa a `CANCELLED` sem `completedAt`
- **AND** o sistema cria a próxima ocorrência da série

#### Scenario: Usuário encerra a série

- **WHEN** o usuário cancela a tarefa e escolhe encerrar a série
- **THEN** a ocorrência passa a `CANCELLED` e deixa de carregar a regra
- **AND** nenhuma ocorrência nova é criada

#### Scenario: Usuário abandona a escolha

- **WHEN** o usuário fecha a confirmação sem escolher pular nem encerrar
- **THEN** a tarefa permanece com o status persistido anterior
- **AND** nenhuma ocorrência nova é criada

### Requirement: Editar apenas esta ocorrência ou toda a série

Alterar o prazo somente desta ocorrência SHALL preservar o instante agendado usado para calcular as próximas. Alterar a regra de recorrência SHALL valer a partir da ocorrência aberta, sem modificar ocorrências já fechadas. Alterar os demais campos editáveis SHALL afetar apenas a ocorrência editada.

#### Scenario: Adiar apenas esta ocorrência

- **GIVEN** uma ocorrência semanal de segunda-feira
- **WHEN** o usuário move o prazo apenas desta ocorrência para a quarta-feira
- **THEN** o prazo exibido passa a ser a quarta-feira
- **AND** o instante agendado da série permanece na segunda-feira

#### Scenario: Próxima ocorrência ignora o adiamento

- **GIVEN** uma ocorrência semanal de segunda-feira adiada apenas nesta ocorrência para quarta-feira
- **WHEN** o usuário a conclui
- **THEN** a próxima ocorrência é agendada para a segunda-feira seguinte

#### Scenario: Alterar a regra vale da ocorrência aberta em diante

- **GIVEN** uma série semanal às segundas com ocorrências já concluídas
- **WHEN** o usuário altera a regra para terças e salva
- **THEN** a ocorrência aberta passa a usar a nova regra
- **AND** as ocorrências já concluídas permanecem inalteradas

#### Scenario: Editar campos afeta apenas a ocorrência

- **WHEN** o usuário altera o título da ocorrência aberta
- **THEN** somente essa ocorrência tem o título alterado
- **AND** as ocorrências já fechadas mantêm o título anterior

### Requirement: Encerramento da série

O sistema SHALL permitir encerrar a série a partir da ocorrência aberta, removendo a regra e mantendo a tarefa como tarefa comum. Excluir a ocorrência que carrega a regra SHALL encerrar a série, e a confirmação de exclusão SHALL informar essa consequência. A ocorrência excluída SHALL ir para a lixeira com sua regra; restaurá-la da lixeira ou desfazer a exclusão SHALL devolvê-la com a regra, retomando a série a partir dela, sem gerar ocorrências no momento da restauração.

#### Scenario: Encerrar a série mantém a tarefa

- **GIVEN** uma ocorrência aberta que carrega a regra
- **WHEN** o usuário aciona encerrar a série
- **THEN** a tarefa permanece com seus campos e status atuais, sem regra de recorrência
- **AND** nenhuma ocorrência nova será gerada quando ela for fechada

#### Scenario: Excluir a ocorrência aberta encerra a série

- **GIVEN** uma ocorrência aberta que carrega a regra
- **WHEN** o usuário confirma a exclusão dessa tarefa
- **THEN** o sistema informa, antes de confirmar, que a série será encerrada
- **AND** a tarefa sai da listagem, vai para a lixeira e nenhuma ocorrência nova é criada

#### Scenario: Restaurar a ocorrência excluída retoma a série

- **GIVEN** a ocorrência que carregava a regra de uma série diária está na lixeira
- **WHEN** o usuário a restaura
- **THEN** a tarefa volta à listagem carregando a regra, sem que nenhuma ocorrência nova seja criada na restauração
- **AND** concluir essa tarefa gera a próxima ocorrência conforme a geração da próxima ocorrência
