## MODIFIED Requirements

### Requirement: Exportação manual versionada

O sistema SHALL exportar, por ação explícita do usuário, todas as tarefas persistidas para um único arquivo JSON codificado em UTF-8. O conteúdo SHALL conter `format` igual a `taskflow-backup`, `formatVersion` igual à versão atual do formato, `exportedAt` em ISO 8601 UTC, `app.version` com a versão da extensão e `tasks` com todas as tarefas e todos os seus campos persistidos, incluindo timestamps e estado dos lembretes, independentemente de pesquisa, filtros ou ordenação ativos. O arquivo SHALL ser salvo pelo mecanismo de download do navegador com nome no padrão `taskflow-backup-AAAA-MM-DD-HHmm.json`, usando data e hora locais, sem solicitar novas permissões.

#### Scenario: Exportação com tarefas

- **GIVEN** existem tarefas persistidas e um filtro ativo na listagem
- **WHEN** o usuário aciona exportar
- **THEN** o sistema gera um arquivo com `format` `taskflow-backup`, `formatVersion` 2, `exportedAt`, `app.version` e todas as tarefas persistidas, inclusive as ocultas pelo filtro
- **AND** informa que o backup foi gerado

#### Scenario: Exportação preserva os dados das tarefas

- **WHEN** um arquivo exportado é lido
- **THEN** cada tarefa contém os mesmos valores persistidos de identificador, campos editáveis, status, lembretes relativos ou absolutos com `processedFor`, `createdAt`, `updatedAt` e `completedAt`

#### Scenario: Exportação sem tarefas

- **GIVEN** não existem tarefas persistidas
- **WHEN** o usuário aciona exportar
- **THEN** o sistema gera um arquivo válido da versão 2 com a lista `tasks` vazia

#### Scenario: Falha ao ler as tarefas para exportar

- **WHEN** o armazenamento local não pode ser lido durante a exportação
- **THEN** o sistema não gera arquivo e informa que o backup não foi exportado

### Requirement: Compatibilidade entre versões do formato

O sistema SHALL aceitar arquivos cuja `formatVersion` seja igual ou anterior à versão atual, SHALL convertê-los para a versão atual aplicando em sequência cada migração intermediária antes da validação, e SHALL rejeitar arquivos com `formatVersion` superior à suportada. Qualquer alteração no conteúdo do formato SHALL incrementar `formatVersion`. Propriedades desconhecidas em uma versão suportada SHALL ser ignoradas e não SHALL ser persistidas. Os arquivos de referência das versões 1 e 2 SHALL permanecer legíveis por todas as versões futuras.

#### Scenario: Arquivo da versão atual

- **WHEN** o usuário escolhe um backup com `formatVersion` igual a 2
- **THEN** o sistema o valida sem aplicar migração

#### Scenario: Arquivo da versão 1

- **WHEN** o usuário escolhe um backup válido com `formatVersion` 1
- **THEN** o sistema converte cada lembrete em lembrete relativo da versão 2, preserva seu identificador e deslocamento e converte `lastTriggeredFor` no instante efetivo processado quando presente

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
- **THEN** ele é aceito, migrado e produz exatamente as tarefas esperadas para aquele arquivo

#### Scenario: Arquivo de referência da versão 2

- **WHEN** o arquivo de referência da versão 2 é lido pela versão atual do sistema
- **THEN** ele é aceito sem migração e produz exatamente as tarefas esperadas para aquele arquivo

### Requirement: Validação integral das tarefas do backup

Após a migração, o sistema SHALL validar todas as tarefas do arquivo antes de oferecer a restauração e SHALL recusar o arquivo inteiro se qualquer tarefa for inválida. Cada tarefa SHALL satisfazer as regras de uma tarefa persistida pelo TaskFlow:

- `id` não vazio e único no arquivo;
- título sem espaços nas extremidades, não vazio e com até 200 caracteres;
- descrição até 4.000 caracteres, solicitante e responsável até 120 caracteres cada, todos sem espaços nas extremidades e não vazios quando presentes;
- status e prioridade entre os valores permitidos;
- `createdAt`, `updatedAt`, `dueAt`, `completedAt`, horários absolutos e `processedFor` como instantes ISO 8601 UTC válidos;
- `completedAt` presente se e somente se o status for `DONE`;
- tags sem espaços nas extremidades, não vazias, com até 30 caracteres cada, no máximo 10 e sem duplicidade ignorando maiúsculas e minúsculas;
- URL de origem com `http` ou `https`, quando presente;
- até dez lembretes somente quando houver prazo, cada um relativo com deslocamento inteiro seguro não negativo ou absoluto igual ou anterior ao prazo, com identificadores não vazios e únicos e sem repetição do instante efetivo.

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

#### Scenario: Muitos erros

- **WHEN** o arquivo contém mais erros do que a interface consegue listar de forma legível
- **THEN** o sistema apresenta os primeiros erros e informa quantos erros adicionais existem

### Requirement: Restauração substitui todas as tarefas

Após a confirmação, o sistema SHALL substituir a coleção local inteira pelas tarefas do backup em uma única gravação, de modo que o armazenamento contenha exclusivamente as tarefas do arquivo ou permaneça como estava. O sistema SHALL preservar identificadores, campos e timestamps das tarefas restauradas, exceto por marcar como processadas as ocorrências de lembrete cujo instante efetivo já passou. O sistema não SHALL gravar outras chaves do armazenamento e não SHALL alterar dados que não sejam tarefas.

#### Scenario: Restauração bem-sucedida

- **GIVEN** existem tarefas locais que não constam no backup
- **WHEN** o usuário confirma a restauração de um backup válido
- **THEN** o armazenamento passa a conter somente as tarefas do backup, com os mesmos identificadores, `createdAt`, `updatedAt` e `completedAt`
- **AND** o sistema informa quantas tarefas foram restauradas e volta à listagem atualizada

#### Scenario: Falha ao gravar

- **WHEN** o armazenamento local rejeita a gravação da restauração
- **THEN** o sistema informa que o backup não foi restaurado e as tarefas anteriores permanecem intactas

#### Scenario: Lembretes vencidos no backup

- **GIVEN** o backup contém uma tarefa ativa com ocorrência de lembrete cujo instante efetivo já passou e ainda não foi processada
- **WHEN** a restauração é confirmada
- **THEN** a tarefa é restaurada com `processedFor` correspondente a esse instante e nenhuma notificação retroativa é exibida

#### Scenario: Outros dados armazenados são preservados

- **GIVEN** o armazenamento local contém outras chaves além das tarefas e o backup contém propriedades adicionais
- **WHEN** a restauração é concluída
- **THEN** as outras chaves permanecem com os mesmos valores e nenhuma chave nova é criada

#### Scenario: Outras superfícies refletem a restauração

- **GIVEN** o popup ou outra instância do Side Panel está aberta
- **WHEN** a restauração é concluída
- **THEN** essas superfícies passam a refletir as tarefas restauradas sem recarregamento manual
