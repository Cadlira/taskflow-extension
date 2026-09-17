## MODIFIED Requirements

### Requirement: Exportação manual versionada

O sistema SHALL exportar, por ação explícita do usuário, todas as tarefas persistidas para um único arquivo JSON codificado em UTF-8. O conteúdo SHALL conter `format` igual a `taskflow-backup`, `formatVersion` igual à versão atual do formato, `exportedAt` em ISO 8601 UTC, `app.version` com a versão da extensão e `tasks` com todas as tarefas e todos os seus campos persistidos, incluindo timestamps, estado dos lembretes, subtarefas com suas marcações e, quando existirem, o identificador de série e a regra de recorrência, independentemente de pesquisa, filtros ou ordenação ativos. O arquivo SHALL ser salvo pelo mecanismo de download do navegador com nome no padrão `taskflow-backup-AAAA-MM-DD-HHmm.json`, usando data e hora locais, sem solicitar novas permissões.

#### Scenario: Exportação com tarefas

- **GIVEN** existem tarefas persistidas e um filtro ativo na listagem
- **WHEN** o usuário aciona exportar
- **THEN** o sistema gera um arquivo com `format` `taskflow-backup`, `formatVersion` 4, `exportedAt`, `app.version` e todas as tarefas persistidas, inclusive as ocultas pelo filtro
- **AND** informa que o backup foi gerado

#### Scenario: Exportação preserva os dados das tarefas

- **WHEN** um arquivo exportado é lido
- **THEN** cada tarefa contém os mesmos valores persistidos de identificador, campos editáveis, status, lembretes relativos ou absolutos com `processedFor`, `createdAt`, `updatedAt` e `completedAt`
- **AND** as tarefas de série contêm o mesmo `seriesId` persistido, e a ocorrência que carrega a regra contém sua recorrência completa
- **AND** cada tarefa contém suas subtarefas na ordem persistida, com identificador, título e marcação

#### Scenario: Exportação sem tarefas

- **GIVEN** não existem tarefas persistidas
- **WHEN** o usuário aciona exportar
- **THEN** o sistema gera um arquivo válido da versão 4 com a lista `tasks` vazia

#### Scenario: Falha ao ler as tarefas para exportar

- **WHEN** o armazenamento local não pode ser lido durante a exportação
- **THEN** o sistema não gera arquivo e informa que o backup não foi exportado

### Requirement: Compatibilidade entre versões do formato

O sistema SHALL aceitar arquivos cuja `formatVersion` seja igual ou anterior à versão atual, SHALL convertê-los para a versão atual aplicando em sequência cada migração intermediária antes da validação, e SHALL rejeitar arquivos com `formatVersion` superior à suportada. Qualquer alteração no conteúdo do formato SHALL incrementar `formatVersion`. Propriedades desconhecidas em uma versão suportada SHALL ser ignoradas e não SHALL ser persistidas. Os arquivos de referência das versões 1, 2, 3 e 4 SHALL permanecer legíveis por todas as versões futuras.

#### Scenario: Arquivo da versão atual

- **WHEN** o usuário escolhe um backup com `formatVersion` igual a 4
- **THEN** o sistema o valida sem aplicar migração

#### Scenario: Arquivo da versão 1

- **WHEN** o usuário escolhe um backup válido com `formatVersion` 1
- **THEN** o sistema converte cada lembrete em lembrete relativo da versão 2, preserva seu identificador e deslocamento e converte `lastTriggeredFor` no instante efetivo processado quando presente
- **AND** aplica em seguida, em ordem, as migrações até a versão 4

#### Scenario: Arquivo da versão 2

- **WHEN** o usuário escolhe um backup válido com `formatVersion` 2
- **THEN** o sistema o converte para a versão 3 preservando todas as tarefas sem recorrência e sem identificador de série
- **AND** aplica em seguida a migração da versão 3 para a versão 4

#### Scenario: Arquivo da versão 3

- **WHEN** o usuário escolhe um backup válido com `formatVersion` 3
- **THEN** o sistema o converte para a versão 4 preservando todos os campos de cada tarefa e atribuindo a cada uma a lista de subtarefas vazia

#### Scenario: Arquivo de versão anterior

- **GIVEN** o sistema suporta uma versão atual posterior à versão do arquivo
- **WHEN** o usuário escolhe esse arquivo
- **THEN** o sistema aplica, em ordem, cada migração da versão do arquivo até a versão atual e valida o resultado com as regras atuais

#### Scenario: Arquivo de versão mais nova

- **WHEN** o usuário escolhe um backup com `formatVersion` superior à suportada
- **THEN** o sistema informa que o backup foi gerado por uma versão mais nova do TaskFlow e não altera as tarefas

#### Scenario: Propriedades desconhecidas

- **WHEN** um backup de versão suportada contém propriedades desconhecidas no arquivo, nas tarefas ou nas subtarefas
- **THEN** o sistema ignora essas propriedades e não as grava no armazenamento

#### Scenario: Arquivo de referência da versão 1

- **WHEN** o arquivo de referência da versão 1 é lido pela versão atual do sistema
- **THEN** ele é aceito, migrado e produz exatamente as tarefas esperadas para aquele arquivo

#### Scenario: Arquivo de referência da versão 2

- **WHEN** o arquivo de referência da versão 2 é lido pela versão atual do sistema
- **THEN** ele é aceito, migrado para a versão atual e produz exatamente as tarefas esperadas para aquele arquivo, todas sem recorrência, sem identificador de série e sem subtarefas

#### Scenario: Arquivo de referência da versão 3

- **WHEN** o arquivo de referência da versão 3 é lido pela versão atual do sistema
- **THEN** ele é aceito, migrado para a versão 4 e produz exatamente as tarefas esperadas para aquele arquivo, preservando recorrência e identificador de série e sem subtarefas

#### Scenario: Arquivo de referência da versão 4

- **WHEN** o arquivo de referência da versão 4 é lido pela versão atual do sistema
- **THEN** ele é aceito sem migração e produz exatamente as tarefas esperadas para aquele arquivo, preservando ordem, títulos e marcações das subtarefas

### Requirement: Validação integral das tarefas do backup

Após a migração, o sistema SHALL validar todas as tarefas do arquivo antes de oferecer a restauração e SHALL recusar o arquivo inteiro se qualquer tarefa for inválida. Cada tarefa SHALL satisfazer as regras de uma tarefa persistida pelo TaskFlow:

- `id` não vazio e único no arquivo;
- título sem espaços nas extremidades, não vazio e com até 200 caracteres;
- descrição até 4.000 caracteres, solicitante e responsável até 120 caracteres cada, todos sem espaços nas extremidades e não vazios quando presentes;
- status e prioridade entre os valores permitidos;
- `createdAt`, `updatedAt`, `dueAt`, `completedAt`, horários absolutos, `processedFor` e `until` como instantes ISO 8601 UTC válidos;
- `completedAt` presente se e somente se o status for `DONE`;
- tags sem espaços nas extremidades, não vazias, com até 30 caracteres cada, no máximo 10 e sem duplicidade ignorando maiúsculas e minúsculas;
- URL de origem com `http` ou `https`, quando presente;
- até dez lembretes somente quando houver prazo, cada um relativo com deslocamento inteiro seguro não negativo ou absoluto igual ou anterior ao prazo, com identificadores não vazios e únicos e sem repetição do instante efetivo;
- `seriesId` não vazio quando presente;
- regra de recorrência somente em tarefa que possua prazo e `seriesId`, com frequência entre os valores permitidos, intervalo diário inteiro de 1 a 365, de um a sete dias da semana distintos entre 0 e 6, dia do mês inteiro de 1 a 31, instante agendado representável, e sem nenhum lembrete de instante absoluto na mesma tarefa;
- `subtasks` presente como lista com no máximo 20 itens, cada um com identificador não vazio e único na tarefa, título sem espaços nas extremidades, não vazio e com até 200 caracteres, e marcação booleana.

Os erros SHALL identificar a posição da tarefa no arquivo, seu título quando disponível e o campo inválido.

#### Scenario: Backup totalmente válido

- **WHEN** todas as tarefas do arquivo satisfazem as regras
- **THEN** o sistema apresenta a prévia da restauração

#### Scenario: Uma tarefa inválida recusa o arquivo inteiro

- **GIVEN** um backup com várias tarefas válidas e uma tarefa com título de 201 caracteres
- **WHEN** o usuário escolhe o arquivo
- **THEN** o sistema não oferece a restauração, identifica a tarefa e o campo inválido e não altera nenhuma tarefa

#### Scenario: Identificadores duplicados

- **WHEN** duas tarefas do arquivo possuem o mesmo `id`
- **THEN** o sistema recusa o arquivo e informa a duplicidade

#### Scenario: Status incoerente com conclusão

- **WHEN** uma tarefa `DONE` não possui `completedAt` ou uma tarefa em outro status possui `completedAt`
- **THEN** o sistema recusa o arquivo e identifica a tarefa incoerente

#### Scenario: Lembrete inválido

- **WHEN** uma tarefa possui lembrete sem prazo, tipo desconhecido, configuração temporal inválida, instante efetivo repetido ou identificador de lembrete repetido
- **THEN** o sistema recusa o arquivo e identifica o campo de lembretes da tarefa

#### Scenario: URL de origem inválida

- **WHEN** uma tarefa possui URL de origem que não usa `http` ou `https`
- **THEN** o sistema recusa o arquivo e identifica o campo de URL da tarefa

#### Scenario: Recorrência inválida

- **WHEN** uma tarefa possui recorrência sem prazo, sem `seriesId`, com frequência desconhecida, com parâmetro fora dos limites permitidos ou combinada com lembrete de instante absoluto
- **THEN** o sistema recusa o arquivo e identifica o campo de recorrência da tarefa

#### Scenario: Subtarefas inválidas

- **WHEN** uma tarefa da versão 4 não possui `subtasks`, ou possui mais de 20 subtarefas, subtarefa sem identificador, identificador repetido na tarefa, título vazio, com espaços nas extremidades ou com mais de 200 caracteres, ou marcação não booleana
- **THEN** o sistema recusa o arquivo e identifica o campo de subtarefas da tarefa

#### Scenario: Identificador de subtarefa repetido entre tarefas é aceito

- **GIVEN** duas tarefas diferentes cujas subtarefas usam o mesmo identificador
- **WHEN** o usuário escolhe o arquivo
- **THEN** o sistema aceita o arquivo, porque a unicidade da subtarefa é exigida apenas dentro da tarefa

#### Scenario: Série com mais de uma ocorrência ativa é aceita

- **GIVEN** um backup em que duas tarefas ativas compartilham o mesmo `seriesId` e apenas uma carrega a regra
- **WHEN** o usuário escolhe o arquivo
- **THEN** o sistema aceita o arquivo, por ser uma composição válida de tarefas persistidas

#### Scenario: Muitos erros

- **WHEN** o arquivo contém mais erros do que a interface consegue listar de forma legível
- **THEN** o sistema apresenta os primeiros erros e informa quantos erros adicionais existem
