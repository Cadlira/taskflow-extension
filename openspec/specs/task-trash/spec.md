# task-trash Specification

## Purpose

Define a lixeira local do TaskFlow, que guarda por tempo limitado as tarefas excluídas para que possam ser restauradas, sem backend, sem permissões novas e sem expor esses dados no backup ou em logs.

## Requirements

### Requirement: Exclusão move a tarefa para a lixeira

Ao confirmar a exclusão de uma tarefa, o sistema SHALL removê-la da coleção de tarefas e SHALL adicioná-la à lixeira com o instante da exclusão, em uma única gravação, de modo que a tarefa esteja em exatamente um dos dois lugares. O item da lixeira SHALL conservar todos os campos persistidos da tarefa, inclusive identificador, subtarefas, lembretes, `seriesId`, regra de recorrência e timestamps. Os alarmes da tarefa excluída SHALL ser removidos. Se a gravação falhar, a tarefa SHALL permanecer na coleção e a lixeira SHALL permanecer inalterada.

#### Scenario: Tarefa excluída vai para a lixeira

- **GIVEN** uma tarefa "Pagar aluguel" com subtarefas e lembretes
- **WHEN** o usuário confirma a exclusão
- **THEN** a tarefa deixa de aparecer na listagem
- **AND** a lixeira passa a conter a tarefa com todos os seus campos e o instante da exclusão

#### Scenario: Lembretes da tarefa excluída não disparam

- **GIVEN** uma tarefa ativa com lembrete futuro
- **WHEN** o usuário confirma a exclusão
- **THEN** o alarme desse lembrete deixa de existir e nenhuma notificação da tarefa é exibida enquanto ela estiver na lixeira

#### Scenario: Falha ao gravar a exclusão

- **WHEN** o armazenamento local rejeita a gravação da exclusão
- **THEN** o sistema informa que a tarefa não foi excluída
- **AND** a tarefa permanece na listagem e a lixeira permanece inalterada

### Requirement: Retenção e limite da lixeira

A lixeira SHALL guardar cada item por no máximo 30 dias contados do instante da exclusão e SHALL conter no máximo 100 itens. Ao adicionar um item com a lixeira cheia, o sistema SHALL descartar definitivamente os itens de exclusão mais antiga até respeitar o limite. Itens com mais de 30 dias MUST NOT ser apresentados nem restaurados e SHALL ser descartados definitivamente na próxima limpeza. A limpeza SHALL ocorrer ao excluir uma tarefa, ao abrir a área da lixeira e quando a extensão for instalada, atualizada ou iniciada, sem alarme periódico.

#### Scenario: Item vencido não é apresentado

- **GIVEN** uma tarefa excluída há 31 dias
- **WHEN** o usuário abre a área da lixeira
- **THEN** a tarefa não é apresentada e deixa de existir no armazenamento

#### Scenario: Item dentro do prazo continua disponível

- **GIVEN** uma tarefa excluída há 29 dias
- **WHEN** o usuário abre a área da lixeira
- **THEN** a tarefa é apresentada e pode ser restaurada

#### Scenario: Lixeira cheia descarta o item mais antigo

- **GIVEN** a lixeira contém 100 itens
- **WHEN** o usuário confirma a exclusão de outra tarefa
- **THEN** a lixeira passa a conter a tarefa recém-excluída e os 99 itens de exclusão mais recente
- **AND** o item de exclusão mais antiga é descartado definitivamente

#### Scenario: Limpeza na inicialização

- **GIVEN** a lixeira contém um item excluído há mais de 30 dias
- **WHEN** o navegador é iniciado com a extensão instalada
- **THEN** o item vencido é descartado sem que o usuário abra a área da lixeira

### Requirement: Área da lixeira no Side Panel

O Side Panel SHALL oferecer uma área "Lixeira", acessível a partir do gerenciamento de tarefas e a partir do estado de lista vazia. A área SHALL listar os itens da lixeira do mais recentemente excluído para o mais antigo, apresentando o título da tarefa e a data e hora locais da exclusão, e SHALL oferecer em cada item as ações "Restaurar" e "Excluir definitivamente", além da ação "Esvaziar lixeira" quando houver itens. Sem itens, a área SHALL apresentar um estado vazio que informe o prazo de 30 dias. A área SHALL refletir alterações da lixeira feitas por outra superfície sem recarregamento manual. O popup MUST NOT oferecer a lixeira.

#### Scenario: Acesso com tarefas existentes

- **GIVEN** existem tarefas persistidas
- **WHEN** o usuário aciona a lixeira no Side Panel
- **THEN** o sistema apresenta a área da lixeira com seus itens ordenados do mais recentemente excluído para o mais antigo

#### Scenario: Acesso a partir da lista vazia

- **GIVEN** o usuário excluiu todas as tarefas
- **WHEN** o Side Panel apresenta o estado de lista vazia
- **THEN** o sistema oferece, além de criar a primeira tarefa, uma ação para abrir a lixeira

#### Scenario: Lixeira vazia

- **WHEN** o usuário abre a área da lixeira sem itens
- **THEN** o sistema informa que a lixeira está vazia e que tarefas excluídas ficam disponíveis por 30 dias
- **AND** não oferece "Esvaziar lixeira"

#### Scenario: Outra superfície altera a lixeira

- **GIVEN** a área da lixeira está aberta em um Side Panel
- **WHEN** uma tarefa é excluída em outro Side Panel
- **THEN** a área aberta passa a apresentar o novo item

#### Scenario: Foco após ação na lixeira

- **GIVEN** a lixeira apresenta vários itens
- **WHEN** o usuário restaura ou exclui definitivamente um item pelo teclado
- **THEN** o foco vai para a ação "Restaurar" do item que passou a ocupar a posição dele ou, se ele era o último, do novo último item
- **AND** quando não restar item, o foco vai para a ação de voltar à listagem

### Requirement: Restauração a partir da lixeira

Ao restaurar um item, o sistema SHALL removê-lo da lixeira e SHALL devolver a tarefa à coleção em uma única gravação, preservando identificador, campos, subtarefas, `seriesId`, regra de recorrência, `createdAt`, `updatedAt` e `completedAt`, exceto por marcar como processadas as ocorrências de lembrete cujo instante efetivo já passou. Em seguida, o sistema SHALL reconciliar os alarmes da tarefa restaurada; falha no agendamento MUST NOT desfazer a restauração e SHALL ser informada como lembretes pendentes. Quando já existir na coleção uma tarefa com o mesmo identificador, o sistema SHALL recusar a restauração, SHALL manter o item na lixeira e SHALL informar o motivo.

#### Scenario: Restauração bem-sucedida

- **GIVEN** a lixeira contém uma tarefa `TODO` com prazo futuro e subtarefas
- **WHEN** o usuário aciona "Restaurar"
- **THEN** a tarefa volta à listagem com o mesmo identificador, campos, subtarefas e timestamps
- **AND** o item deixa de existir na lixeira e o sistema informa que a tarefa foi restaurada

#### Scenario: Lembrete vencido enquanto estava na lixeira

- **GIVEN** uma tarefa na lixeira com lembrete cujo instante efetivo passou depois da exclusão
- **WHEN** o usuário a restaura
- **THEN** a tarefa é restaurada com `processedFor` correspondente a esse instante
- **AND** nenhuma notificação retroativa é exibida

#### Scenario: Lembrete futuro volta a ser agendado

- **GIVEN** uma tarefa na lixeira com lembrete ainda futuro
- **WHEN** o usuário a restaura
- **THEN** o alarme desse lembrete passa a existir

#### Scenario: Identificador já existente

- **GIVEN** a lixeira contém uma tarefa cujo identificador também existe na coleção, por exemplo após restaurar um backup
- **WHEN** o usuário aciona "Restaurar"
- **THEN** o sistema recusa a restauração, informa que a tarefa já existe na listagem e mantém o item na lixeira
- **AND** a tarefa da coleção permanece inalterada

#### Scenario: Falha ao gravar a restauração

- **WHEN** o armazenamento local rejeita a gravação da restauração
- **THEN** o sistema informa que a tarefa não foi restaurada
- **AND** o item permanece na lixeira e a coleção permanece inalterada

### Requirement: Exclusão definitiva e esvaziamento

O sistema SHALL permitir excluir definitivamente um item da lixeira e esvaziar a lixeira inteira, ambos somente após confirmação explícita em diálogo que informe que a ação não pode ser desfeita. Itens excluídos definitivamente MUST NOT permanecer em nenhuma chave do armazenamento local. Abandonar a confirmação SHALL manter a lixeira inalterada.

#### Scenario: Excluir definitivamente um item

- **WHEN** o usuário aciona "Excluir definitivamente" em um item e confirma
- **THEN** o item deixa de existir na lixeira e no armazenamento local
- **AND** os demais itens permanecem

#### Scenario: Esvaziar a lixeira

- **GIVEN** a lixeira contém vários itens
- **WHEN** o usuário aciona "Esvaziar lixeira" e confirma
- **THEN** nenhum item permanece na lixeira e o sistema apresenta o estado vazio

#### Scenario: Confirmação abandonada

- **WHEN** o usuário abandona a confirmação de exclusão definitiva ou de esvaziamento
- **THEN** a lixeira permanece inalterada e o foco volta ao controle que acionou a ação

### Requirement: Lixeira isolada do backup e dos logs

O arquivo de backup MUST NOT conter itens da lixeira. A restauração de um backup MUST NOT alterar a lixeira. O sistema MUST NOT registrar em logs títulos, descrições ou qualquer outro conteúdo de itens da lixeira.

#### Scenario: Backup não inclui a lixeira

- **GIVEN** a lixeira contém itens e existem tarefas persistidas
- **WHEN** o usuário exporta um backup
- **THEN** o arquivo contém somente as tarefas da coleção e nenhum item da lixeira

#### Scenario: Restauração de backup preserva a lixeira

- **GIVEN** a lixeira contém itens
- **WHEN** o usuário restaura um backup válido
- **THEN** a lixeira continua com os mesmos itens

### Requirement: Proteção contra dados incompatíveis na lixeira

O sistema SHALL validar os itens da lixeira ao lê-los com as mesmas regras de uma tarefa persistida. Quando a lixeira estiver em formato incompatível ou com item inválido, o sistema MUST NOT sobrescrevê-la por nenhum caminho: a exclusão de tarefas SHALL falhar sem remover a tarefa, a área da lixeira SHALL informar que os dados foram preservados e a limpeza MUST NOT gravar. Quando a coleção de tarefas estiver incompatível, exclusão e restauração MUST NOT gravar nenhuma das duas chaves.

#### Scenario: Excluir com lixeira incompatível

- **GIVEN** a lixeira foi gravada em formato que esta versão não reconhece
- **WHEN** o usuário confirma a exclusão de uma tarefa
- **THEN** o sistema informa que a tarefa não foi excluída porque a lixeira não pôde ser lida
- **AND** a tarefa permanece na listagem e a lixeira permanece inalterada

#### Scenario: Abrir a lixeira incompatível

- **GIVEN** a lixeira foi gravada em formato que esta versão não reconhece
- **WHEN** o usuário abre a área da lixeira
- **THEN** o sistema informa que a lixeira não pôde ser lida e que os dados foram preservados, sem oferecer restaurar ou esvaziar

#### Scenario: Restaurar com coleção incompatível

- **GIVEN** a coleção de tarefas está em formato incompatível
- **WHEN** o usuário tenta restaurar um item da lixeira
- **THEN** o sistema não grava nenhuma alteração e informa que os dados atuais foram preservados
