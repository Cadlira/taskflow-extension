## MODIFIED Requirements

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
