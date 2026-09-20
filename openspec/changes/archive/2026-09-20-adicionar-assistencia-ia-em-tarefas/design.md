# Design

## Context

Ver `proposal.md` para a motivação. O que condiciona o desenho é o que a `TF-010` deixou pronto e o que ela deliberadamente não construiu.

Pronto e reaproveitável sem alteração:

- `AiProviderConfig` e `resolveApiBase` / `resolveConfigOrigin` em `src/domain/ai-provider.ts`.
- `AiProviderConfigRepository` e `HostPermissions` em `src/application/ai/`.
- Constantes da Anthropic já exportadas em `src/infrastructure/ai/anthropic-adapter.ts`: `ANTHROPIC_VERSION` e `ANTHROPIC_DIRECT_BROWSER_HEADER`, sem as quais a requisição originada de extensão é recusada.
- `validateSubtaskDrafts`, `MAX_SUBTASKS` e `SUBTASK_TITLE_LIMIT` em `src/domain/task-subtasks.ts`.
- A lista local `subtaskItems` em `src/components/tasks/TaskForm.vue`, que é estado de formulário ainda não gravado.

Ausente de propósito, e portanto o trabalho real desta Change:

- `AiConnectionTester` expõe somente `testConnection`; não existe operação de geração.
- `runAiProbe` descarta o corpo da resposta sem ler, porque provedores ecoam trechos da chave em erros.
- O único conteúdo que já saiu do dispositivo é o literal `ping`, marcado no código como "Nunca conteúdo de tarefa".

Duas restrições de infraestrutura são verificadas por teste e não são negociáveis:

- `tests/architecture/layer-boundaries.test.ts` barra `fetch(`, APIs Chrome, Vue, Pinia e imports de `@/infrastructure` dentro de `src/domain` e `src/application`.
- `src/composition/chrome-ai-service.ts` documenta que o caminho de rede vive no Side Panel, onde ocorre o gesto do usuário, e nunca no service worker, que o Manifest V3 pode encerrar no meio da requisição.

## Goals / Non-Goals

**Goals:**

- Criar uma porta de geração separada, com a mesma disciplina de privacidade da porta de verificação, agora estendida ao caso novo de ler o corpo da resposta.
- Tornar a igualdade entre pré-visualização e conteúdo transmitido uma propriedade da construção, não uma promessa da interface.
- Fazer a saída do modelo atravessar exatamente o mesmo validador da entrada digitada.
- Manter o raio de dano em zero persistência: a IA não escreve no armazenamento em nenhum caminho.

**Non-Goals:**

- Não abstrair um cliente de IA genérico com histórico de conversa, ferramentas ou múltiplos turnos. Uma requisição, uma resposta.
- Não introduzir store Pinia, chave de armazenamento nem migração de dados.
- Não usar streaming.
- Não criar uma segunda forma de editar subtarefas em paralelo à existente.

## Decisions

### 1. Porta de geração nova, em vez de estender `AiConnectionTester`

`AiConnectionTester` documenta no próprio tipo que nenhuma operação de geração existe nela, e o contrato de `runAiProbe` é "descarte o corpo". Acrescentar um método de geração ali obrigaria o mesmo executor a ora ler, ora não ler o corpo, e é justamente essa distinção que sustenta a garantia de privacidade da `TF-010`.

Decisão: uma porta `AiSubtaskSuggester` (ou equivalente) em `src/application/ai/`, com implementações próprias em `src/infrastructure/ai/`, e um executor de requisição separado do `runAiProbe`. As duas portas compartilham configuração, permissão e tradução de estado HTTP para motivo, mas não compartilham o executor.

*Alternativa considerada:* generalizar `runAiProbe` com uma opção `readBody`. Recusada porque transforma a decisão mais sensível do sistema num parâmetro booleano fácil de inverter por engano.

### 2. Montagem do conteúdo é função pura do domínio, e é a única fonte do texto

O requisito de pré-visualização exige igualdade caractere por caractere. Garantir isso por revisão é frágil; garantir por construção é barato.

Decisão: uma função pura em `src/domain/`, do tipo `buildSubtaskSuggestionContent(title, description) -> string`, aplica normalização, corte da descrição e instruções fixas, e devolve **a string final**. O componente exibe exatamente essa string; o adapter recebe essa string já pronta e a coloca no corpo da requisição sem reconstruí-la, sem concatenar nada e sem reformatar.

Consequência: o adapter não conhece título nem descrição, apenas um `content` opaco. A igualdade entre o exibido e o transmitido vira um teste de unidade trivial, e o corte da descrição é testável sem rede.

*Alternativa considerada:* montar o prompt no adapter e derivar a pré-visualização a partir dele. Recusada porque duplica a lógica e permite divergência silenciosa entre o que o usuário aprovou e o que saiu.

### 3. Saída em texto simples, um item por linha, e não JSON estruturado

`OPENAI` admite `response_format` com esquema JSON; a Anthropic resolve o caso por uso de ferramenta; um `CUSTOM` apontando para Ollama, LM Studio ou um gateway próprio pode não admitir nenhum dos dois. Exigir saída estruturada quebraria justamente o provedor que a `TF-010` tratou como cidadão de primeira classe.

Decisão: pedir uma lista em texto, um título por linha, e interpretar com um parser tolerante que quebra por linha, descarta linhas vazias e remove marcadores comuns de lista, como hífen, asterisco e numeração. O parser é função pura do domínio e não conhece o formato de resposta de nenhum provedor.

Piso comum a todos os provedores em vez de caminho ótimo em um deles. Se no futuro valer a pena, um provedor específico pode ganhar saída estruturada sem alterar o parser, porque o adapter continua entregando texto.

*Alternativa considerada:* `json_schema` para `OPENAI`, ferramenta para Anthropic, texto para `CUSTOM`. Recusada nesta Change: triplica os caminhos de resposta e o custo de teste logo na primeira capability de geração.

### 4. Leitura defensiva do corpo, isolada em um único ponto

Este é o primeiro lugar do TaskFlow que lê a resposta de um provedor, e é o ponto de maior risco de vazamento.

Decisão, concentrada em um executor próprio:

- O corpo é lido como texto e convertido; a extração navega apenas o caminho mínimo até o texto gerado, conforme o formato do provedor.
- Em qualquer falha de interpretação, o erro capturado é descartado sem ser propagado nem registrado, porque o objeto de erro pode carregar a requisição inteira, com cabeçalhos. Esse é o mesmo tratamento que `runAiProbe` já aplica.
- Nada do corpo entra em log, em mensagem de erro, em objeto de exceção ou em armazenamento.
- Um limite defensivo de tamanho é aplicado na leitura, para que um gateway defeituoso ou hostil não devolva um corpo desproporcional.
- Permanecem as mesmas defesas de transporte da `TF-010`: `redirect: 'error'`, `cache: 'no-store'`, `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`.

### 5. Motivos de falha estendem o conjunto fechado, sem substituí-lo

Decisão: `AiGenerationFailure` reúne os motivos já existentes de `AiConnectionFailure` e acrescenta os casos próprios da geração — resposta vazia, resposta impossível de interpretar e resposta sem item válido. A tradução de estado HTTP para motivo é compartilhada com a verificação, de modo que 401 continue significando credencial inválida nos dois caminhos.

### 6. Validação reutiliza `validateSubtaskDrafts`, sem validador paralelo

Decisão: os títulos interpretados viram `TaskSubtaskDraft[]` e passam por `validateSubtaskDrafts`, o mesmo validador do formulário. O corte por vagas restantes considera `MAX_SUBTASKS` menos os itens já presentes na lista do formulário, não os itens persistidos, porque a lista do formulário é o estado que o usuário está editando.

Efeito pretendido: a IA não consegue produzir nada que o usuário não pudesse ter digitado. Se os limites de subtarefa mudarem no futuro, o caminho da IA acompanha sem alteração.

### 7. A proposta vive em estado de componente; aceitar apenas acrescenta a `subtaskItems`

Decisão: a proposta é estado local do formulário, nunca persistido. Aceitar itens os insere em `subtaskItems` pelo mesmo formato `TaskSubtaskDraft` usado pela inclusão manual, com `done` implícito em não concluído e sem `id`, exatamente como um item recém-adicionado à mão. Descartar a proposta ou fechar o formulário a elimina.

Consequência deliberada: não existe caminho de gravação novo. A tarefa só muda quando o usuário salva, e o desfazer da `task-undo` continua cobrindo essa edição sem nenhuma adaptação.

### 8. Consentimento de conteúdo é em memória, por origem, e não é persistido

Decisão: o consentimento para enviar conteúdo de tarefa vale para a origem configurada e vive apenas enquanto o Side Panel estiver aberto. Fechar e reabrir exige consentir de novo; trocar a origem invalida o consentimento anterior.

Há precedente direto no projeto: a oferta de desfazer da `task-undo` também existe somente em memória, por decisão explícita. Persistir "o usuário concordou em enviar texto de tarefa" criaria uma autorização pegajosa, e ainda exigiria uma chave de armazenamento nova, contra o não-objetivo de não introduzir persistência.

*Alternativa considerada:* gravar o consentimento junto da configuração de provedor. Recusada pelos dois motivos acima.

### 9. A chamada parte do Side Panel, pela composição já existente

Decisão: os adapters de geração são montados em `src/composition/chrome-ai-service.ts`, junto dos testers, mantendo a regra já documentada ali. O service worker não participa: ele pode ser encerrado no meio da requisição, e o gesto do usuário acontece no Side Panel.

### 10. Requisição única, orçamento fixo, cancelável

Decisão: um acionamento produz no máximo uma requisição, com teto de saída definido pelo TaskFlow, limite de tempo no mesmo padrão de `AI_CONNECTION_TIMEOUT_MS` e `AbortController` exposto ao cancelamento do usuário. Sem repetição automática após falha, porque cada tentativa custa dinheiro do usuário.

## Risks / Trade-offs

- **Injeção de prompt por descrição capturada de página** → A `page-capture` coloca seleção de páginas web em `description`, então o prompt pode conter texto de terceiros. Mitigação em camadas: a saída só pode virar proposta de títulos, passa por `validateSubtaskDrafts`, exige seleção item a item e não tem caminho de escrita. O pior caso é uma sugestão descartável. Nenhuma instrução da resposta pode alterar destino, configuração ou dados, porque o adapter não lê instruções da resposta, apenas texto.
- **Corpo da resposta é a nova superfície de vazamento** → Leitura concentrada em um executor único, erro capturado descartado, limite de tamanho, nada em log nem em armazenamento, e teste dedicado com um corpo que contém trecho de credencial.
- **Modelo ignora o formato de uma linha por item** → Parser tolerante a marcadores e numeração; quando nada restar, o motivo é resposta impossível de interpretar, e o formulário não é tocado.
- **Qualidade da sugestão varia por modelo, e modelos locais pequenos tendem a ir pior** → A confirmação item a item já é o controle. O recurso é opcional e o usuário escolhe o modelo.
- **Custo em dinheiro do usuário** → Requisição única, teto de saída, sem repetição automática, e origem e modelo visíveis antes de confirmar.
- **Troca do formato de resposta pelo provedor** → A extração navega o caminho mínimo e falha de forma fechada, como resposta impossível de interpretar, em vez de propagar detalhe do corpo.
- **Fadiga de consentimento** → Consentir a cada abertura do Side Panel é atrito real e deliberado: é o preço de não tornar pegajosa a autorização de enviar conteúdo pessoal. Se o uso mostrar que o atrito é excessivo, dá para reavaliar em Change futura com evidência, como a `TF-009` fez.

## Migration Plan

Não há migração de dados. Nenhuma chave de armazenamento é criada, alterada ou lida de forma nova, o formato de backup não muda e o Manifest não ganha permissão. O acesso de rede continua sendo a permissão de host opcional por origem já obtida pela `TF-010`.

O recurso é aditivo e inerte: sem provedor configurado, nenhum elemento novo aparece e nenhum código de rede é alcançado. Reverter significa remover o ponto de entrada no formulário; nada fica para trás no armazenamento do usuário, porque nada foi gravado.

## Open Questions

- Texto exato das instruções fixas enviadas junto do título e da descrição, e em que idioma pedir a saída. Ajustável depois sem alterar specs, desenho ou divisão de tarefas, porque a string sai de uma única função pura.
- Valor exato do corte da descrição e do teto de saída. Definidos como constantes nomeadas do TaskFlow; calibrar não muda o contrato, que já exige apenas que o corte ocorra antes da pré-visualização.
