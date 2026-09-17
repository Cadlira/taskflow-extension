# task-subtasks Specification

## Purpose

Define as subtarefas do TaskFlow como uma lista simples e ordenada de passos marcáveis dentro de uma tarefa, com um único nível, progresso calculado e marcação independente do status da tarefa, sem transformar subtarefas em tarefas.

## Requirements

### Requirement: Lista de subtarefas da tarefa

O sistema SHALL representar as subtarefas de uma tarefa como uma lista ordenada `subtasks`, presente em toda tarefa e vazia quando não houver itens. Cada subtarefa SHALL conter somente um identificador único dentro da tarefa, um título e a marcação de feito. O título SHALL ser não vazio após remoção de espaços nas extremidades e ter até 200 caracteres. Uma tarefa SHALL ter no máximo 20 subtarefas. Subtarefas que violem essas regras não SHALL ser persistidas.

#### Scenario: Tarefa criada sem subtarefas

- **WHEN** uma tarefa é criada sem subtarefas, inclusive pelo Quick Add ou pela captura de página
- **THEN** a tarefa é persistida com a lista de subtarefas vazia

#### Scenario: Subtarefa nova começa desmarcada

- **WHEN** o usuário adiciona uma subtarefa com título válido e salva a tarefa
- **THEN** a subtarefa é persistida com identificador próprio, título sem espaços nas extremidades e desmarcada

#### Scenario: Título de subtarefa vazio é rejeitado

- **WHEN** o usuário tenta salvar uma tarefa com uma subtarefa cujo título contém apenas espaços
- **THEN** o sistema não persiste a alteração e informa o erro junto àquela subtarefa

#### Scenario: Título de subtarefa longo demais é rejeitado

- **WHEN** o usuário tenta salvar uma subtarefa com título de 201 caracteres
- **THEN** o sistema não persiste a alteração e informa o limite junto àquela subtarefa

#### Scenario: Limite de subtarefas

- **GIVEN** uma tarefa em edição com 20 subtarefas
- **WHEN** o usuário tenta adicionar outra subtarefa
- **THEN** o sistema não permite adicioná-la e informa o limite de 20 subtarefas

#### Scenario: Primeiro erro recebe o foco

- **GIVEN** o formulário com título da tarefa válido e a segunda subtarefa com título vazio
- **WHEN** o usuário envia o formulário
- **THEN** o foco vai para o campo de título da segunda subtarefa, com a mensagem de erro associada

### Requirement: Profundidade única

Uma subtarefa MUST NOT ter status, prioridade, prazo, lembretes, recorrência, tags, URL de origem nem subtarefas próprias. Subtarefas MUST NOT aparecer como tarefas independentes na listagem, MUST NOT receber sinalização de atraso ou de proximidade do vencimento e MUST NOT agendar lembretes.

#### Scenario: Subtarefa não aparece como tarefa

- **GIVEN** uma tarefa com três subtarefas
- **WHEN** o usuário visualiza a listagem sem filtros
- **THEN** a listagem apresenta um único cartão para a tarefa e nenhum cartão para as subtarefas

#### Scenario: Formulário não oferece subtarefa aninhada

- **WHEN** o usuário edita uma subtarefa no formulário
- **THEN** o sistema oferece somente título, posição e remoção, sem opção de adicionar itens dentro dela

### Requirement: Independência entre tarefa e subtarefas

Alterar o status da tarefa MUST NOT alterar a marcação de nenhuma subtarefa, e marcar ou desmarcar subtarefas MUST NOT alterar o status, `completedAt`, o prazo nem os lembretes da tarefa. Concluir ou cancelar uma tarefa com subtarefas pendentes SHALL ser permitido sem confirmação adicional.

#### Scenario: Concluir tarefa com itens pendentes

- **GIVEN** uma tarefa `TODO` com duas de cinco subtarefas marcadas
- **WHEN** o usuário conclui a tarefa
- **THEN** a tarefa passa a `DONE` sem diálogo adicional
- **AND** as cinco subtarefas mantêm suas marcações

#### Scenario: Marcar o último item não conclui a tarefa

- **GIVEN** uma tarefa `IN_PROGRESS` com quatro de cinco subtarefas marcadas
- **WHEN** o usuário marca a quinta subtarefa
- **THEN** a tarefa permanece `IN_PROGRESS` e sem `completedAt`

#### Scenario: Reabrir tarefa preserva marcações

- **GIVEN** uma tarefa `DONE` com todas as subtarefas marcadas
- **WHEN** o usuário reabre a tarefa
- **THEN** as subtarefas permanecem marcadas

### Requirement: Ordem manual das subtarefas

O sistema SHALL apresentar as subtarefas na ordem persistida. Uma subtarefa adicionada SHALL entrar no fim da lista. O formulário SHALL permitir mover cada subtarefa uma posição para cima ou para baixo por controles operáveis pelo teclado. Marcar ou desmarcar uma subtarefa MUST NOT alterar sua posição.

#### Scenario: Nova subtarefa entra no fim

- **GIVEN** uma tarefa com as subtarefas "A" e "B"
- **WHEN** o usuário adiciona "C" e salva
- **THEN** a ordem persistida é "A", "B", "C"

#### Scenario: Mover subtarefa para cima

- **GIVEN** o formulário com as subtarefas "A", "B", "C"
- **WHEN** o usuário move "C" para cima e salva
- **THEN** a ordem persistida é "A", "C", "B"

#### Scenario: Limites da movimentação

- **WHEN** o formulário apresenta a primeira e a última subtarefa
- **THEN** mover a primeira para cima e a última para baixo estão indisponíveis

#### Scenario: Marcação preserva a posição

- **GIVEN** as subtarefas "A", "B", "C" desmarcadas
- **WHEN** o usuário marca "A"
- **THEN** a ordem continua "A", "B", "C"

#### Scenario: Foco acompanha o item movido

- **WHEN** o usuário move uma subtarefa pelo teclado
- **THEN** o foco permanece no controle de movimentação da mesma subtarefa, ou no controle oposto quando o acionado ficar indisponível

### Requirement: Progresso calculado das subtarefas

O cartão de uma tarefa com ao menos uma subtarefa SHALL apresentar, em texto, a quantidade de subtarefas marcadas e o total, independentemente do status da tarefa. O progresso SHALL ser derivado das subtarefas persistidas e MUST NOT ser gravado. Tarefas sem subtarefas MUST NOT apresentar indicação de progresso.

#### Scenario: Progresso parcial

- **GIVEN** uma tarefa com duas de cinco subtarefas marcadas
- **WHEN** o usuário visualiza a listagem
- **THEN** o cartão apresenta o progresso "2 de 5"

#### Scenario: Tarefa sem subtarefas

- **WHEN** o usuário visualiza uma tarefa sem subtarefas
- **THEN** o cartão não apresenta progresso nem controle de subtarefas

#### Scenario: Progresso de tarefa concluída

- **GIVEN** uma tarefa `DONE` com três de quatro subtarefas marcadas
- **WHEN** o usuário visualiza a listagem
- **THEN** o cartão continua apresentando o progresso "3 de 4"

### Requirement: Edição das subtarefas no formulário

O formulário de criação e edição do Side Panel SHALL permitir adicionar, renomear, remover e reordenar subtarefas, com cada campo de título identificado por rótulo acessível que inclua sua posição. As alterações SHALL ser persistidas somente ao salvar a tarefa, e abandonar a edição MUST NOT alterar as subtarefas persistidas. O formulário SHALL indicar a marcação atual de cada subtarefa existente, mas MUST NOT permitir alterá-la.

#### Scenario: Renomear preserva identidade e marcação

- **GIVEN** uma subtarefa marcada "Enviar pauta"
- **WHEN** o usuário a renomeia para "Enviar pauta revisada" e salva
- **THEN** a subtarefa mantém seu identificador e continua marcada

#### Scenario: Remover subtarefa

- **WHEN** o usuário remove uma subtarefa e salva
- **THEN** a subtarefa deixa de existir e as demais mantêm ordem relativa e marcações

#### Scenario: Edição abandonada

- **WHEN** o usuário adiciona, remove ou reordena subtarefas e abandona a edição
- **THEN** as subtarefas persistidas permanecem inalteradas

### Requirement: Marcação pelo cartão da listagem

O cartão de uma tarefa com subtarefas SHALL oferecer um controle expansível, que expõe se está expandido, para exibir as subtarefas como caixas de marcação rotuladas pelo título. O controle SHALL iniciar recolhido, e o estado expandido SHALL ser mantido enquanto a superfície estiver aberta, inclusive quando a listagem for atualizada pelo armazenamento, sem ser persistido. Marcar ou desmarcar SHALL persistir imediatamente somente a marcação daquela subtarefa, atualizar `updatedAt` da tarefa e ser permitido em qualquer status da tarefa. Enquanto a gravação é processada, a caixa acionada SHALL permanecer focável, indicar que está indisponível e ignorar novos acionamentos. Após a gravação, o foco SHALL permanecer na caixa acionada. Quando a gravação falhar, a caixa SHALL voltar à marcação persistida, o sistema SHALL informar a falha e o foco SHALL permanecer nela.

#### Scenario: Expandir subtarefas

- **GIVEN** uma tarefa com subtarefas e o controle recolhido
- **WHEN** o usuário aciona o controle
- **THEN** o cartão exibe as subtarefas como caixas de marcação e o controle é anunciado como expandido

#### Scenario: Marcar subtarefa pelo teclado

- **GIVEN** as subtarefas expandidas e o foco na caixa da subtarefa "Enviar pauta" desmarcada
- **WHEN** o usuário pressiona Espaço
- **THEN** a subtarefa é persistida como marcada, o progresso é atualizado e o foco permanece na mesma caixa

#### Scenario: Marcar subtarefa de tarefa cancelada

- **GIVEN** uma tarefa `CANCELLED` com subtarefas expandidas
- **WHEN** o usuário marca uma subtarefa
- **THEN** a marcação é persistida e a tarefa permanece `CANCELLED`

#### Scenario: Atualização externa mantém a expansão

- **GIVEN** as subtarefas de uma tarefa expandidas no Side Panel
- **WHEN** outra superfície altera essa tarefa
- **THEN** o cartão continua expandido e apresenta os dados atualizados

#### Scenario: Acionamento repetido durante a gravação

- **GIVEN** o usuário marcou uma subtarefa e a gravação ainda não terminou
- **WHEN** aciona a mesma caixa novamente
- **THEN** nenhuma segunda gravação é iniciada e a caixa é anunciada como indisponível

#### Scenario: Falha ao marcar

- **GIVEN** a gravação falhará
- **WHEN** o usuário marca uma subtarefa
- **THEN** a caixa volta a desmarcada, o sistema informa que a alteração não foi salva e o foco permanece na caixa

#### Scenario: Subtarefa removida em outra superfície

- **GIVEN** a subtarefa foi removida em outra superfície antes de a marcação ser gravada
- **WHEN** o usuário a marca na superfície desatualizada
- **THEN** o sistema não recria a subtarefa nem altera as demais e informa que ela não existe mais

### Requirement: Marcações preservadas ao salvar o formulário

Ao salvar o formulário, o sistema SHALL aplicar a marcação mais recente persistida de cada subtarefa que continue existindo por identificador, e não a marcação exibida quando o formulário foi aberto. Subtarefas adicionadas no formulário SHALL ser persistidas desmarcadas.

#### Scenario: Marcação feita em outra superfície durante a edição

- **GIVEN** o formulário do Side Panel aberto com a subtarefa "A" desmarcada
- **AND** "A" foi marcada pelo cartão em outra superfície
- **WHEN** o usuário altera o título da tarefa e salva o formulário
- **THEN** o título é atualizado e "A" permanece marcada
