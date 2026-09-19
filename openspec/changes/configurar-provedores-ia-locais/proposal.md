## Why

O TaskFlow é local-first e hoje não possui nenhuma superfície onde o usuário informe provedor, credencial e modelo de IA, nem qualquer garantia verificada de que uma credencial permaneça fora de backups, exportações e logs. A `TF-011` pretende oferecer assistência de IA opcional em tarefas e depende dessa base existir antes.

Esta Change estabelece a configuração BYOK e a prova de que ela é segura, **sem** enviar nenhum dado de tarefa e sem introduzir qualquer recurso de geração. O objetivo é resolver as questões de credencial, permissão e consentimento enquanto o risco ainda é mínimo, em vez de resolvê-las junto com a primeira funcionalidade que envia conteúdo.

## What Changes

- Nova área **Provedores de IA** no Side Panel, separada do gerenciamento de tarefas e alcançável a partir dele, com no máximo uma configuração ativa por vez.
- Seletor de provedor com três valores: `OPENAI` e `ANTHROPIC`, cada um com base de API fixa e sem campo de endereço; e `CUSTOM`, que exige a base informada pelo usuário e usa o protocolo compatível com OpenAI. Provedores em loopback, como Ollama e LM Studio, entram por `CUSTOM`.
- Campos de chave e modelo, com a chave mascarada, nunca repreenchida com o valor real e mantida fora do estado compartilhado da interface.
- **Teste de conexão** explícito, o único caminho de rede desta Change: acionado apenas por clique, precedido de aviso de que a chave será enviada à origem escolhida, sem enviar nenhum conteúdo de tarefa e com o corpo da resposta descartado.
- **Remoção de credenciais** como ação de primeira classe, que apaga a configuração e revoga a permissão de host concedida.
- Persistência em chave nova `taskflow.ai` em `chrome.storage.local`, com envelope versionado, nunca em `chrome.storage.sync` e sem cifra.
- `optional_host_permissions` no Manifest apenas como teto do que pode ser pedido em tempo de execução. A concessão efetiva é sempre a origem específica do provedor configurado, pedida a partir de gesto do usuário. **Nenhuma permissão nova na instalação.**
- Tradução de toda falha para um conjunto fechado de motivos próprios: o corpo de erro do provedor nunca é renderizado nem registrado, porque pode conter fragmentos da chave.
- Testes de regressão que provam a exclusão de credenciais do arquivo de backup e a preservação da configuração ao restaurar, mais extensão dos testes de Manifest e de fronteira de camadas.
- **Nenhuma dependência nova de runtime.** Os adapters usam `fetch`.

Sem configuração salva, o TaskFlow se comporta exatamente como hoje: nenhuma permissão adicional, nenhum trabalho novo na inicialização e nenhuma alteração nos fluxos existentes.

### Non-goals

Ficam explicitamente fora desta Change e pertencem a Changes futuras:

- Qualquer recurso de IA que gere, resuma, reescreva ou interprete conteúdo de tarefa — escopo da `TF-011`. A porta desta Change expõe somente o teste de conexão, sem operação de geração.
- Envio de qualquer dado de tarefa para qualquer provedor.
- Respostas em streaming e o parser correspondente.
- Cifra da credencial. Cifrar com uma chave guardada no mesmo armazenamento não acrescenta proteção real e foi recusada de propósito; a decisão fica registrada no design.
- Múltiplas configurações simultâneas, perfis por tarefa ou seleção de provedor por operação.
- Estimativa de custo, contagem de tokens e controle de cota.
- Descoberta automática de modelos para preencher o campo de modelo.
- Sincronização da configuração entre dispositivos.
- Justificativa de permissões para a Chrome Web Store, que pertence à `TF-012`.

## Capabilities

### New Capabilities

- `ai-providers`: configuração BYOK de um provedor de IA pelo usuário — seleção de provedor, base de API, credencial e modelo; concessão e revogação da permissão de host correspondente; teste de conexão explícito sem envio de conteúdo; e as garantias de que a credencial permanece local, fora de exportações e fora de logs.

### Modified Capabilities

Nenhuma.

Duas capabilities existentes foram verificadas e **não** exigem alteração:

- `task-backup` já determina que o arquivo exportado é montado exclusivamente a partir das tarefas validadas, que nenhum outro dado armazenado pela extensão — "incluindo configurações ou credenciais atuais ou futuras" — entra no arquivo, e que a restauração não grava outras chaves do armazenamento. O comportamento requerido já é o correto; esta Change acrescenta apenas os testes de regressão que o exercitam com uma credencial de fato configurada.
- `interface-accessibility` já exige contraste, destino de foco e estrutura de títulos para todo o Side Panel. A área nova é obrigada a cumpri-la sem que nenhum requisito mude.

## Impact

**Código novo**

- `src/domain/ai-provider.ts`: valor da configuração, provedores admitidos e validação da base de API.
- `src/application/ai/`: porta de teste de conexão e porta de configuração, sem rede e sem APIs do Chrome.
- `src/infrastructure/ai/`: adapters HTTP de OpenAI e Anthropic, repository sobre `taskflow.ai` e adapter de `chrome.permissions`.
- `src/composition/chrome-ai-service.ts`: composição concreta para o Side Panel.
- `src/components/ai/`: área de configuração no Side Panel.

**Código existente afetado**

- `wxt.config.ts`: acréscimo de `optional_host_permissions`. A chave `permissions` não muda.
- `src/components/tasks/TaskManager.vue`: ponto de entrada para a nova área, no padrão já usado por backup e lixeira.
- Nenhuma alteração em `src/application/backup/`, no repository de tarefas ou no service worker. O background não ganha nenhum caminho de rede.

**Testes afetados**

- `tests/manifest/manifest-permissions.test.ts`: fixar exatamente o teto de `optional_host_permissions` e continuar proibindo `host_permissions`, `content_scripts` e `<all_urls>`.
- `tests/architecture/layer-boundaries.test.ts`: acrescentar `fetch(` às proibições de `domain` e `application`.
- `tests/application/` de backup: regressão de exportação e restauração com credencial configurada.

**Dependências**

Nenhuma adicionada. Os SDKs oficiais de OpenAI e Anthropic são recusados: são pesados, desenhados para servidor, exigem habilitar explicitamente o uso em navegador e trazem código que incha o pacote da extensão sem cobrir nenhuma necessidade que `fetch` não cubra.

**Documentação**

- `docs/architecture.md`: decisões de armazenamento, permissões e adapters, e a tabela de permissões.
- `README.md`: a nova área e o fato de a IA ser opcional.
