## Why

Boa parte das tarefas nasce de algo que o usuário está vendo no navegador: um chamado, um e-mail, um documento ou um trecho de texto. Hoje o TaskFlow obriga a copiar o título e a digitar a URL de origem manualmente no formulário completo, o que torna a captura lenta justamente no momento em que ela deveria ser imediata. A `TF-004` resolve isso sem abrir mão da premissa de permissões mínimas: nenhum acesso permanente a sites, nenhuma leitura sem gesto explícito e nenhuma tarefa salva sem revisão.

## What Changes

- **Captura pelo popup:** o Quick Add ganha a ação explícita "Usar página atual". Somente quando acionada, ela lê o título e a URL da aba ativa, preenche o título (normalizado e limitado a 200 caracteres) quando ele ainda está vazio e exibe a URL de origem em um campo visível, editável e removível. O popup continua sem ler nada da página ao abrir.
- **Páginas não capturáveis:** quando a aba ativa não usa `http` ou `https`, ou quando a leitura não é possível, o popup informa o motivo e não altera os dados digitados.
- **Menu de contexto:** dois itens, "Adicionar página ao TaskFlow" (clique na página) e "Criar tarefa com o texto selecionado" (clique sobre uma seleção), exibidos somente em páginas `http`/`https`.
- **Revisão no Side Panel:** o clique no menu abre o Side Panel e entrega uma captura pendente única e temporária. O Side Panel apresenta o formulário completo de nova tarefa pré-preenchido para confirmação. Se já houver um formulário ou a área de backup aberta, a captura aguarda revisão sem descartar o que está em andamento. Capturas expiradas são ignoradas.
- **Mapeamento previsível:** título da página ou seleção normalizada vira título (até 200 caracteres); a seleção completa vai para a descrição (até 4.000) somente quando não couber no título; a URL da página vira URL de origem apenas quando for `http`/`https`.
- **Nenhuma criação automática:** toda captura passa pela confirmação do usuário e pelas validações existentes da tarefa.
- **Permissões:** adicionar somente `activeTab` e `contextMenus`, ambas sem aviso na instalação e sem acesso permanente a sites. O teste de Manifest passa a exigir esse conjunto exato e a proibir `tabs`, `scripting`, `favicon`, `content_scripts`, `host_permissions` e `<all_urls>`.
- **Documentação:** justificativa das novas permissões e descrição dos fluxos em `docs/architecture.md` e `README.md`.

### Não objetivos

- Favicon da página, seja persistido na tarefa, exibido a partir da URL da aba ou obtido pela permissão `favicon`.
- Atalho de teclado para captura (`commands`).
- Captura de conteúdo da página além do texto selecionado pelo usuário (corpo, metadados, links, imagens, capturas de tela).
- Uso de `scripting`, content scripts ou qualquer permissão de host.
- Criação de tarefa sem revisão ou confirmação do usuário.
- Alteração do modelo `Task`, do formato persistido em `chrome.storage.local` ou do formato de backup.
- Captura a partir de páginas que não usem `http`/`https` (`chrome://`, `file://`, visualizador de PDF, Chrome Web Store).
- Fila com múltiplas capturas pendentes ou histórico de capturas.
- Captura de texto selecionado pelo popup.

Favicon e atalho de teclado só devem voltar como Changes próprias se houver necessidade demonstrada; a exibição de favicon, se retomada, deve derivar o ícone da URL de origem sem novo campo no modelo.

## Capabilities

### New Capabilities

- `page-capture`: captura da página atual e do texto selecionado como rascunho de tarefa, pelo popup e pelo menu de contexto, incluindo normalização e mapeamento dos campos, páginas não capturáveis, captura pendente temporária entregue ao Side Panel, convivência com edições em andamento, expiração, falha ao abrir o Side Panel e conjunto mínimo de permissões.

### Modified Capabilities

- `quick-add`: o formulário compacto passa a exibir a URL de origem quando preenchida por captura, e o requisito "Quick Add não captura contexto automaticamente" passa a permitir a leitura de título e URL da aba ativa somente por ação explícita do usuário, mantendo a proibição de leitura ao abrir, de conteúdo da página e de texto selecionado.

## Impact

- **Domínio:** regras puras de normalização de título e seleção, montagem do rascunho capturado e verificação de expiração, reutilizando `isHttpUrl` e os limites de `TASK_LIMITS`.
- **Aplicação:** portas para leitura da página ativa e para a captura pendente, e casos de uso de captura; nenhuma alteração em `TaskService`, `TaskRepository` ou lembretes.
- **Infraestrutura:** adapters Chrome para `tabs.query` na aba ativa, `storage.session` para a captura pendente e registro/interpretação dos itens de `contextMenus`.
- **Background:** registro dos itens de menu em `runtime.onInstalled` e listener síncrono de `contextMenus.onClicked` que abre o Side Panel antes de gravar a captura; o background continua sem receber mensagens das superfícies.
- **UI:** ação "Usar página atual" e campo de URL de origem no `QuickAdd`; formulário completo aceitando valores iniciais de criação e aviso de captura pendente no `TaskManager`.
- **Manifest:** `permissions` passa a ser `activeTab`, `alarms`, `contextMenus`, `notifications`, `sidePanel` e `storage`; `tests/manifest/manifest-permissions.test.ts` é reescrito.
- **Testes:** o teste do Quick Add que garante ausência de `sourceUrl` passa a cobrir apenas o fluxo sem captura; novos testes de domínio, adapters, background, popup e Side Panel.
- **Dados:** nenhuma migração; a captura pendente vive apenas em `storage.session` e nunca entra em backup.
- **Documentação:** `docs/architecture.md`, `README.md` e `docs/roadmap.md`.
