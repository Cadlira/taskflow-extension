## Why

A `TF-010` entregou a configuração BYOK completa, mas deliberadamente sem nenhuma operação de geração: a porta `AiConnectionTester` expõe apenas `testConnection`, o envio é o literal `ping` e o corpo da resposta é descartado sem ser lido. Hoje um provedor configurado só consegue provar que a credencial funciona — ele não produz nada de útil.

Esta Change dá o primeiro uso real à infraestrutura existente e, ao fazê-lo, cruza uma fronteira que o TaskFlow ainda não cruzou: **pela primeira vez, conteúdo de tarefa sai do dispositivo**. Por isso o recurso escolhido é o de menor raio de dano possível — sugerir subtarefas —, onde o domínio já define um formato de saída limitado (`Subtask`, no máximo 20 itens de até 200 caracteres) e já possui o validador `validateSubtaskDrafts`, de modo que a saída do modelo passa exatamente pela mesma validação da entrada digitada pelo usuário.

## What Changes

- Nova porta de **geração de texto** na camada de aplicação, separada da porta de verificação, e adapters correspondentes na infraestrutura para os três provedores já admitidos. É o primeiro caminho que **lê** o corpo da resposta do provedor, o que exige tratamento defensivo próprio.
- Nova ação opcional **"Sugerir subtarefas"** no formulário de tarefa do Side Panel, oferecida somente quando houver provedor configurado, permissão de host concedida e título preenchido.
- **Pré-visualização literal** do conteúdo a enviar antes de qualquer requisição: o usuário vê o texto exato, caractere por caractere, que será transmitido, junto da origem de destino.
- **Consentimento próprio para conteúdo de tarefa**, distinto do consentimento de credencial da `TF-010`. Concordar em enviar a credencial no teste de conexão não autoriza enviar texto de tarefa.
- **A proposta não persiste nada.** Os itens aceitos são inseridos na lista de subtarefas ainda não salva do formulário; a gravação continua dependendo de o usuário salvar a tarefa, e o desfazer existente continua valendo para essa edição.
- Conjunto fechado de motivos de falha **estendido** com os casos próprios da geração, mantendo a regra de que corpo de resposta, cabeçalhos e URL completa nunca chegam ao usuário nem ao log.
- Orçamento de saída limitado e requisição única, sem streaming.

### Non-goals

- Não reimplementar, duplicar nem alterar a configuração de provedores da `TF-010`.
- Não tornar a IA necessária para nenhum fluxo. Sem provedor configurado, o TaskFlow permanece idêntico ao que é hoje, sem rede, sem permissão adicional e sem elemento novo de interface.
- Não oferecer assistência de IA no popup do Quick Add.
- Não conceder à IA nenhum caminho de escrita: ela nunca cria, edita, conclui nem exclui tarefa, e nunca grava no armazenamento.
- Não ler conteúdo da página nem texto além do que o usuário já tem na tarefa.
- Não adicionar telemetria, contador de aceitação nem qualquer persistência nova para medir o recurso.

### Adiado para Changes futuras

- **Resumo de página**: exige ler o conteúdo da página, o que a `page-capture` e a `quick-add` proíbem hoje e que demandaria permissões amplas. É uma Change de permissões, não de IA.
- **Melhoria de escrita** e **geração de descrição** a partir do título: saída em texto livre, sem validador de domínio que a limite, e valor baixo ou negativo para uma tarefa pessoal.
- **Interpretação de linguagem natural** para preencher campos: maior valor potencial, mas erro silencioso em `dueAt` vira lembrete real na hora errada, e existe alternativa determinística sem rede. Depende da porta de geração criada aqui.

## Capabilities

### New Capabilities

- `ai-task-assistance`: assistência opcional de IA sobre uma tarefa existente, cobrindo a sugestão de subtarefas — quando a ação é oferecida, qual conteúdo é enviado, como ele é pré-visualizado e consentido, como a saída é validada e proposta, e como o usuário aceita, edita ou descarta cada item sem que nada seja persistido pela IA.

### Modified Capabilities

Nenhuma.

A `ai-providers` permanece válida sem alteração: seus requisitos descrevem a configuração e a verificação da credencial, e o envio mínimo fixo do teste de conexão continua sendo exatamente o que é. A `task-subtasks` também permanece inalterada: os limites, a validação e a edição de subtarefas continuam idênticos, e o caminho novo os reutiliza em vez de os substituir.

## Impact

**Código novo**

- `src/application/ai/`: porta de geração, tipos de entrada e saída, motivos de falha da geração e caso de uso que orquestra configuração, permissão, consentimento, envio e validação.
- `src/domain/`: montagem determinística do conteúdo a enviar, com o corte aplicado antes da pré-visualização, e interpretação da saída do modelo em rascunhos de subtarefa.
- `src/infrastructure/ai/`: adapters de geração para `OPENAI`, `ANTHROPIC` e `CUSTOM`, e execução da requisição com leitura defensiva do corpo. A camada de infraestrutura é obrigatória aqui porque `tests/architecture/layer-boundaries.test.ts` barra `fetch(` em `domain` e `application`.
- `src/components/tasks/` e `src/components/ai/`: ação, pré-visualização, consentimento e painel de proposta no formulário do Side Panel.
- `src/composition/chrome-ai-service.ts`: montagem dos adapters novos, mantendo o caminho de rede no Side Panel e fora do service worker.

**Código existente afetado**

- `TaskForm.vue` ganha a ação e o painel de proposta; a lista local `subtaskItems` passa a poder receber itens vindos da proposta, pelo mesmo caminho de `TaskSubtaskDraft` já usado pela inclusão manual.
- Nenhuma alteração em repositórios, serviço de tarefas, lembretes, backup ou lixeira.

**Permissões e dependências**

- Nenhuma permissão nova no Manifest. O acesso continua sendo a permissão de host opcional, por origem, já obtida pela `TF-010`.
- Nenhuma dependência nova de runtime; as requisições continuam usando `fetch` diretamente no adapter.

**Privacidade**

- Primeiro caminho em que dado de tarefa deixa o dispositivo, sempre por gesto explícito, sempre precedido da pré-visualização do texto exato e do consentimento por origem.
- Conteúdo de tarefa pode ter vindo de seleção em página web pela `page-capture`, portanto o prompt pode conter texto de terceiros. O desenho de propor sem persistir, com saída validada e confirmação item a item, mantém o pior caso em sugestão descartável.
