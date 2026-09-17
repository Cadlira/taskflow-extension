## MODIFIED Requirements

### Requirement: Exclusão confirmada

O sistema SHALL permitir excluir uma tarefa somente após confirmação explícita do usuário. A exclusão confirmada SHALL mover a tarefa para a lixeira, conforme `task-trash`, e a confirmação SHALL informar que a tarefa poderá ser restaurada da lixeira por 30 dias. Quando a tarefa excluída carregar uma regra de recorrência, a confirmação SHALL informar também que a série será encerrada. A remoção definitiva SHALL ocorrer somente pela lixeira ou pelo vencimento de sua retenção.

#### Scenario: Exclusão confirmada

- **WHEN** o usuário confirma a exclusão de uma tarefa
- **THEN** o sistema remove a tarefa da coleção e da listagem e a mantém na lixeira

#### Scenario: Confirmação informa o destino

- **WHEN** o usuário aciona a exclusão de uma tarefa
- **THEN** a confirmação informa que a tarefa irá para a lixeira e poderá ser restaurada por 30 dias

#### Scenario: Exclusão cancelada

- **WHEN** o usuário cancela a confirmação de exclusão
- **THEN** a tarefa permanece inalterada e a lixeira não recebe nenhum item

#### Scenario: Exclusão de ocorrência que carrega a regra

- **GIVEN** uma tarefa que carrega uma regra de recorrência
- **WHEN** o usuário aciona a exclusão
- **THEN** a confirmação informa que a série será encerrada antes de o usuário confirmar
