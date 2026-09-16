# interface-accessibility Specification

## Purpose

Define como o popup e o Side Panel do TaskFlow se comportam para quem usa teclado, leitor de tela ou precisa de contraste adequado: alteração de status sem gravações acidentais, destino previsível do foco após ações e falhas, contraste mínimo e estrutura de títulos navegável.

## Requirements

### Requirement: Alteração de status pela listagem sem gravações intermediárias

O seletor de status de cada cartão da listagem SHALL aplicar um novo status somente quando a escolha for confirmada: ao pressionar Enter, ao sair do seletor ou ao escolher uma opção com o ponteiro. Percorrer as opções pelo teclado MUST NOT persistir status intermediários. Escape SHALL restaurar o status persistido sem gravar. Confirmar o mesmo status já persistido MUST NOT gerar gravação. Cada status aplicado SHALL seguir as regras do ciclo de vida da tarefa definidas em `task-management`. Quando a escolha exibida for `CANCELLED` em uma tarefa que carrega regra de recorrência, confirmar com Enter ou com o ponteiro SHALL abrir a confirmação de pular ou encerrar definida em `task-recurrence`, e sair do seletor MUST NOT aplicar a escolha, restaurando o status persistido sem gravar.

#### Scenario: Navegação pelas setas não grava

- **GIVEN** uma tarefa `TODO` visível na listagem e o foco no seu seletor de status fechado
- **WHEN** o usuário pressiona a seta para baixo duas vezes
- **THEN** nenhum status é persistido
- **AND** o seletor exibe a opção alcançada e mantém o foco

#### Scenario: Enter aplica somente o status escolhido

- **GIVEN** o usuário percorreu pelo teclado o seletor de uma tarefa `TODO` até `Concluída`
- **WHEN** o usuário pressiona Enter
- **THEN** o sistema persiste uma única alteração, para `DONE`, com `completedAt` registrado
- **AND** nenhum outro status é persistido para a tarefa

#### Scenario: Sair do seletor aplica a escolha exibida

- **GIVEN** o usuário percorreu pelo teclado o seletor de uma tarefa `TODO` até `Em andamento`
- **WHEN** o foco sai do seletor
- **THEN** o sistema persiste uma única alteração, para `IN_PROGRESS`

#### Scenario: Escape restaura o status persistido

- **GIVEN** o usuário percorreu pelo teclado o seletor de uma tarefa `TODO` até `Cancelada`
- **WHEN** o usuário pressiona Escape
- **THEN** o seletor volta a exibir `A fazer`
- **AND** nenhum status é persistido, nem mesmo ao sair do seletor em seguida

#### Scenario: Escolha com ponteiro aplica imediatamente

- **WHEN** o usuário abre o seletor de status e escolhe `Em andamento` com o ponteiro
- **THEN** o sistema persiste uma única alteração, para `IN_PROGRESS`

#### Scenario: Confirmação do status atual não grava

- **GIVEN** o usuário percorreu o seletor de uma tarefa `TODO` e voltou a `A fazer`
- **WHEN** o usuário pressiona Enter ou sai do seletor
- **THEN** nenhuma gravação é feita e nenhuma mensagem de sucesso é exibida

#### Scenario: Falha ao aplicar o status

- **GIVEN** a gravação do status falhará
- **WHEN** o usuário confirma um novo status no seletor
- **THEN** o seletor volta a exibir o status persistido
- **AND** o sistema informa que o status não foi alterado e o foco permanece no seletor

#### Scenario: Cancelamento de tarefa recorrente pelo seletor pede confirmação

- **GIVEN** o usuário percorreu até `Cancelada` no seletor de uma tarefa que carrega regra de recorrência
- **WHEN** o usuário pressiona Enter ou escolhe a opção com o ponteiro
- **THEN** nenhum status é persistido ainda
- **AND** o sistema apresenta a confirmação com as ações de pular esta ocorrência e encerrar a série

#### Scenario: Sair do seletor não cancela tarefa recorrente

- **GIVEN** o seletor de uma tarefa que carrega regra de recorrência exibe `Cancelada` sem confirmação
- **WHEN** o foco sai do seletor
- **THEN** nenhum status é persistido e nenhuma confirmação é apresentada
- **AND** o seletor volta a exibir o status persistido

#### Scenario: Confirmação de cancelamento recorrente é abandonada

- **GIVEN** a confirmação de pular ou encerrar está aberta a partir do seletor
- **WHEN** o usuário a abandona
- **THEN** o seletor volta a exibir o status persistido e nada é gravado
- **AND** o foco volta para o seletor

### Requirement: Foco preservado após ações da listagem

Depois de concluir, cancelar, reabrir, alterar o status ou excluir uma tarefa pela listagem, o foco MUST NOT ficar sem destino no documento. Quando o próprio usuário já tiver movido o foco para outro controle que continua exibido, o sistema MUST NOT retirá-lo dali. Nos demais casos, quando o cartão da tarefa continuar visível, o foco SHALL ir para o controle equivalente no mesmo cartão. Quando o cartão deixar de estar visível, o foco SHALL ir para a ação "Editar" do cartão que passou a ocupar sua posição ou, se ele era o último, do novo último cartão. Quando não restar cartão visível, o foco SHALL ir para a ação principal do estado apresentado. Enquanto a operação é processada, o controle acionado SHALL permanecer focável, indicar que está indisponível e ignorar novos acionamentos. Quando a operação falhar, o foco SHALL permanecer no controle acionado. Quando a ação exigir confirmação em diálogo, essas regras de destino do foco SHALL ser aplicadas depois da confirmação; quando o usuário abandonar o diálogo, o foco SHALL voltar ao controle que o acionou.

#### Scenario: Concluir com o cartão ainda visível

- **GIVEN** uma tarefa ativa visível sem filtros de status
- **WHEN** o usuário aciona "Concluir" pelo teclado
- **THEN** a tarefa passa a `DONE`
- **AND** o foco vai para a ação "Reabrir" do mesmo cartão, mesmo que a ordenação mude sua posição

#### Scenario: Cancelar com o cartão ainda visível

- **GIVEN** uma tarefa ativa sem recorrência visível sem filtros de status
- **WHEN** o usuário aciona "Cancelar tarefa"
- **THEN** a tarefa passa a `CANCELLED` e o foco vai para a ação "Reabrir" do mesmo cartão

#### Scenario: Reabrir com o cartão ainda visível

- **GIVEN** uma tarefa `DONE` visível
- **WHEN** o usuário aciona "Reabrir"
- **THEN** a tarefa passa a `TODO` e o foco vai para a ação "Concluir" do mesmo cartão

#### Scenario: Status confirmado com Enter com o cartão ainda visível

- **WHEN** o usuário confirma um novo status no seletor com Enter ou com o ponteiro e o cartão continua visível
- **THEN** o foco permanece no seletor de status do mesmo cartão

#### Scenario: Status aplicado ao sair do seletor

- **GIVEN** o usuário percorreu o seletor pelo teclado até um novo status
- **WHEN** o usuário move o foco para outro controle com Tab
- **THEN** o foco permanece no controle escolhido pelo usuário enquanto ele continuar exibido
- **AND** se esse controle deixar de ser exibido, o foco segue a regra do cartão vizinho

#### Scenario: Cartão sai da listagem por causa do filtro

- **GIVEN** o filtro de status `A fazer` está ativo e há três tarefas visíveis
- **WHEN** o usuário conclui a segunda tarefa
- **THEN** o cartão concluído deixa de ser exibido
- **AND** o foco vai para a ação "Editar" do cartão que passou a ocupar a segunda posição

#### Scenario: Último cartão da lista sai da listagem

- **GIVEN** o filtro de status `A fazer` está ativo e há duas tarefas visíveis
- **WHEN** o usuário conclui a última tarefa da lista
- **THEN** o foco vai para a ação "Editar" da tarefa que passou a ser a última

#### Scenario: Nenhum cartão visível após a ação

- **GIVEN** o filtro de status `A fazer` está ativo e há uma única tarefa visível
- **WHEN** o usuário conclui essa tarefa
- **THEN** o sistema apresenta o estado "Nenhuma tarefa encontrada" com o foco na ação "Limpar filtros"

#### Scenario: Exclusão confirmada de uma tarefa intermediária

- **GIVEN** três tarefas visíveis
- **WHEN** o usuário exclui a segunda tarefa e confirma no diálogo
- **THEN** o foco vai para a ação "Editar" do cartão que passou a ocupar a segunda posição

#### Scenario: Exclusão da última tarefa persistida

- **GIVEN** existe uma única tarefa persistida
- **WHEN** o usuário a exclui e confirma no diálogo
- **THEN** o sistema apresenta o estado de lista vazia com o foco na ação "Criar primeira tarefa"

#### Scenario: Acionamento repetido durante o processamento

- **GIVEN** o usuário acionou "Concluir" e a gravação ainda não terminou
- **WHEN** o usuário aciona o mesmo controle novamente
- **THEN** nenhuma segunda operação é iniciada
- **AND** o controle continua com o foco e é anunciado como indisponível

#### Scenario: Falha na ação do cartão

- **GIVEN** a gravação falhará
- **WHEN** o usuário aciona "Concluir"
- **THEN** a tarefa permanece inalterada, o sistema informa a falha e o foco permanece em "Concluir"

#### Scenario: Cancelar tarefa recorrente com o cartão ainda visível

- **GIVEN** uma tarefa ativa que carrega regra de recorrência, visível sem filtros de status
- **WHEN** o usuário aciona "Cancelar tarefa" e escolhe pular esta ocorrência
- **THEN** a tarefa passa a `CANCELLED` e o foco vai para a ação "Reabrir" do mesmo cartão

#### Scenario: Confirmação abandonada devolve o foco ao controle acionado

- **GIVEN** a confirmação de pular ou encerrar está aberta a partir de "Cancelar tarefa"
- **WHEN** o usuário a abandona
- **THEN** nenhuma alteração é persistida
- **AND** o foco volta para a ação "Cancelar tarefa" do mesmo cartão

### Requirement: Foco no primeiro erro de validação

Quando salvar uma tarefa falhar no formulário do Side Panel ou no Quick Add, o sistema SHALL mover o foco para o primeiro campo inválido, na ordem em que os campos aparecem, mantendo a mensagem de erro associada a ele. Quando o erro for de lembretes, o foco SHALL ir para a primeira opção de lembrete. Quando a falha não tiver erro de campo, o foco SHALL ir para a mensagem de falha. Os dados digitados MUST ser preservados.

#### Scenario: Título vazio no formulário do Side Panel

- **GIVEN** o formulário de nova tarefa com o título vazio e o foco no botão "Criar tarefa"
- **WHEN** o usuário envia o formulário
- **THEN** a tarefa não é persistida
- **AND** o foco vai para o campo Título, que expõe a mensagem de erro associada

#### Scenario: Vários campos inválidos

- **GIVEN** o formulário do Side Panel com o título válido, lembrete marcado sem prazo e URL de origem `ftp://exemplo`
- **WHEN** o usuário envia o formulário
- **THEN** o foco vai para a primeira opção de lembrete, que aparece antes da URL de origem
- **AND** os valores digitados continuam nos campos

#### Scenario: Título vazio no Quick Add

- **GIVEN** o Quick Add com o título vazio
- **WHEN** o usuário envia o formulário pelo teclado
- **THEN** o popup permanece aberto e o foco vai para o campo Título, com a mensagem de erro associada

#### Scenario: Falha sem erro de campo

- **GIVEN** os campos são válidos e a gravação falhará
- **WHEN** o usuário envia o formulário do Side Panel ou do Quick Add
- **THEN** o foco vai para a mensagem que informa que a tarefa não foi salva

### Requirement: Contraste mínimo de texto e indicadores

No popup e no Side Panel, todo texto informativo, inclusive rótulos e textos de botões habilitados, SHALL ter razão de contraste de pelo menos 4,5:1 contra o fundo em que é exibido. O indicador de foco SHALL ter razão de pelo menos 3:1 contra o fundo da página e contra a superfície de cartões, formulários e popup. A borda de campos de texto, seletores e áreas de texto SHALL ter razão de pelo menos 3:1 contra essas mesmas superfícies. Tarefas concluídas e canceladas SHALL continuar distinguíveis das ativas sem reduzir o contraste de seu conteúdo abaixo desses limites. Controles desabilitados ficam fora desses limites.

#### Scenario: Cores verificadas pela fórmula da WCAG

- **WHEN** as cores de texto, indicador de foco e borda de campos são verificadas pela fórmula de contraste da WCAG contra o fundo da página e a superfície
- **THEN** o texto tem pelo menos 4,5:1 e o indicador de foco e a borda de campos têm pelo menos 3:1

#### Scenario: Cartão de tarefa concluída

- **GIVEN** uma tarefa `DONE` visível na listagem
- **WHEN** o cartão é exibido
- **THEN** o título aparece tachado e o status aparece em texto
- **AND** rótulos, valores e textos de botões do cartão têm pelo menos 4,5:1 contra o fundo do cartão

#### Scenario: Foco visível em campo do popup

- **WHEN** o foco pelo teclado está em um campo do Quick Add
- **THEN** o indicador de foco e a borda do campo têm pelo menos 3:1 contra a superfície do popup

### Requirement: Estrutura de títulos da listagem

Quando houver tarefas visíveis, o Side Panel SHALL apresentar um título de seção de nível 2 "Lista de tarefas" antes dos títulos das tarefas, distinto do título de pesquisa, filtros e ordenação. O título da seção MAY ficar visualmente oculto, mas MUST estar disponível para tecnologias assistivas. Os títulos das tarefas SHALL permanecer no nível 3.

#### Scenario: Navegação por títulos na listagem

- **GIVEN** existem tarefas visíveis
- **WHEN** a pessoa usuária percorre os títulos do Side Panel com tecnologia assistiva
- **THEN** encontra, em ordem, "Tarefas" (nível 1), "Pesquisa, filtros e ordenação" (nível 2), "Lista de tarefas" (nível 2) e os títulos das tarefas (nível 3)

#### Scenario: Pesquisa sem resultados

- **GIVEN** a pesquisa e os filtros não retornam tarefas
- **WHEN** o Side Panel apresenta o estado "Nenhuma tarefa encontrada"
- **THEN** nenhum título "Lista de tarefas" vazio é apresentado

### Requirement: Seletor de arquivo de backup identificável e operável

Na área de backup, a ação "Escolher arquivo de backup" SHALL ter a mesma aparência dos demais botões secundários, incluindo preenchimento, cantos arredondados e peso do texto, e o mesmo indicador de foco dos demais controles. A ação SHALL ser alcançável pelo Tab e acionável pelo teclado.

#### Scenario: Aparência do seletor de arquivo

- **WHEN** a área de backup é exibida sem restauração em andamento
- **THEN** "Escolher arquivo de backup" é apresentado com a aparência de um botão secundário

#### Scenario: Seletor de arquivo pelo teclado

- **WHEN** o usuário alcança "Escolher arquivo de backup" pelo Tab e o aciona com Enter ou Espaço
- **THEN** o indicador de foco padrão é exibido enquanto o controle tem o foco
- **AND** o navegador abre a seleção de arquivo

### Requirement: Diálogo de confirmação com mais de duas ações

O diálogo de confirmação SHALL admitir duas ou mais ações além de abandonar. Todas as ações apresentadas SHALL ser alcançáveis pelo teclado e o foco SHALL circular entre todas elas, sem escapar para o restante da página enquanto o diálogo estiver aberto. Ao abrir, o foco SHALL ir para a ação de abandonar. Escape SHALL abandonar o diálogo sem aplicar nenhuma ação, exceto enquanto uma operação estiver em processamento. Ao fechar, o foco SHALL voltar ao controle que abriu o diálogo, salvo quando uma regra de destino de foco da listagem determinar outro destino.

#### Scenario: Foco circula entre três ações

- **GIVEN** um diálogo com as ações de abandonar, pular e encerrar
- **WHEN** o usuário percorre as ações com Tab a partir da última
- **THEN** o foco volta para a primeira ação, sem sair do diálogo

#### Scenario: Foco circula para trás

- **GIVEN** um diálogo com três ações e o foco na primeira
- **WHEN** o usuário pressiona Shift+Tab
- **THEN** o foco vai para a última ação do diálogo

#### Scenario: Escape abandona sem aplicar ação

- **WHEN** o usuário pressiona Escape em um diálogo de três ações
- **THEN** nenhuma das ações é executada e o diálogo é fechado

#### Scenario: Escape durante o processamento

- **GIVEN** uma ação do diálogo já foi acionada e ainda está sendo processada
- **WHEN** o usuário pressiona Escape
- **THEN** o diálogo permanece aberto e a operação não é interrompida

#### Scenario: Diálogo de duas ações permanece inalterado

- **WHEN** o diálogo é apresentado com uma única ação além de abandonar
- **THEN** ele se comporta como antes, com foco inicial em abandonar e circulação entre as duas ações
