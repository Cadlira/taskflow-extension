## MODIFIED Requirements

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
