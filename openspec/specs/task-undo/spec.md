# task-undo Specification

## Purpose

Define como o usuário desfaz, no Side Panel, a última exclusão, alteração de status ou edição salva, de forma segura diante de alterações concorrentes e sem manter histórico persistido.

## Requirements

### Requirement: Oferta de desfazer a última ação

Depois que uma exclusão, uma alteração de status ou uma edição salva for concluída com sucesso no Side Panel, o sistema SHALL apresentar, junto à mensagem de sucesso, a ação "Desfazer". Alteração de status inclui concluir, cancelar, reabrir, escolher status no seletor do cartão e pular ou encerrar uma ocorrência recorrente. A oferta SHALL valer somente para a última ação bem-sucedida da mesma superfície e SHALL existir somente em memória. A oferta SHALL deixar de existir quando for usada, quando outra ação sobre tarefas for concluída ou falhar na mesma superfície, quando o usuário abrir o formulário, a área de backup ou a área da lixeira, ou quando a superfície for fechada ou recarregada. A oferta MUST NOT expirar por tempo. Criar tarefa, marcar subtarefa, confirmar captura, restaurar backup e ações da área da lixeira MUST NOT oferecer desfazer. O popup MUST NOT oferecer desfazer.

#### Scenario: Oferta após concluir

- **WHEN** o usuário conclui uma tarefa pela listagem
- **THEN** a mensagem de sucesso apresenta a ação "Desfazer"

#### Scenario: Oferta após excluir

- **WHEN** o usuário confirma a exclusão de uma tarefa
- **THEN** a mensagem informa que a tarefa foi movida para a lixeira e apresenta a ação "Desfazer"

#### Scenario: Oferta após salvar edição

- **WHEN** o usuário salva uma edição válida no formulário
- **THEN** a mensagem de sucesso apresenta a ação "Desfazer"

#### Scenario: Nova ação substitui a oferta

- **GIVEN** a oferta de desfazer a conclusão da tarefa A está visível
- **WHEN** o usuário conclui a tarefa B
- **THEN** a oferta passa a se referir somente à conclusão da tarefa B

#### Scenario: Abrir outra área encerra a oferta

- **GIVEN** a oferta de desfazer está visível
- **WHEN** o usuário abre o formulário, o backup ou a lixeira
- **THEN** ao voltar à listagem nenhuma oferta de desfazer é apresentada

#### Scenario: Oferta não sobrevive ao fechamento

- **GIVEN** a oferta de desfazer está visível
- **WHEN** o usuário fecha e reabre o Side Panel
- **THEN** nenhuma oferta de desfazer é apresentada

#### Scenario: Oferta não expira sozinha

- **GIVEN** a oferta de desfazer está visível
- **WHEN** alguns minutos passam sem outra ação do usuário
- **THEN** a ação "Desfazer" continua disponível

#### Scenario: Ações sem desfazer

- **WHEN** o usuário cria uma tarefa ou marca uma subtarefa
- **THEN** nenhuma ação "Desfazer" é apresentada

### Requirement: Desfazer exclusão

Desfazer uma exclusão SHALL aplicar a restauração a partir da lixeira definida em `task-trash`, com as mesmas regras de preservação de dados, lembretes e recusa. Quando o item não estiver mais na lixeira, o sistema SHALL recusar e informar que a tarefa não pode mais ser restaurada.

#### Scenario: Desfazer exclusão restaura a tarefa

- **GIVEN** o usuário acabou de excluir uma tarefa
- **WHEN** aciona "Desfazer"
- **THEN** a tarefa volta à listagem com o mesmo identificador, campos e timestamps
- **AND** o item deixa de existir na lixeira

#### Scenario: Item já removido da lixeira

- **GIVEN** o usuário acabou de excluir uma tarefa e, em outro Side Panel, a lixeira foi esvaziada
- **WHEN** aciona "Desfazer"
- **THEN** o sistema informa que a tarefa não pode mais ser restaurada e nada é gravado

### Requirement: Desfazer alteração de status ou edição

Desfazer uma alteração de status ou uma edição salva SHALL devolver a tarefa a todos os valores que tinha antes da ação, incluindo status, `completedAt`, regra de recorrência, subtarefas, lembretes e demais campos editáveis, preservando identificador e `createdAt` e definindo um novo `updatedAt`. O sistema SHALL marcar como processadas as ocorrências de lembrete cujo instante efetivo já passou e SHALL reconciliar os alarmes da tarefa; falha no agendamento MUST NOT desfazer a reversão e SHALL ser informada como lembretes pendentes.

#### Scenario: Desfazer conclusão

- **GIVEN** o usuário acabou de concluir uma tarefa `IN_PROGRESS`
- **WHEN** aciona "Desfazer"
- **THEN** a tarefa volta a `IN_PROGRESS`, sem `completedAt`, com os mesmos campos anteriores e novo `updatedAt`

#### Scenario: Desfazer edição

- **GIVEN** o usuário acabou de salvar uma edição que alterou título, descrição e prazo
- **WHEN** aciona "Desfazer"
- **THEN** a tarefa volta ao título, à descrição e ao prazo anteriores

#### Scenario: Desfazer reabertura

- **GIVEN** o usuário acabou de reabrir uma tarefa `DONE`
- **WHEN** aciona "Desfazer"
- **THEN** a tarefa volta a `DONE` com o `completedAt` que tinha antes da reabertura

#### Scenario: Lembrete vencido após a ação

- **GIVEN** o usuário concluiu uma tarefa com lembrete e o instante efetivo desse lembrete passou antes de desfazer
- **WHEN** aciona "Desfazer"
- **THEN** a tarefa volta ao status anterior com o lembrete marcado como processado
- **AND** nenhuma notificação retroativa é exibida

#### Scenario: Lembrete futuro volta a ser agendado

- **GIVEN** o usuário concluiu uma tarefa com lembrete futuro
- **WHEN** aciona "Desfazer"
- **THEN** o alarme desse lembrete volta a existir

### Requirement: Desfazer em série recorrente

Quando a ação desfeita tiver fechado uma ocorrência recorrente e gerado a próxima, desfazer SHALL, em uma única gravação, devolver a ocorrência fechada ao estado anterior, com sua regra de recorrência, e remover definitivamente a ocorrência gerada, sem enviá-la à lixeira. Quando a ação tiver encerrado a série sem gerar ocorrência, desfazer SHALL devolver a regra à tarefa. Os alarmes da ocorrência removida SHALL deixar de existir.

#### Scenario: Desfazer conclusão de ocorrência recorrente

- **GIVEN** o usuário acabou de concluir uma ocorrência diária, gerando a ocorrência do dia seguinte
- **WHEN** aciona "Desfazer"
- **THEN** a ocorrência concluída volta ao status anterior e carrega novamente a regra
- **AND** a ocorrência do dia seguinte deixa de existir na listagem, na lixeira e nos alarmes

#### Scenario: Desfazer pular ocorrência

- **GIVEN** o usuário acabou de cancelar uma ocorrência escolhendo pular, gerando a seguinte
- **WHEN** aciona "Desfazer"
- **THEN** a ocorrência cancelada volta ao status anterior com a regra e a ocorrência gerada deixa de existir

#### Scenario: Desfazer encerramento da série

- **GIVEN** o usuário acabou de cancelar uma ocorrência escolhendo encerrar a série
- **WHEN** aciona "Desfazer"
- **THEN** a tarefa volta ao status anterior e carrega novamente a regra de recorrência

#### Scenario: Desfazer edição que concluiu ocorrência recorrente

- **GIVEN** o usuário acabou de salvar uma edição que alterou o status de uma ocorrência recorrente para `DONE`, gerando a próxima
- **WHEN** aciona "Desfazer"
- **THEN** a ocorrência volta aos valores anteriores à edição com a regra e a ocorrência gerada deixa de existir

### Requirement: Desfazer somente sobre a versão produzida pela ação

O sistema SHALL aplicar o desfazer de alteração de status ou de edição somente se a tarefa afetada ainda existir com o mesmo `updatedAt` produzido pela ação e, quando houver ocorrência gerada, somente se ela ainda existir com o mesmo `updatedAt` com que foi criada. Se qualquer condição falhar, o sistema SHALL recusar o desfazer inteiro, MUST NOT gravar nenhuma alteração e SHALL informar que a tarefa foi alterada ou removida depois da ação. O processamento de lembretes pelo background, que não altera `updatedAt`, MUST NOT impedir o desfazer. A verificação e a gravação SHALL ser feitas sobre os dados persistidos mais recentes.

#### Scenario: Tarefa alterada em outra superfície

- **GIVEN** o usuário concluiu uma tarefa em um Side Panel
- **AND** a mesma tarefa foi editada em outro Side Panel
- **WHEN** o usuário aciona "Desfazer" no primeiro Side Panel
- **THEN** o sistema informa que a tarefa foi alterada depois da ação e não grava nenhuma alteração

#### Scenario: Tarefa excluída depois da ação

- **GIVEN** o usuário concluiu uma tarefa e ela foi excluída em outro Side Panel
- **WHEN** aciona "Desfazer"
- **THEN** o sistema informa que a tarefa foi removida depois da ação e não grava nenhuma alteração

#### Scenario: Ocorrência gerada foi alterada

- **GIVEN** o usuário concluiu uma ocorrência recorrente e a ocorrência gerada foi editada em outro Side Panel
- **WHEN** aciona "Desfazer" no primeiro Side Panel
- **THEN** o sistema recusa o desfazer inteiro
- **AND** a ocorrência concluída e a ocorrência gerada permanecem como estavam

#### Scenario: Lembrete processado pelo background não bloqueia

- **GIVEN** o usuário concluiu uma tarefa e, em seguida, o background registrou o processamento de um lembrete dessa tarefa
- **WHEN** o usuário aciona "Desfazer"
- **THEN** o sistema aplica o desfazer

#### Scenario: Falha ao gravar o desfazer

- **WHEN** o armazenamento local rejeita a gravação do desfazer
- **THEN** o sistema informa que a ação não foi desfeita e os dados permanecem como estavam

### Requirement: Foco e anúncio após desfazer

O resultado do desfazer SHALL ser anunciado na mesma região de mensagens da listagem. Enquanto o desfazer é processado, a ação "Desfazer" SHALL permanecer focável, indicar que está indisponível e ignorar novos acionamentos. Concluído o desfazer, com sucesso ou recusa, a oferta SHALL deixar de existir e o foco MUST NOT ficar sem destino: quando o cartão da tarefa estiver visível, o foco SHALL ir para a ação "Editar" desse cartão; caso contrário, para a ação principal do estado apresentado. A apresentação da oferta MUST NOT mover o foco.

#### Scenario: Oferta não rouba o foco

- **GIVEN** o usuário conclui uma tarefa pelo teclado
- **WHEN** a oferta de desfazer é apresentada
- **THEN** o foco segue as regras de foco após ações da listagem, sem ir para "Desfazer"

#### Scenario: Foco após desfazer com cartão visível

- **WHEN** o usuário aciona "Desfazer" pelo teclado e o cartão da tarefa fica visível
- **THEN** o sistema anuncia que a ação foi desfeita e o foco vai para a ação "Editar" desse cartão

#### Scenario: Foco após desfazer com cartão oculto por filtro

- **GIVEN** um filtro ativo que oculta a tarefa no estado restaurado
- **WHEN** o usuário aciona "Desfazer"
- **THEN** o foco vai para a ação principal do estado apresentado

#### Scenario: Foco após recusa

- **WHEN** o desfazer é recusado por alteração concorrente
- **THEN** o sistema anuncia o motivo e o foco não fica sem destino
