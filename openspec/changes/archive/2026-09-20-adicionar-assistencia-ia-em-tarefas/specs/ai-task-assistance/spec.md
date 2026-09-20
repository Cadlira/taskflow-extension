## Purpose

Define a assistência opcional de IA aplicada a uma tarefa existente no Side Panel, começando pela sugestão de subtarefas: quando a ação é oferecida, exatamente qual conteúdo da tarefa deixa o dispositivo, como esse conteúdo é pré-visualizado e consentido, como a saída do provedor é validada pelas mesmas regras da digitação manual e como o usuário aceita, edita ou descarta cada item sem que a IA persista nada.

## ADDED Requirements

### Requirement: Assistência estritamente opcional e sem efeito quando não configurada

A assistência de IA SHALL ser oferecida exclusivamente no formulário de tarefa do Side Panel. O popup do Quick Add MUST NOT oferecer nenhuma assistência de IA.

Enquanto não houver provedor de IA configurado, o sistema não SHALL apresentar nenhum elemento de assistência, não SHALL realizar nenhuma requisição de rede e não SHALL solicitar nenhuma permissão; todos os fluxos de tarefa, captura, lembrete, backup, lixeira e desfazer SHALL permanecer exatamente como são sem esta capability.

A ação de sugerir subtarefas SHALL exigir título preenchido e SHALL estar indisponível, com motivo legível, quando o título estiver vazio ou quando a tarefa já tiver atingido o limite máximo de subtarefas.

#### Scenario: Formulário sem provedor configurado

- **GIVEN** nenhum provedor de IA está configurado
- **WHEN** o usuário abre o formulário de tarefa no Side Panel
- **THEN** nenhuma ação de assistência de IA é apresentada
- **AND** nenhuma requisição de rede é realizada
- **AND** o formulário se comporta exatamente como antes desta capability

#### Scenario: Popup não oferece assistência

- **GIVEN** existe um provedor de IA configurado com permissão concedida
- **WHEN** o usuário abre o popup do Quick Add
- **THEN** nenhuma ação de assistência de IA é apresentada

#### Scenario: Título vazio impede a sugestão

- **GIVEN** existe um provedor configurado e o campo de título está vazio
- **WHEN** o usuário observa a ação de sugerir subtarefas
- **THEN** a ação está indisponível e informa que o título é necessário
- **AND** nenhuma requisição é realizada

#### Scenario: Limite de subtarefas já atingido

- **GIVEN** a tarefa em edição já possui o número máximo de subtarefas admitido
- **WHEN** o usuário observa a ação de sugerir subtarefas
- **THEN** a ação está indisponível e informa que o limite foi atingido

#### Scenario: Permissão de host ausente

- **GIVEN** existe um provedor configurado e a permissão de host da sua origem não está concedida
- **WHEN** o usuário aciona a ação de sugerir subtarefas
- **THEN** o sistema informa que a permissão é necessária e oferece concedê-la
- **AND** nenhum conteúdo de tarefa é enviado enquanto a permissão não for concedida

### Requirement: Conteúdo enviado restrito ao título e à descrição da tarefa em edição

O sistema SHALL enviar ao provedor exclusivamente o título e a descrição da tarefa em edição, conforme estão no formulário no momento do acionamento, acompanhados apenas das instruções fixas definidas pelo TaskFlow.

O sistema MUST NOT enviar qualquer outro dado do TaskFlow, incluindo outras tarefas, identificadores, prazos, lembretes, recorrência, prioridade, status, responsável, solicitante, etiquetas, URL de origem, subtarefas existentes, conteúdo da lixeira e qualquer dado de backup.

Quando a descrição exceder o limite de envio definido pelo TaskFlow, o sistema SHALL cortá-la antes de compor o conteúdo e SHALL indicar ao usuário que houve corte.

#### Scenario: Somente título e descrição saem do dispositivo

- **GIVEN** a tarefa em edição tem título, descrição, prazo, prioridade, responsável, etiquetas, URL de origem e subtarefas existentes
- **WHEN** o usuário consente e o sistema envia a requisição
- **THEN** o conteúdo transmitido contém apenas o título, a descrição e as instruções fixas do TaskFlow
- **AND** não contém prazo, prioridade, responsável, solicitante, etiquetas, URL de origem, identificadores nem as subtarefas existentes

#### Scenario: Tarefa sem descrição

- **GIVEN** a tarefa em edição tem título preenchido e descrição vazia
- **WHEN** o usuário aciona a sugestão
- **THEN** o conteúdo enviado contém apenas o título e as instruções fixas
- **AND** nenhum marcador de descrição vazia é transmitido

#### Scenario: Descrição longa é cortada antes do envio

- **GIVEN** a descrição da tarefa excede o limite de envio definido pelo TaskFlow
- **WHEN** o sistema prepara o conteúdo
- **THEN** a descrição é cortada até o limite
- **AND** o sistema informa ao usuário que a descrição foi cortada

#### Scenario: Conteúdo reflete o formulário, não o que está persistido

- **GIVEN** o usuário alterou o título no formulário e ainda não salvou
- **WHEN** o usuário aciona a sugestão
- **THEN** o conteúdo enviado usa o título atualmente digitado no formulário

### Requirement: Pré-visualização literal do conteúdo antes do envio

Antes de qualquer requisição, o sistema SHALL apresentar ao usuário o conteúdo que será enviado, exibido em texto integral e legível, junto da origem de destino.

O texto apresentado na pré-visualização SHALL ser idêntico, caractere por caractere, ao texto efetivamente transmitido. Qualquer corte, normalização ou acréscimo de instrução fixa SHALL ser aplicado antes da pré-visualização, de modo que não exista diferença entre o que o usuário vê e o que sai do dispositivo.

Quando o usuário alterar o título ou a descrição depois de ver a pré-visualização e antes de confirmar, o sistema SHALL recompor e reapresentar a pré-visualização, e não SHALL enviar conteúdo já desatualizado.

#### Scenario: Pré-visualização apresentada com a origem

- **GIVEN** existe provedor configurado com permissão concedida e o título está preenchido
- **WHEN** o usuário aciona a ação de sugerir subtarefas
- **THEN** o sistema apresenta o conteúdo integral que será enviado
- **AND** apresenta a origem de destino
- **AND** nenhuma requisição foi realizada até aqui

#### Scenario: Pré-visualização é idêntica ao transmitido

- **GIVEN** o sistema apresentou a pré-visualização e o usuário confirmou
- **WHEN** o sistema envia a requisição
- **THEN** o conteúdo transmitido é exatamente o texto que havia sido apresentado

#### Scenario: Edição após a pré-visualização recompõe o conteúdo

- **GIVEN** a pré-visualização está apresentada
- **WHEN** o usuário altera o título ou a descrição no formulário
- **THEN** o sistema recompõe a pré-visualização a partir do conteúdo atual
- **AND** exige nova confirmação antes de enviar

### Requirement: Consentimento próprio para envio de conteúdo de tarefa

O envio de conteúdo de tarefa SHALL exigir consentimento explícito do usuário, distinto e independente do consentimento de envio de credencial usado na verificação de conexão. Ter aceitado enviar a credencial em um teste de conexão MUST NOT autorizar o envio de conteúdo de tarefa.

O consentimento SHALL valer para a origem configurada. Quando a origem mudar, o sistema SHALL exigir novo consentimento antes do próximo envio.

Quando o usuário recusar ou cancelar, o sistema não SHALL enviar nada, SHALL manter o formulário inalterado e SHALL preservar tudo o que já estava digitado.

#### Scenario: Consentimento de credencial não autoriza conteúdo

- **GIVEN** o usuário já executou com sucesso o teste de conexão para a origem configurada
- **WHEN** o usuário aciona a sugestão de subtarefas pela primeira vez
- **THEN** o sistema exige consentimento explícito para enviar conteúdo de tarefa
- **AND** só envia após ação explícita do usuário

#### Scenario: Recusa não envia nada

- **GIVEN** o sistema apresentou a pré-visualização e o pedido de consentimento
- **WHEN** o usuário recusa
- **THEN** nenhuma requisição é realizada
- **AND** o formulário permanece com todos os dados digitados

#### Scenario: Troca de origem exige novo consentimento

- **GIVEN** o usuário já consentiu em enviar conteúdo de tarefa para uma origem
- **WHEN** a configuração passa a apontar para outra origem e o usuário aciona a sugestão
- **THEN** o sistema exige novo consentimento referente à nova origem antes de enviar

### Requirement: Saída do provedor validada pelas mesmas regras da digitação manual

O sistema SHALL interpretar a resposta do provedor como uma lista de títulos de subtarefa e SHALL submetê-la exatamente às mesmas regras de validação aplicadas às subtarefas digitadas pelo usuário, incluindo título obrigatório, limite de caracteres do título e limite de quantidade de subtarefas por tarefa.

Itens inválidos SHALL ser descartados sem impedir os demais. Itens que excedam o número de vagas restantes na tarefa SHALL ser descartados. Itens repetidos dentro da própria resposta SHALL ser reduzidos a uma ocorrência.

Quando nenhum item válido restar, o sistema SHALL informar que não houve sugestão aproveitável e não SHALL alterar o formulário.

#### Scenario: Resposta com itens válidos e inválidos

- **GIVEN** a resposta do provedor contém itens válidos, um item vazio e um item acima do limite de caracteres do título
- **WHEN** o sistema interpreta a resposta
- **THEN** apresenta apenas os itens válidos como proposta
- **AND** descarta o item vazio e o item acima do limite

#### Scenario: Resposta excede as vagas restantes

- **GIVEN** a tarefa já possui subtarefas e restam menos vagas do que os itens devolvidos
- **WHEN** o sistema interpreta a resposta
- **THEN** propõe no máximo o número de itens que cabe nas vagas restantes
- **AND** informa que parte das sugestões foi descartada por limite

#### Scenario: Resposta com itens repetidos

- **GIVEN** a resposta do provedor repete o mesmo título mais de uma vez
- **WHEN** o sistema interpreta a resposta
- **THEN** o título repetido aparece uma única vez na proposta

#### Scenario: Resposta sem item aproveitável

- **GIVEN** a resposta do provedor não produz nenhum item válido
- **WHEN** o sistema interpreta a resposta
- **THEN** informa que não houve sugestão aproveitável
- **AND** o formulário permanece exatamente como estava

### Requirement: Proposta revisável que não persiste nada

A saída da IA SHALL ser apresentada como proposta revisável, nunca aplicada automaticamente. O usuário SHALL poder selecionar individualmente quais itens aceitar, SHALL poder editar o título de um item antes de aceitá-lo e SHALL poder descartar a proposta inteira.

Aceitar itens SHALL apenas acrescentá-los à lista de subtarefas ainda não salva do formulário, na mesma forma dos itens incluídos manualmente, sem marcar nenhum como concluído. Os itens aceitos SHALL permanecer editáveis e removíveis como qualquer outro item da lista.

A assistência de IA MUST NOT gravar nada no armazenamento. A tarefa SHALL ser alterada somente quando o usuário salvar o formulário, pelo mesmo caminho de gravação já existente, e essa gravação SHALL continuar oferecendo desfazer conforme a capability de desfazer.

A IA MUST NOT criar, editar, concluir, cancelar nem excluir tarefas, e MUST NOT remover ou reordenar subtarefas já existentes.

#### Scenario: Aceitação parcial da proposta

- **GIVEN** o sistema apresenta uma proposta com vários itens
- **WHEN** o usuário seleciona parte dos itens e confirma
- **THEN** somente os itens selecionados são acrescentados à lista de subtarefas do formulário
- **AND** todos entram como não concluídos
- **AND** as subtarefas que já existiam permanecem inalteradas e na mesma ordem

#### Scenario: Edição de um item antes de aceitar

- **GIVEN** o sistema apresenta uma proposta
- **WHEN** o usuário altera o título de um item e o aceita
- **THEN** o item é acrescentado com o título editado pelo usuário

#### Scenario: Descarte da proposta

- **GIVEN** o sistema apresenta uma proposta
- **WHEN** o usuário descarta a proposta
- **THEN** a lista de subtarefas do formulário permanece exatamente como estava
- **AND** nada é gravado no armazenamento

#### Scenario: Nada é persistido antes de salvar

- **GIVEN** o usuário aceitou itens da proposta
- **WHEN** o usuário fecha o formulário sem salvar
- **THEN** a tarefa persistida permanece sem os itens aceitos

#### Scenario: Gravação segue o caminho existente

- **GIVEN** o usuário aceitou itens da proposta
- **WHEN** o usuário salva o formulário com dados válidos
- **THEN** a tarefa é gravada com as subtarefas aceitas
- **AND** a mensagem de sucesso oferece desfazer, como em qualquer edição salva

### Requirement: Requisição única, limitada no tempo e cancelável

Cada acionamento SHALL produzir no máximo uma requisição ao provedor, sem streaming e com orçamento de saída limitado pelo TaskFlow. O sistema não SHALL repetir a requisição automaticamente após uma falha.

O sistema SHALL impor um limite de tempo, SHALL indicar ao usuário que a requisição está em andamento e SHALL oferecer cancelamento. Cancelar SHALL descartar qualquer resposta e não SHALL alterar o formulário.

Enquanto uma requisição estiver em andamento, um novo acionamento MUST NOT iniciar outra requisição.

#### Scenario: Progresso e cancelamento

- **GIVEN** uma requisição de sugestão está em andamento
- **WHEN** o usuário aciona o cancelamento
- **THEN** o sistema descarta a operação e informa o cancelamento
- **AND** o formulário permanece exatamente como estava

#### Scenario: Acionamento duplicado não duplica requisição

- **GIVEN** uma requisição de sugestão está em andamento
- **WHEN** o usuário aciona novamente a sugestão
- **THEN** nenhuma requisição adicional é realizada

#### Scenario: Limite de tempo excedido

- **GIVEN** o provedor não responde dentro do limite de tempo definido pelo TaskFlow
- **WHEN** o limite é atingido
- **THEN** o sistema encerra a operação, informa o motivo de tempo excedido e não repete a requisição automaticamente

### Requirement: Falhas em conjunto fechado, sem vazar credencial nem resposta

Toda falha da assistência SHALL ser apresentada e registrada como um motivo de um conjunto fechado definido pelo TaskFlow, acompanhado no máximo da origem de destino e do código de estado HTTP. O conjunto SHALL cobrir, além dos motivos já previstos para a verificação de conexão, os casos próprios da geração: resposta vazia, resposta impossível de interpretar e resposta sem item válido.

O sistema não SHALL apresentar nem registrar a credencial, a URL completa da requisição, os cabeçalhos enviados nem o corpo bruto devolvido pelo provedor. O corpo devolvido SHALL ser tratado como potencialmente contendo a credencial, inclusive em respostas de sucesso, porque um gateway operado por terceiros pode ecoá-la.

O conteúdo da resposta SHALL ser usado apenas para compor a proposta em memória e não SHALL ser persistido nem registrado em log.

#### Scenario: Credencial inválida durante a sugestão

- **GIVEN** o provedor responde com estado 401 e um corpo que contém um trecho da chave
- **WHEN** o sistema trata a resposta
- **THEN** apresenta o motivo de credencial inválida
- **AND** não apresenta nem registra o corpo devolvido pelo provedor

#### Scenario: Resposta impossível de interpretar

- **GIVEN** o provedor responde com sucesso e um corpo que não permite extrair títulos de subtarefa
- **WHEN** o sistema trata a resposta
- **THEN** apresenta o motivo de resposta impossível de interpretar
- **AND** não apresenta nem registra o corpo devolvido

#### Scenario: Falha de rede registrada sem endereço completo

- **GIVEN** a requisição falha antes de obter resposta
- **WHEN** o sistema registra a falha
- **THEN** registra no máximo o motivo e a origem de destino
- **AND** não registra o caminho completo, a cadeia de consulta nem qualquer cabeçalho

#### Scenario: Resposta bem-sucedida não é persistida

- **GIVEN** a sugestão terminou com sucesso e a proposta foi apresentada
- **WHEN** o usuário descarta a proposta ou fecha o formulário
- **THEN** nenhum trecho da resposta permanece persistido nem registrado

### Requirement: Conteúdo de tarefa de origem externa não ganha autoridade

O conteúdo de título e descrição SHALL ser tratado como dado, nunca como instrução ao modelo, porque a descrição pode ter sido montada a partir de texto selecionado em uma página web pela captura de página.

A saída do provedor MUST NOT ser capaz de acionar qualquer efeito no TaskFlow além de propor títulos de subtarefa sujeitos à validação e à confirmação do usuário. Nenhuma instrução presente na resposta SHALL alterar o destino da requisição, a configuração de provedor, os dados da tarefa ou qualquer outro estado.

#### Scenario: Descrição capturada com texto instrucional

- **GIVEN** a descrição da tarefa foi montada a partir de uma seleção em página web e contém texto que aparenta instruir o modelo
- **WHEN** o usuário aciona a sugestão e consente
- **THEN** o conteúdo é enviado como dado da tarefa
- **AND** o desfecho possível permanece sendo apenas uma proposta de títulos de subtarefa

#### Scenario: Resposta não altera configuração nem destino

- **GIVEN** a resposta do provedor contém texto que aparenta instruir uma mudança de endereço, de modelo ou de credencial
- **WHEN** o sistema interpreta a resposta
- **THEN** a configuração de provedor permanece inalterada
- **AND** nenhuma requisição adicional é realizada para outro destino
