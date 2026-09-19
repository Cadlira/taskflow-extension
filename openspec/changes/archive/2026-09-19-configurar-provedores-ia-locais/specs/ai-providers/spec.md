## Purpose

Define como o usuário configura, no próprio dispositivo, um provedor de IA com credencial própria — provedor, base da API, chave e modelo —, como a extensão obtém e revoga a permissão de rede correspondente, e como essa credencial é verificada sem que nenhum dado de tarefa saia do dispositivo e sem que ela apareça em exportações, mensagens ou logs.

## ADDED Requirements

### Requirement: Área de provedores opcional e sem efeito quando vazia

O Side Panel SHALL oferecer uma área de provedores de IA alcançável a partir do gerenciamento de tarefas. O popup não SHALL oferecer configuração de IA. Enquanto não houver configuração salva, o TaskFlow SHALL se comportar exatamente como antes desta capability: nenhuma permissão adicional concedida, nenhuma requisição de rede, nenhum trabalho novo na inicialização e nenhuma alteração nos fluxos de tarefa, captura, lembrete, backup ou lixeira.

#### Scenario: Instalação sem configuração de IA

- **GIVEN** nenhuma configuração de provedor foi salva
- **WHEN** o usuário usa o TaskFlow para criar, editar, concluir e excluir tarefas
- **THEN** o sistema não realiza nenhuma requisição de rede
- **AND** não solicita nenhuma permissão
- **AND** todos os fluxos existentes permanecem inalterados

#### Scenario: Acesso à área de provedores

- **WHEN** o usuário abre a área de provedores de IA a partir do gerenciamento de tarefas
- **THEN** o sistema apresenta a configuração atual ou o estado de nenhum provedor configurado
- **AND** informa que a IA é opcional e que o TaskFlow funciona integralmente sem ela

#### Scenario: Popup não configura IA

- **WHEN** o usuário abre o popup do Quick Add
- **THEN** o sistema não apresenta nenhuma ação de configuração de IA

### Requirement: Seleção de provedor e base da API

O sistema SHALL admitir exatamente três provedores: `OPENAI`, `ANTHROPIC` e `CUSTOM`. Para `OPENAI` e `ANTHROPIC` a base da API SHALL ser fixa, definida pela extensão, e o sistema não SHALL oferecer campo para alterá-la. Para `CUSTOM` a base SHALL ser informada pelo usuário, SHALL ser obrigatória e SHALL usar o protocolo compatível com OpenAI. Provedores em execução local, como Ollama e LM Studio, SHALL ser configurados por `CUSTOM`.

O sistema SHALL manter no máximo uma configuração ativa. Salvar uma nova configuração SHALL substituir a anterior por completo.

#### Scenario: Provedor oficial sem campo de base

- **WHEN** o usuário seleciona `OPENAI` ou `ANTHROPIC`
- **THEN** o sistema não apresenta campo de base da API
- **AND** exibe a base fixa que será usada, de forma legível e não editável

#### Scenario: Provedor customizado exige base

- **GIVEN** o usuário selecionou `CUSTOM`
- **WHEN** o usuário tenta salvar sem informar a base da API
- **THEN** o sistema recusa a gravação, indica o campo obrigatório e não altera a configuração salva

#### Scenario: Substituição da configuração existente

- **GIVEN** existe uma configuração salva para `OPENAI`
- **WHEN** o usuário salva uma configuração para `CUSTOM`
- **THEN** o sistema passa a ter exclusivamente a configuração de `CUSTOM`
- **AND** nenhum resquício da configuração anterior permanece persistido

### Requirement: Validação da base informada pelo usuário

Para `CUSTOM`, o sistema SHALL aceitar a base somente quando ela for uma URL absoluta que satisfaça todas as condições abaixo, e SHALL recusá-la com motivo compreensível em qualquer outro caso, sem gravar nada:

- esquema `https`; ou esquema `http` exclusivamente quando o host for `localhost`, `127.0.0.1` ou `[::1]`;
- sem nome de usuário e sem senha embutidos na URL;
- sem cadeia de consulta e sem fragmento, porque uma credencial colocada nesses trechos é registrada nos logs do servidor de destino;
- caminho permitido, para admitir gateways servidos sob prefixo.

Antes do primeiro envio, o sistema SHALL apresentar em destaque a origem resolvida para a qual as requisições serão feitas.

#### Scenario: Base remota sem TLS recusada

- **WHEN** o usuário informa `http://gateway.exemplo/v1` como base
- **THEN** o sistema recusa a base, explica que endereços remotos exigem `https` e não grava a configuração

#### Scenario: Base em loopback aceita sem TLS

- **WHEN** o usuário informa `http://localhost:11434/v1` como base
- **THEN** o sistema aceita a base, porque o tráfego não deixa o dispositivo

#### Scenario: Credenciais embutidas na URL recusadas

- **WHEN** o usuário informa uma base contendo nome de usuário ou senha
- **THEN** o sistema recusa a base e explica que credenciais não podem ser embutidas no endereço

#### Scenario: Consulta e fragmento recusados

- **WHEN** o usuário informa uma base contendo cadeia de consulta ou fragmento
- **THEN** o sistema recusa a base e explica que a chave não deve viajar no endereço

#### Scenario: Origem resolvida apresentada antes do envio

- **GIVEN** o usuário informou uma base válida para `CUSTOM`
- **WHEN** o sistema apresenta a configuração pronta para teste
- **THEN** exibe em destaque a origem para a qual as requisições serão feitas

### Requirement: Persistência local isolada da credencial

O sistema SHALL persistir a configuração de provedor em uma chave própria do armazenamento local da extensão, distinta das chaves de tarefas e de lixeira, com envelope contendo a versão do esquema, de modo que versões futuras possam ser migradas. O sistema não SHALL usar armazenamento sincronizado pelo navegador, para que a credencial não seja replicada para os servidores do navegador nem para outros dispositivos do perfil. O sistema não SHALL cifrar a credencial com material de chave guardado no mesmo armazenamento.

Quando a configuração persistida estiver em formato incompatível, o sistema SHALL apresentar o problema, SHALL bloquear o uso e o teste, e não SHALL sobrescrevê-la por nenhum caminho automático; SHALL restar ao usuário apenas removê-la explicitamente.

#### Scenario: Chave separada das tarefas

- **WHEN** o usuário salva uma configuração de provedor
- **THEN** o sistema grava exclusivamente a chave de configuração de IA
- **AND** as chaves de tarefas e de lixeira permanecem inalteradas

#### Scenario: Armazenamento sincronizado não é usado

- **WHEN** o usuário salva uma configuração de provedor
- **THEN** o sistema não grava nada no armazenamento sincronizado do navegador

#### Scenario: Configuração persistida incompatível

- **GIVEN** a chave de configuração de IA contém uma estrutura desconhecida
- **WHEN** o usuário abre a área de provedores
- **THEN** o sistema informa que a configuração salva está em formato incompatível e que nada foi alterado
- **AND** bloqueia salvar e testar até que o usuário remova a configuração explicitamente

### Requirement: Credencial permanece fora de exportações

A credencial e qualquer parte da configuração de provedor não SHALL ser incluída em nenhum arquivo gerado pelo TaskFlow, incluindo o arquivo de backup. Restaurar um backup não SHALL criar, alterar nem remover a configuração de provedor.

#### Scenario: Exportação com credencial configurada

- **GIVEN** existe uma configuração de provedor salva com chave e existem tarefas persistidas
- **WHEN** o usuário exporta um backup
- **THEN** o conteúdo do arquivo não contém a credencial, o modelo, a base da API nem o nome da chave de armazenamento da configuração de IA
- **AND** contém apenas as tarefas e os metadados já previstos pelo formato de backup

#### Scenario: Restauração preserva a configuração de provedor

- **GIVEN** existe uma configuração de provedor salva
- **WHEN** o usuário restaura um backup válido
- **THEN** as tarefas são substituídas conforme o formato de backup
- **AND** a configuração de provedor permanece exatamente como estava

#### Scenario: Backup não injeta configuração de provedor

- **GIVEN** não existe configuração de provedor salva
- **AND** o arquivo escolhido contém propriedades desconhecidas que se parecem com configuração de IA
- **WHEN** o usuário restaura esse backup
- **THEN** nenhuma configuração de provedor passa a existir

### Requirement: Credencial permanece fora de logs e mensagens

O sistema não SHALL registrar em log a credencial, a URL completa de qualquer requisição de IA, nem o corpo bruto de qualquer resposta do provedor. O corpo de erro devolvido por um provedor SHALL ser tratado como potencialmente contendo a credencial, porque provedores ecoam trechos da chave em mensagens de chave inválida e um gateway operado por terceiros pode ecoá-la por completo.

Toda falha apresentada ao usuário ou registrada SHALL ser um motivo de um conjunto fechado definido pelo TaskFlow, acompanhado no máximo da origem de destino e do código de estado HTTP. O sistema não SHALL anexar a objetos de erro dados da requisição que contenham cabeçalhos ou credencial.

#### Scenario: Erro de credencial inválida devolvido pelo provedor

- **GIVEN** o provedor responde com estado 401 e um corpo que contém um trecho da chave
- **WHEN** o sistema trata a resposta
- **THEN** apresenta ao usuário o motivo de credencial inválida
- **AND** não apresenta nem registra o corpo devolvido pelo provedor

#### Scenario: Falha de rede registrada sem endereço completo

- **GIVEN** a requisição falha antes de obter resposta
- **WHEN** o sistema registra a falha
- **THEN** registra no máximo o motivo e a origem de destino
- **AND** não registra o caminho completo, a cadeia de consulta nem qualquer cabeçalho

#### Scenario: Resposta bem-sucedida não é persistida

- **WHEN** o teste de conexão termina com sucesso
- **THEN** o sistema não persiste nem registra o corpo da resposta

### Requirement: Apresentação e edição protegidas da credencial

O campo de credencial SHALL ocultar o valor digitado por padrão e SHALL oferecer uma ação explícita para revelá-lo. Ao reabrir a área com uma configuração já salva, o sistema não SHALL preencher o campo com a credencial armazenada; SHALL indicar que existe credencial salva por meio de uma marca que não permita reconstruí-la. Gravar SHALL substituir a credencial somente quando o usuário digitar um valor novo; deixar o campo intocado SHALL preservar a credencial existente.

#### Scenario: Credencial oculta por padrão

- **WHEN** o usuário digita a credencial
- **THEN** o sistema oculta os caracteres
- **AND** oferece uma ação explícita para revelá-los

#### Scenario: Reabertura não expõe a credencial salva

- **GIVEN** existe uma configuração salva com credencial
- **WHEN** o usuário reabre a área de provedores
- **THEN** o campo de credencial não contém o valor armazenado
- **AND** o sistema indica que existe credencial salva sem permitir reconstruí-la

#### Scenario: Alterar apenas o modelo preserva a credencial

- **GIVEN** existe uma configuração salva com credencial
- **WHEN** o usuário altera somente o modelo e salva
- **THEN** a credencial permanece a mesma

### Requirement: Permissão de host concedida por gesto e restrita à origem

O sistema não SHALL exigir nenhuma permissão adicional no momento da instalação ou da atualização da extensão. O acesso de rede a um provedor SHALL ser obtido em tempo de execução, a partir de um gesto explícito do usuário, e SHALL ser solicitado exclusivamente para a origem do provedor configurado, nunca para um padrão abrangente.

Quando a permissão for recusada, o sistema SHALL informar que ela é necessária para contatar o provedor e não SHALL enviar nada.

#### Scenario: Nenhuma permissão nova na instalação

- **WHEN** a extensão é instalada ou atualizada
- **THEN** o conjunto de permissões exigidas permanece o mesmo de antes desta capability

#### Scenario: Concessão restrita à origem configurada

- **GIVEN** o usuário configurou `CUSTOM` com base `https://gateway.exemplo/v1`
- **WHEN** o usuário aciona o teste de conexão e concede a permissão
- **THEN** o sistema solicita acesso apenas à origem `https://gateway.exemplo`
- **AND** não solicita acesso a nenhuma outra origem

#### Scenario: Permissão recusada

- **GIVEN** o usuário aciona o teste de conexão
- **WHEN** o usuário recusa a permissão
- **THEN** o sistema informa que a permissão é necessária para contatar o provedor
- **AND** nenhuma requisição é feita e nenhuma credencial é enviada

### Requirement: Revogação e remoção da configuração

O sistema SHALL oferecer uma ação explícita de remover a configuração de provedor. Remover SHALL apagar a credencial e o restante da configuração do armazenamento local e SHALL revogar a permissão de host concedida para aquela origem, de modo que a extensão não retenha acesso que não usa mais.

Quando a permissão de host for revogada por fora da extensão, o sistema SHALL detectar a ausência ao abrir a área ou ao tentar testar, SHALL informar que a permissão foi revogada e SHALL oferecer concedê-la novamente, sem apresentar uma falha genérica.

#### Scenario: Remoção apaga credencial e revoga permissão

- **GIVEN** existe uma configuração salva com permissão concedida para sua origem
- **WHEN** o usuário remove a configuração e confirma
- **THEN** a configuração deixa de existir no armazenamento local
- **AND** a permissão de host daquela origem é revogada
- **AND** as tarefas, a lixeira e os lembretes permanecem inalterados

#### Scenario: Permissão revogada por fora da extensão

- **GIVEN** existe uma configuração salva e o usuário revogou a permissão de host nas configurações do navegador
- **WHEN** o usuário abre a área de provedores
- **THEN** o sistema informa que a permissão foi revogada e oferece concedê-la novamente

### Requirement: Consentimento explícito antes do primeiro envio

O teste de conexão é o primeiro momento em que qualquer informação do TaskFlow deixa o dispositivo. Antes do primeiro envio a uma origem, o sistema SHALL informar de forma inequívoca que a credencial será enviada àquela origem e SHALL exigir ação explícita do usuário para prosseguir. Alterar o provedor ou a base SHALL reapresentar esse aviso antes do próximo envio.

#### Scenario: Aviso antes do primeiro teste

- **GIVEN** o usuário preencheu provedor, base quando aplicável, credencial e modelo
- **WHEN** o usuário aciona o teste de conexão pela primeira vez para aquela origem
- **THEN** o sistema informa que a credencial será enviada para a origem indicada
- **AND** só prossegue após ação explícita do usuário

#### Scenario: Troca de origem reapresenta o aviso

- **GIVEN** o usuário já testou com sucesso uma origem
- **WHEN** o usuário altera a base para outra origem e aciona o teste
- **THEN** o sistema reapresenta o aviso referente à nova origem antes de enviar

### Requirement: Teste de conexão sem enviar conteúdo de tarefa

O teste de conexão SHALL ser executado somente por acionamento direto do usuário. Ele SHALL verificar credencial e endereço consultando a listagem de modelos do provedor, sem enviar nenhum conteúdo de tarefa, nenhum texto do usuário e nenhum dado pessoal. Quando o endereço não oferecer a listagem de modelos, o sistema SHALL informar isso e SHALL oferecer, como alternativa explícita, um envio mínimo de verificação com conteúdo literal fixo e limite de um token de resposta, nunca conteúdo de tarefa.

O teste SHALL ter limite de tempo e SHALL ser cancelável, de modo que nunca fique pendente indefinidamente. O resultado SHALL distinguir, no mínimo, sucesso, credencial inválida, origem inalcançável, permissão ausente, tempo esgotado e resposta inesperada. O sistema não SHALL seguir redirecionamentos, porque um redirecionamento desviaria a credencial para outro destino.

#### Scenario: Teste bem-sucedido

- **GIVEN** a configuração é válida e a permissão foi concedida
- **WHEN** o usuário aciona o teste de conexão
- **THEN** o sistema consulta a listagem de modelos do provedor sem enviar conteúdo de tarefa
- **AND** informa sucesso

#### Scenario: Tempo esgotado

- **GIVEN** a origem configurada não responde
- **WHEN** o limite de tempo do teste é atingido
- **THEN** o sistema aborta a requisição e informa tempo esgotado
- **AND** a configuração permanece inalterada

#### Scenario: Listagem de modelos indisponível

- **GIVEN** a origem configurada não oferece a listagem de modelos
- **WHEN** o teste de conexão obtém resposta de recurso inexistente
- **THEN** o sistema informa que a listagem não está disponível
- **AND** oferece um envio mínimo de verificação com conteúdo literal fixo, deixando claro que nenhum dado de tarefa será enviado

#### Scenario: Redirecionamento recusado

- **GIVEN** a origem configurada responde com redirecionamento
- **WHEN** o sistema recebe a resposta
- **THEN** não segue o redirecionamento e informa resposta inesperada

### Requirement: Nenhuma requisição de IA automática

O sistema não SHALL realizar nenhuma requisição a provedor de IA fora de um acionamento direto do usuário. Em particular, não SHALL fazê-la na instalação, na atualização, na inicialização do navegador, ao despertar o service worker, ao disparar um alarme de lembrete, ao abrir o popup ou o Side Panel, nem por qualquer agendamento periódico.

#### Scenario: Inicialização não contata provedor

- **GIVEN** existe uma configuração salva com permissão concedida
- **WHEN** o navegador inicia, a extensão é atualizada ou um alarme de lembrete dispara
- **THEN** o sistema não realiza nenhuma requisição ao provedor

#### Scenario: Abrir a área não contata provedor

- **GIVEN** existe uma configuração salva com permissão concedida
- **WHEN** o usuário abre a área de provedores
- **THEN** o sistema apresenta a configuração sem realizar nenhuma requisição

### Requirement: Contrato de protocolo por provedor

As requisições SHALL seguir o contrato do provedor selecionado, de modo que uma configuração correta funcione sem intervenção adicional do usuário:

- `OPENAI` e `CUSTOM` SHALL usar o protocolo compatível com OpenAI, autenticando pelo cabeçalho de portador.
- `ANTHROPIC` SHALL autenticar pelo cabeçalho de chave próprio da Anthropic, SHALL informar a versão da API e SHALL enviar o cabeçalho que a Anthropic exige para admitir acesso direto a partir de um navegador. Sem esse cabeçalho a requisição é recusada pelo provedor mesmo com permissão concedida e credencial válida.

Nenhuma requisição SHALL ser emitida a partir do service worker; o caminho de rede desta capability pertence ao Side Panel, onde ocorre o gesto do usuário.

#### Scenario: Autenticação compatível com OpenAI

- **GIVEN** o provedor selecionado é `OPENAI` ou `CUSTOM`
- **WHEN** o sistema emite a requisição de teste
- **THEN** autentica pelo cabeçalho de portador

#### Scenario: Acesso direto do navegador à Anthropic

- **GIVEN** o provedor selecionado é `ANTHROPIC`
- **WHEN** o sistema emite a requisição de teste
- **THEN** envia o cabeçalho de chave da Anthropic, a versão da API e o cabeçalho que admite acesso direto a partir de um navegador

#### Scenario: Service worker sem caminho de rede de IA

- **WHEN** o service worker é despertado por qualquer evento
- **THEN** nenhum caminho de código de provedor de IA é executado nele
