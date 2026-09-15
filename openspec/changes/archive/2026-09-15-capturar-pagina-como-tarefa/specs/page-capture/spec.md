## Purpose

Define como o TaskFlow transforma a página atual ou um texto selecionado em um rascunho de tarefa, pelo popup ou pelo menu de contexto, sempre por gesto explícito do usuário, com revisão antes de salvar e com o menor conjunto de permissões do navegador.

## ADDED Requirements

### Requirement: Captura da página atual pelo popup

O Quick Add SHALL oferecer a ação "Usar página atual". Somente quando essa ação for acionada, o sistema SHALL ler o título e a URL da aba ativa da janela atual. Quando o campo de título estiver vazio, o sistema SHALL preenchê-lo com o título capturado conforme o mapeamento de campos; quando o usuário já tiver digitado um título, o sistema MUST preservá-lo. A URL capturada SHALL ser exibida no campo "URL de origem" do Quick Add. A captura MUST NOT salvar a tarefa: a criação continua exigindo a confirmação do formulário e as validações da tarefa.

#### Scenario: Página http é capturada com título vazio

- **GIVEN** o popup está aberto sobre uma página `https` com título "Chamado 4521 – Portal" e o campo de título está vazio
- **WHEN** o usuário aciona "Usar página atual"
- **THEN** o título é preenchido com "Chamado 4521 – Portal"
- **AND** o campo "URL de origem" é exibido com a URL da página
- **AND** nenhuma tarefa é persistida

#### Scenario: Título digitado é preservado

- **GIVEN** o usuário digitou "Responder cliente" no título do Quick Add
- **WHEN** o usuário aciona "Usar página atual" sobre uma página `https`
- **THEN** o título permanece "Responder cliente"
- **AND** o campo "URL de origem" é exibido com a URL da página

#### Scenario: Tarefa capturada é salva com a URL de origem

- **GIVEN** o usuário capturou a página atual e manteve a URL de origem exibida
- **WHEN** o usuário confirma o Quick Add com dados válidos
- **THEN** o sistema persiste uma nova tarefa `TODO` com o título informado e `sourceUrl` igual à URL exibida

#### Scenario: Página sem título

- **GIVEN** a aba ativa usa `https` e seu título, após a normalização, é vazio
- **WHEN** o usuário aciona "Usar página atual" com o título do Quick Add vazio
- **THEN** o título permanece vazio e a URL de origem é exibida
- **AND** salvar sem informar um título mostra o erro de título obrigatório

### Requirement: Página não capturável pelo popup

Quando a aba ativa não tiver URL `http` ou `https`, ou quando a aba ativa, seu título ou sua URL não puderem ser lidos, a ação "Usar página atual" SHALL informar o motivo no popup e MUST NOT alterar os valores já digitados no Quick Add.

#### Scenario: Página interna do navegador

- **GIVEN** a aba ativa exibe uma página `chrome://`
- **WHEN** o usuário aciona "Usar página atual"
- **THEN** o popup informa que somente páginas `http` ou `https` podem ser capturadas
- **AND** título, prazo, solicitante, responsável, prioridade e URL de origem permanecem inalterados

#### Scenario: Leitura da aba falha

- **GIVEN** o navegador rejeita a consulta da aba ativa ou não informa sua URL
- **WHEN** o usuário aciona "Usar página atual"
- **THEN** o popup informa que não foi possível ler a página atual
- **AND** os dados digitados são preservados

### Requirement: Mapeamento de campos da captura

O sistema SHALL normalizar textos capturados para o título substituindo cada sequência de espaços em branco, inclusive quebras de linha, por um único espaço e removendo espaços nas extremidades. Um título normalizado com mais de 200 caracteres SHALL ser reduzido aos primeiros 199 caracteres seguidos de "…". Na captura de página, o título normalizado da página SHALL ser o título do rascunho. Na captura de seleção, o texto selecionado normalizado SHALL ser o título; quando ele exceder 200 caracteres, o texto selecionado completo, sem espaços nas extremidades, SHALL ser a descrição, reduzido aos primeiros 3.999 caracteres seguidos de "…" quando exceder 4.000 caracteres. Quando a seleção couber no título, a descrição MUST permanecer vazia. A URL da página SHALL ser a URL de origem somente quando usar `http` ou `https`. O rascunho MUST NOT conter nenhum outro dado da página.

#### Scenario: Seleção curta vira título

- **GIVEN** o texto selecionado é "  Revisar\n contrato   de locação "
- **WHEN** o rascunho de seleção é montado
- **THEN** o título é "Revisar contrato de locação"
- **AND** a descrição fica vazia

#### Scenario: Seleção longa preenche título e descrição

- **GIVEN** o texto selecionado normalizado tem 650 caracteres
- **WHEN** o rascunho de seleção é montado
- **THEN** o título tem exatamente 200 caracteres, sendo os 199 primeiros da seleção normalizada seguidos de "…"
- **AND** a descrição contém o texto selecionado completo

#### Scenario: Seleção excede o limite da descrição

- **GIVEN** o texto selecionado tem 6.000 caracteres
- **WHEN** o rascunho de seleção é montado
- **THEN** a descrição tem exatamente 4.000 caracteres, terminando em "…"
- **AND** o rascunho passa nas validações de limite da tarefa

#### Scenario: Título de página longo é reduzido

- **GIVEN** o título da página normalizado tem 240 caracteres
- **WHEN** o rascunho de página é montado
- **THEN** o título tem exatamente 200 caracteres e termina em "…"

### Requirement: Itens de captura no menu de contexto

O TaskFlow SHALL registrar no menu de contexto do navegador o item "Adicionar página ao TaskFlow", exibido ao clicar com o botão direito sobre a página, e o item "Criar tarefa com o texto selecionado", exibido ao clicar com o botão direito sobre um texto selecionado. Os dois itens SHALL ser exibidos somente em documentos `http` ou `https`. Instalar ou atualizar a extensão MUST NOT duplicar os itens.

#### Scenario: Itens registrados na instalação

- **WHEN** a extensão é instalada
- **THEN** o menu de contexto passa a oferecer os dois itens do TaskFlow, restritos a documentos `http` e `https`

#### Scenario: Atualização não duplica itens

- **GIVEN** os itens do TaskFlow já estão registrados
- **WHEN** a extensão é atualizada
- **THEN** o menu de contexto continua com exatamente um item de cada tipo

### Requirement: Revisão da captura pelo menu no Side Panel

Ao acionar um item de captura do menu de contexto, o sistema SHALL abrir o Side Panel na janela em que o item foi acionado e SHALL apresentar o formulário completo de nova tarefa pré-preenchido com o rascunho da captura, com status `TODO` e prioridade `MEDIUM`, e com uma indicação de que os dados foram capturados e precisam ser revisados. O sistema MUST NOT persistir a tarefa até que o usuário confirme o formulário. Cancelar o formulário SHALL descartar a captura sem persistir nada. Quando a aba não for informada no acionamento, o sistema SHALL usar a URL da página informada pelo menu e deixar o título da captura de página vazio.

#### Scenario: Página é capturada pelo menu

- **GIVEN** o usuário está em uma página `https` com o Side Panel fechado
- **WHEN** o usuário aciona "Adicionar página ao TaskFlow"
- **THEN** o Side Panel abre com o formulário "Nova tarefa" contendo o título da página e a URL de origem
- **AND** nenhuma tarefa é persistida

#### Scenario: Seleção é capturada com Side Panel já aberto

- **GIVEN** o Side Panel está aberto na listagem da mesma janela
- **WHEN** o usuário seleciona um texto e aciona "Criar tarefa com o texto selecionado"
- **THEN** o Side Panel apresenta o formulário "Nova tarefa" com título, descrição e URL de origem conforme o mapeamento de campos, sem exigir recarregamento

#### Scenario: Captura revisada é salva

- **GIVEN** o formulário pré-preenchido por uma captura está aberto
- **WHEN** o usuário ajusta os campos e confirma com dados válidos
- **THEN** o sistema persiste uma nova tarefa com os valores do formulário e informa o sucesso

#### Scenario: Captura é cancelada

- **GIVEN** o formulário pré-preenchido por uma captura está aberto
- **WHEN** o usuário cancela o formulário
- **THEN** nenhuma tarefa é persistida e a captura não volta a ser apresentada

#### Scenario: Aba não informada no acionamento

- **GIVEN** o navegador aciona o item de página sem informar a aba, mas com a URL `https` da página
- **WHEN** a captura é apresentada no Side Panel
- **THEN** o título do formulário está vazio e a URL de origem é a URL informada pelo menu

### Requirement: Captura pendente única e temporária

O sistema SHALL manter no máximo uma captura pendente, válida por 10 minutos a partir do acionamento do menu. Uma nova captura SHALL substituir a anterior ainda não apresentada. A captura pendente SHALL ser mantida somente durante a sessão do navegador, MUST NOT ser gravada junto às tarefas e MUST NOT ser incluída em backups. O Side Panel SHALL apresentar somente capturas válidas destinadas à sua janela, ou sem janela identificada, e SHALL remover a captura das pendências ao apresentá-la, de modo que ela não seja apresentada novamente. Capturas expiradas ou malformadas SHALL ser descartadas sem aviso.

#### Scenario: Captura expirada é ignorada

- **GIVEN** existe uma captura pendente criada há 11 minutos
- **WHEN** o Side Panel é aberto na mesma janela
- **THEN** a listagem é exibida sem formulário pré-preenchido
- **AND** a captura deixa de estar pendente

#### Scenario: Nova captura substitui a anterior

- **GIVEN** existe uma captura pendente ainda não apresentada
- **WHEN** o usuário aciona outro item de captura
- **THEN** somente a captura mais recente é apresentada

#### Scenario: Side Panel de outra janela não consome a captura

- **GIVEN** o Side Panel do TaskFlow está aberto nas janelas A e B
- **WHEN** o usuário aciona um item de captura na janela A
- **THEN** somente o Side Panel da janela A apresenta a captura

#### Scenario: Captura não aparece em backup

- **GIVEN** existe uma captura pendente
- **WHEN** o usuário exporta um backup
- **THEN** o arquivo contém somente as tarefas persistidas

### Requirement: Captura com operação em andamento no Side Panel

Quando uma captura chegar enquanto o Side Panel exibe o formulário de criação ou edição, a área de backup ou uma confirmação de exclusão, o sistema MUST NOT substituir, fechar ou limpar essa interface e MUST NOT descartar dados digitados. O Side Panel SHALL informar que há uma captura aguardando revisão e SHALL oferecer "Descartar captura". Ao retornar à listagem, o Side Panel SHALL oferecer "Revisar captura", que abre o formulário pré-preenchido. Uma captura mantida dessa forma MUST NOT expirar enquanto o Side Panel permanecer aberto, e uma captura mais recente SHALL substituí-la.

#### Scenario: Edição não salva é preservada

- **GIVEN** o usuário está editando uma tarefa no Side Panel com alterações não salvas
- **WHEN** o usuário aciona "Criar tarefa com o texto selecionado" na mesma janela
- **THEN** o formulário de edição continua aberto com os valores digitados
- **AND** o Side Panel informa que há uma captura aguardando revisão

#### Scenario: Captura é revisada após concluir a edição

- **GIVEN** há uma captura aguardando revisão durante uma edição
- **WHEN** o usuário salva ou cancela a edição e aciona "Revisar captura" na listagem
- **THEN** o formulário "Nova tarefa" é aberto pré-preenchido com a captura

#### Scenario: Captura aguardando é descartada

- **GIVEN** há uma captura aguardando revisão
- **WHEN** o usuário aciona "Descartar captura"
- **THEN** o aviso desaparece, nenhuma tarefa é persistida e a captura não volta a ser apresentada

### Requirement: Falha ao abrir o Side Panel pela captura

Quando o navegador rejeitar a abertura do Side Panel ou a janela do acionamento não puder ser identificada, o sistema MUST NOT persistir tarefa e SHALL manter a captura pendente até sua expiração, de modo que ela seja apresentada quando o Side Panel do TaskFlow for aberto na janela correspondente dentro do prazo de validade. A falha SHALL ser registrada sem incluir título, URL ou texto selecionado.

#### Scenario: Abertura do Side Panel é rejeitada

- **GIVEN** o navegador rejeita a abertura do Side Panel ao acionar "Adicionar página ao TaskFlow"
- **WHEN** o usuário abre o gerenciamento pelo popup na mesma janela 2 minutos depois
- **THEN** o Side Panel apresenta o formulário pré-preenchido com a captura
- **AND** nenhuma tarefa foi persistida antes da confirmação

#### Scenario: Falha não expõe dados capturados

- **WHEN** a abertura do Side Panel falha durante uma captura
- **THEN** o registro de erro não contém o título, a URL nem o texto selecionado

### Requirement: Permissões mínimas para captura

O Manifest SHALL declarar exatamente as permissões `activeTab`, `alarms`, `contextMenus`, `notifications`, `sidePanel` e `storage`. O Manifest MUST NOT declarar `tabs`, `scripting`, `favicon`, `host_permissions`, `content_scripts` nem padrões `<all_urls>`. A captura MUST NOT ler o conteúdo da página, injetar código na página, ler o favicon, ler outras abas ou enviar dados para fora da extensão.

#### Scenario: Manifest gerado para produção

- **WHEN** o build de produção gera o Manifest
- **THEN** `permissions` contém exatamente `activeTab`, `alarms`, `contextMenus`, `notifications`, `sidePanel` e `storage`
- **AND** não existem `host_permissions`, `content_scripts` nem referências a `<all_urls>`

#### Scenario: Rascunho não inclui favicon

- **WHEN** qualquer captura é apresentada para revisão
- **THEN** o rascunho contém somente título, descrição quando aplicável e URL de origem
