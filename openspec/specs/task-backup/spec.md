# task-backup Specification

## Purpose

Define a proteção local dos dados do TaskFlow por meio de exportação manual das tarefas para um arquivo versionado e de restauração segura desse arquivo, sem backend, sem novas permissões e sem expor dados que não sejam tarefas.

## Requirements

### Requirement: Acesso ao backup no Side Panel

O Side Panel SHALL oferecer uma área de backup com as ações de exportar e restaurar, acessível a partir do gerenciamento de tarefas e a partir do estado de lista vazia. O popup não SHALL oferecer exportação nem restauração.

#### Scenario: Backup acessível com tarefas existentes

- **GIVEN** existem tarefas persistidas
- **WHEN** o usuário abre o Side Panel
- **THEN** o sistema apresenta uma ação para acessar o backup, com as opções de exportar e restaurar

#### Scenario: Restauração acessível em instalação vazia

- **GIVEN** não existem tarefas persistidas
- **WHEN** o usuário visualiza o estado de lista vazia
- **THEN** o sistema oferece, além de criar a primeira tarefa, uma ação para restaurar um backup

#### Scenario: Sair da área de backup

- **WHEN** o usuário sai da área de backup sem restaurar
- **THEN** o sistema volta à listagem sem alterar as tarefas persistidas

### Requirement: Exportação manual versionada

O sistema SHALL exportar, por ação explícita do usuário, todas as tarefas persistidas para um único arquivo JSON codificado em UTF-8. O conteúdo SHALL conter `format` igual a `taskflow-backup`, `formatVersion` igual à versão atual do formato, `exportedAt` em ISO 8601 UTC, `app.version` com a versão da extensão e `tasks` com todas as tarefas e todos os seus campos persistidos, incluindo timestamps e estado dos lembretes, independentemente de pesquisa, filtros ou ordenação ativos. O arquivo SHALL ser salvo pelo mecanismo de download do navegador com nome no padrão `taskflow-backup-AAAA-MM-DD-HHmm.json`, usando data e hora locais, sem solicitar novas permissões.

#### Scenario: Exportação com tarefas

- **GIVEN** existem tarefas persistidas e um filtro ativo na listagem
- **WHEN** o usuário aciona exportar
- **THEN** o sistema gera um arquivo com `format` `taskflow-backup`, `formatVersion` 1, `exportedAt`, `app.version` e todas as tarefas persistidas, inclusive as ocultas pelo filtro
- **AND** informa que o backup foi gerado

#### Scenario: Exportação preserva os dados das tarefas

- **WHEN** um arquivo exportado é lido
- **THEN** cada tarefa contém os mesmos valores persistidos de identificador, campos editáveis, status, lembretes com `lastTriggeredFor`, `createdAt`, `updatedAt` e `completedAt`

#### Scenario: Exportação sem tarefas

- **GIVEN** não existem tarefas persistidas
- **WHEN** o usuário aciona exportar
- **THEN** o sistema gera um arquivo válido com a lista `tasks` vazia

#### Scenario: Falha ao ler as tarefas para exportar

- **WHEN** o armazenamento local não pode ser lido durante a exportação
- **THEN** o sistema não gera arquivo e informa que o backup não foi exportado

### Requirement: Exportação restrita às tarefas

O arquivo exportado SHALL ser montado exclusivamente a partir das tarefas validadas do domínio. Nenhum outro dado armazenado pela extensão, incluindo configurações ou credenciais atuais ou futuras, SHALL ser incluído no arquivo, e o sistema não SHALL registrar o conteúdo do backup em logs.

#### Scenario: Outros dados armazenados não são exportados

- **GIVEN** o armazenamento local contém tarefas e também outras chaves que não são tarefas
- **WHEN** o usuário exporta um backup
- **THEN** o arquivo contém somente os metadados do formato e as tarefas
- **AND** nenhum nome ou valor das outras chaves aparece no arquivo

### Requirement: Leitura segura do arquivo de backup

O sistema SHALL permitir escolher um arquivo local para restauração e SHALL recusá-lo, sem alterar nenhum dado, quando ele exceder 20 MiB, não for JSON válido, não contiver `format` igual a `taskflow-backup` ou não contiver `formatVersion` inteiro positivo. Cada recusa SHALL apresentar um motivo compreensível.

#### Scenario: Arquivo muito grande

- **WHEN** o usuário escolhe um arquivo maior que 20 MiB
- **THEN** o sistema recusa o arquivo sem lê-lo integralmente, informa o limite e não altera as tarefas

#### Scenario: Arquivo não é JSON

- **WHEN** o usuário escolhe um arquivo cujo conteúdo não é JSON válido
- **THEN** o sistema informa que o arquivo não pôde ser lido como backup e não altera as tarefas

#### Scenario: JSON não é backup do TaskFlow

- **WHEN** o usuário escolhe um JSON sem `format` igual a `taskflow-backup`
- **THEN** o sistema informa que o arquivo não é um backup do TaskFlow e não altera as tarefas

#### Scenario: Versão do formato inválida

- **WHEN** o arquivo tem `format` `taskflow-backup`, mas `formatVersion` ausente, não inteiro ou menor que 1
- **THEN** o sistema informa que a versão do backup é inválida e não altera as tarefas

### Requirement: Compatibilidade entre versões do formato

O sistema SHALL aceitar arquivos cuja `formatVersion` seja igual ou anterior à versão atual, SHALL convertê-los para a versão atual aplicando em sequência cada migração intermediária antes da validação, e SHALL rejeitar arquivos com `formatVersion` superior à suportada. Qualquer alteração no conteúdo do formato SHALL incrementar `formatVersion`. Propriedades desconhecidas em uma versão suportada SHALL ser ignoradas e não SHALL ser persistidas. Um arquivo de referência da versão 1 SHALL permanecer legível por todas as versões futuras.

#### Scenario: Arquivo da versão atual

- **WHEN** o usuário escolhe um backup com `formatVersion` igual à versão atual
- **THEN** o sistema o valida sem aplicar migração

#### Scenario: Arquivo de versão anterior

- **GIVEN** o sistema suporta uma versão atual posterior à versão do arquivo
- **WHEN** o usuário escolhe esse arquivo
- **THEN** o sistema aplica, em ordem, cada migração da versão do arquivo até a versão atual e valida o resultado com as regras atuais

#### Scenario: Arquivo de versão mais nova

- **WHEN** o usuário escolhe um backup com `formatVersion` superior à suportada
- **THEN** o sistema informa que o backup foi gerado por uma versão mais nova do TaskFlow e não altera as tarefas

#### Scenario: Propriedades desconhecidas

- **WHEN** um backup de versão suportada contém propriedades desconhecidas no arquivo ou nas tarefas
- **THEN** o sistema ignora essas propriedades e não as grava no armazenamento

#### Scenario: Arquivo de referência da versão 1

- **WHEN** o arquivo de referência da versão 1 é lido pela versão atual do sistema
- **THEN** ele é aceito e produz exatamente as tarefas esperadas para aquele arquivo

### Requirement: Validação integral das tarefas do backup

Após a migração, o sistema SHALL validar todas as tarefas do arquivo antes de oferecer a restauração e SHALL recusar o arquivo inteiro se qualquer tarefa for inválida. Cada tarefa SHALL satisfazer as regras de uma tarefa persistida pelo TaskFlow:

- `id` não vazio e único no arquivo;
- título sem espaços nas extremidades, não vazio e com até 200 caracteres;
- descrição até 4.000 caracteres, solicitante e responsável até 120 caracteres cada, todos sem espaços nas extremidades e não vazios quando presentes;
- status e prioridade entre os valores permitidos;
- `createdAt`, `updatedAt`, `dueAt`, `completedAt` e `lastTriggeredFor` como instantes ISO 8601 UTC válidos;
- `completedAt` presente se e somente se o status for `DONE`;
- tags sem espaços nas extremidades, não vazias, com até 30 caracteres cada, no máximo 10 e sem duplicidade ignorando maiúsculas e minúsculas;
- URL de origem com `http` ou `https`, quando presente;
- lembretes somente quando houver prazo, com deslocamentos entre os permitidos, sem deslocamento repetido e com identificadores não vazios e únicos na tarefa.

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

- **WHEN** uma tarefa possui lembrete sem prazo, deslocamento não permitido, deslocamento repetido ou identificador de lembrete repetido
- **THEN** o sistema recusa o arquivo e identifica o campo de lembretes da tarefa

#### Scenario: URL de origem inválida

- **WHEN** uma tarefa possui URL de origem que não usa `http` ou `https`
- **THEN** o sistema recusa o arquivo e identifica o campo de URL da tarefa

#### Scenario: Muitos erros

- **WHEN** o arquivo contém mais erros do que a interface consegue listar de forma legível
- **THEN** o sistema apresenta os primeiros erros e informa quantos erros adicionais existem

### Requirement: Prévia e confirmação da restauração

Antes de restaurar, o sistema SHALL apresentar uma prévia com data e hora locais de exportação, versão do formato, versão da extensão que gerou o arquivo, total de tarefas do arquivo e total de tarefas locais que serão substituídas. A prévia SHALL informar que a restauração substitui todas as tarefas atuais e que o arquivo não é criptografado. O sistema SHALL oferecer exportar os dados atuais a partir da prévia e SHALL exigir confirmação explícita adicional antes de gravar.

#### Scenario: Prévia de um backup válido

- **GIVEN** existem 3 tarefas locais
- **WHEN** o usuário escolhe um backup válido com 5 tarefas
- **THEN** o sistema mostra data de exportação, versões, 5 tarefas no arquivo e 3 tarefas locais que serão substituídas

#### Scenario: Exportar dados atuais antes de restaurar

- **WHEN** o usuário aciona exportar os dados atuais a partir da prévia
- **THEN** o sistema gera o backup das tarefas atuais e mantém a prévia disponível para continuar ou cancelar

#### Scenario: Restauração cancelada

- **WHEN** o usuário cancela na prévia ou na confirmação final
- **THEN** o sistema descarta o arquivo lido e mantém todas as tarefas atuais inalteradas

#### Scenario: Backup vazio

- **WHEN** o usuário escolhe um backup válido com a lista `tasks` vazia
- **THEN** a prévia informa que nenhuma tarefa será restaurada e que todas as tarefas locais serão removidas, e a gravação continua exigindo confirmação explícita

### Requirement: Restauração substitui todas as tarefas

Após a confirmação, o sistema SHALL substituir a coleção local inteira pelas tarefas do backup em uma única gravação, de modo que o armazenamento contenha exclusivamente as tarefas do arquivo ou permaneça como estava. O sistema SHALL preservar identificadores, campos e timestamps das tarefas restauradas, exceto por marcar como processadas as ocorrências de lembrete cujo horário já passou. O sistema não SHALL gravar outras chaves do armazenamento e não SHALL alterar dados que não sejam tarefas.

#### Scenario: Restauração bem-sucedida

- **GIVEN** existem tarefas locais que não constam no backup
- **WHEN** o usuário confirma a restauração de um backup válido
- **THEN** o armazenamento passa a conter somente as tarefas do backup, com os mesmos identificadores, `createdAt`, `updatedAt` e `completedAt`
- **AND** o sistema informa quantas tarefas foram restauradas e volta à listagem atualizada

#### Scenario: Falha ao gravar

- **WHEN** o armazenamento local rejeita a gravação da restauração
- **THEN** o sistema informa que o backup não foi restaurado e as tarefas anteriores permanecem intactas

#### Scenario: Lembretes vencidos no backup

- **GIVEN** o backup contém uma tarefa ativa com lembrete cujo horário já passou e ainda não foi processado
- **WHEN** a restauração é confirmada
- **THEN** a tarefa é restaurada com essa ocorrência marcada como processada e nenhuma notificação retroativa é exibida

#### Scenario: Outros dados armazenados são preservados

- **GIVEN** o armazenamento local contém outras chaves além das tarefas e o backup contém propriedades adicionais
- **WHEN** a restauração é concluída
- **THEN** as outras chaves permanecem com os mesmos valores e nenhuma chave nova é criada

#### Scenario: Outras superfícies refletem a restauração

- **GIVEN** o popup ou outra instância do Side Panel está aberta
- **WHEN** a restauração é concluída
- **THEN** essas superfícies passam a refletir as tarefas restauradas sem recarregamento manual

### Requirement: Lembretes após a restauração

Depois de gravar a restauração, o sistema SHALL reconciliar os alarmes com as tarefas restauradas. Falha no agendamento não SHALL desfazer a restauração e SHALL ser informada como lembretes pendentes, que voltam a ser tentados na próxima reconciliação.

#### Scenario: Alarmes das tarefas restauradas

- **WHEN** um backup com tarefas ativas e lembretes futuros é restaurado
- **THEN** os alarmes desses lembretes passam a existir e os alarmes das tarefas substituídas deixam de existir

#### Scenario: Agendamento falha após restaurar

- **WHEN** a restauração é gravada, mas a API de alarmes rejeita a reconciliação
- **THEN** as tarefas restauradas permanecem salvas e o sistema informa que há lembretes pendentes

### Requirement: Verificação da coleção gravada

Após a restauração, o sistema SHALL reler as tarefas persistidas e compará-las com a coleção gravada. Se houver divergência causada por outra alteração concorrente, o sistema SHALL informar que a restauração não pôde ser confirmada e SHALL orientar o usuário a conferir as tarefas, sem apresentar sucesso enganoso.

#### Scenario: Coleção confirmada

- **WHEN** a releitura após a restauração corresponde às tarefas gravadas
- **THEN** o sistema apresenta a restauração como concluída

#### Scenario: Alteração concorrente durante a restauração

- **WHEN** outra parte da extensão altera as tarefas entre a gravação da restauração e a releitura
- **THEN** o sistema informa que a restauração não pôde ser confirmada e recomenda conferir a listagem

### Requirement: Bloqueio diante de dados locais incompatíveis

Quando as tarefas locais estiverem em formato incompatível, o sistema SHALL bloquear exportação e restauração, SHALL explicar que os dados atuais foram preservados e não SHALL sobrescrevê-los por nenhum caminho do backup.

#### Scenario: Exportação com dados incompatíveis

- **GIVEN** as tarefas locais estão em formato incompatível
- **WHEN** o usuário tenta exportar
- **THEN** o sistema não gera arquivo e informa que os dados atuais não puderam ser lidos e foram preservados

#### Scenario: Restauração com dados incompatíveis

- **GIVEN** as tarefas locais estão em formato incompatível
- **WHEN** o usuário tenta restaurar um backup válido
- **THEN** o sistema não grava o backup, informa o bloqueio e os dados incompatíveis permanecem inalterados
