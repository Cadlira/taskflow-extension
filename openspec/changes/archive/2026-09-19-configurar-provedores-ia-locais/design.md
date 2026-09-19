## Context

Ver `proposal.md` — Why. Os requisitos observáveis estão em `specs/ai-providers/spec.md`; este documento registra as escolhas técnicas e por que as alternativas foram recusadas.

Três fatos do código atual moldam o desenho e reduzem o risco:

- A exportação de backup é montada por lista de permissão, não por filtragem: `encodeBackupFile` serializa um objeto literal com `format`, `formatVersion`, `exportedAt`, `app` e `tasks`. Não existe caminho de "exportar tudo do armazenamento". A exclusão da credencial é, portanto, estrutural.
- `replaceAll` grava exclusivamente a chave de tarefas, então restaurar um backup não toca em nenhuma outra chave.
- O service worker já reduz erros a `name: message` antes de registrá-los, justamente para não vazar conteúdo. O padrão existe e tem precedente no projeto.

Restrições que o desenho não pode violar: Manifest V3, nenhum backend, nenhuma dependência obrigatória de rede para o núcleo, TypeScript estrito sem `any`, domínio e aplicação livres de Vue, Pinia, WXT e APIs do Chrome, e permissões mínimas justificadas.

## Goals / Non-Goals

**Goals:**

- Tornar a exclusão da credencial de backups e logs uma propriedade verificada por teste, não uma convenção.
- Obter acesso de rede com a menor superfície possível: nada na instalação, uma origem por vez em tempo de execução.
- Manter a área de IA totalmente removível: sem configuração, nenhum caminho novo é exercitado.
- Deixar a porta pequena o bastante para que a `TF-011` a estenda sem reescrevê-la.

**Non-Goals de desenho:**

- Abstrair um "provedor genérico" com registro dinâmico. São dois protocolos de fio conhecidos; uma união discriminada de três valores basta.
- Introduzir camada de cliente HTTP compartilhada. Cada adapter monta sua própria requisição.
- Preparar pontos de extensão para streaming, ferramentas ou cache. Isso é especulativo enquanto não houver geração.

## Decisions

### D1 — Credencial em `chrome.storage.local`, chave própria, sem cifra

Chave `taskflow.ai` com envelope `{ schemaVersion, config }`, no mesmo padrão de `taskflow.tasks` e `taskflow.trash`, decodificada por um codec próprio que rejeita estrutura desconhecida sem sobrescrever.

Alternativas consideradas:

| Alternativa | Por que foi recusada |
| --- | --- |
| `chrome.storage.sync` | Replica a credencial para os servidores do navegador e para todos os dispositivos do perfil. É o pior resultado possível para uma chave de API. |
| `chrome.storage.session` | Descarta a credencial ao fechar o navegador. Seguro, mas obriga a redigitar a cada sessão em um produto de uso pessoal diário. |
| Cifrar com WebCrypto | Só protege se a passphrase não for guardada. Guardar o material de chave no mesmo `storage.local` é teatro de segurança: quem lê uma chave lê a outra. Com passphrase por sessão, o custo é o mesmo da `storage.session` com muito mais código. |

O modelo de ameaça honesto: quem lê o perfil no disco já lê as tarefas. A diferença entre credencial e tarefa não é a exposição, é a consequência — a credencial custa dinheiro e alcança um terceiro. É isso que justifica chave separada, ausência de backup, ausência de log, mascaramento e remoção explícita, e não a cifra.

### D2 — `optional_host_permissions` como teto; concessão sempre por origem

O Manifest declara três padrões, apenas como teto do que pode ser pedido:

```
optional_host_permissions: [
  "https://*/*",
  "http://localhost/*",
  "http://127.0.0.1/*"
]
```

A propriedade que torna isso seguro: **declarar não concede**. O padrão declarado é o limite superior do que `permissions.request` pode pedir; a concessão efetiva é exatamente a origem pedida. O usuário só vê o aviso do host que ele próprio configurou, e a extensão nunca detém acesso a mais que isso. Padrões de correspondência ignoram a porta, então `http://localhost/*` cobre `:11434` e `:1234` sem enumerar portas.

As duas origens oficiais não são declaradas separadamente porque `https://*/*` já as inclui; declará-las de novo só aumentaria a lista fixada pelo teste de Manifest sem alterar comportamento.

Alternativas consideradas:

| Alternativa | Por que foi recusada |
| --- | --- |
| `host_permissions` fixas para as duas origens oficiais | Concede acesso permanente na instalação mesmo para quem nunca usar IA, e elimina `CUSTOM`, que é onde moram Ollama, LM Studio e gateways próprios. |
| Teto restrito às duas origens oficiais | Mais estreito, mas inviabiliza `CUSTOM` — decisão de escopo já tomada em sentido contrário. |
| Pedir `https://*/*` no `request` | Concederia acesso a toda a web para atender um único host. Nunca é feito. |

`permissions.request` exige gesto do usuário e não pode ser chamado do service worker, o que reforça D5.

### D3 — Três provedores, dois protocolos de fio

`AiProvider` é uma união discriminada de `OPENAI | ANTHROPIC | CUSTOM`. "Compatível com OpenAI" não é um adapter: é o adapter OpenAI com outra base. Bases fixas ficam no domínio como constantes, e só `CUSTOM` carrega base informada.

| Provedor | Base | Autenticação | Recurso do teste |
| --- | --- | --- | --- |
| `OPENAI` | fixa, `https://api.openai.com/v1` | `Authorization: Bearer` | `GET {base}/models` |
| `ANTHROPIC` | fixa, `https://api.anthropic.com` | `x-api-key` + `anthropic-version` + `anthropic-dangerous-direct-browser-access` | `GET {base}/v1/models` |
| `CUSTOM` | informada pelo usuário | `Authorization: Bearer` | `GET {base}/models` |

O cabeçalho `anthropic-dangerous-direct-browser-access: true` não é opcional: a Anthropic recusa requisições originadas de navegador sem ele, e um contexto de extensão envia `Origin: chrome-extension://<id>`. É o mesmo cabeçalho que o SDK oficial passa a enviar quando o uso em navegador é habilitado. Sem ele, o teste falharia mesmo com permissão concedida e credencial correta — e o motivo seria difícil de diagnosticar.

### D4 — Nenhuma dependência de runtime; `fetch` direto

Os SDKs oficiais foram avaliados e recusados: são desenhados para servidor, exigem habilitar explicitamente o uso em navegador, trazem shims e camadas de transporte que incham o pacote da extensão e ampliam a superfície a revisar na Chrome Web Store, e nada disso cobre necessidade que `fetch` não cubra. Sem geração e sem streaming nesta Change, não há parser de eventos a escrever. Cada adapter fica na ordem de cinquenta linhas.

Isso mantém `dependencies` com apenas `vue` e `pinia`, coerente com a disciplina já adotada no projeto.

### D5 — A rede vive no Side Panel, nunca no service worker

O gesto do usuário, a concessão de permissão e a interface estão no Side Panel. Emitir a requisição ali elimina troca de mensagens, elimina a necessidade de manter o service worker vivo e evita que um caminho de rede de IA exista em um contexto despertado por eventos — o que tornaria a garantia de "nenhuma requisição automática" muito mais difícil de sustentar.

Páginas de extensão têm a origem da extensão e, com permissão de host concedida, não estão sujeitas à política de mesma origem: não há preflight nem exigência de cabeçalhos CORS na resposta. O CSP padrão do MV3 não restringe `connect-src`, então o Manifest não ganha chave de CSP.

Alternativa recusada: emitir do service worker e conversar por mensagens. Acrescentaria protocolo de mensagens, exigiria tratar o encerramento do worker no meio da requisição e criaria exatamente o caminho que a spec proíbe.

### D6 — Teste por listagem de modelos, com alternativa explícita

`GET` na listagem de modelos valida credencial e endereço sem enviar conteúdo algum e sem consumir tokens. É a verificação mais barata e a que menos expõe o usuário.

Gateways compatíveis nem sempre implementam a listagem. Nesse caso o sistema não improvisa: informa a ausência e oferece, como segunda ação explícita, um envio mínimo com conteúdo literal fixo e um token de resposta. Nunca conteúdo de tarefa, em nenhum dos dois caminhos.

A requisição usa `AbortController` com limite de tempo e `redirect: 'error'`. O redirecionamento é recusado de propósito: um destino que redireciona desviaria a credencial para outra origem, possivelmente fora da permissão concedida.

### D7 — Motivos enumerados; corpo do provedor descartado

O risco mais concreto de vazamento não é o `console.error` do TaskFlow: é a mensagem do próprio provedor. A OpenAI devolve algo como `Incorrect API key provided: sk-...` com trechos da chave, e um gateway de terceiros pode ecoá-la inteira. Repassar essa mensagem para a interface ou para o log colocaria material de credencial em ambos.

Por isso o adapter traduz tudo para um conjunto fechado, no mesmo estilo de `BackupReadFailure`:

```
AiConnectionFailure =
  | 'INVALID_CREDENTIALS'    | 'PERMISSION_MISSING'
  | 'ENDPOINT_UNREACHABLE'   | 'MODEL_LIST_UNSUPPORTED'
  | 'TIMEOUT'                | 'UNEXPECTED_RESPONSE'
```

Regras associadas: nunca registrar a URL completa, apenas a origem, porque um gateway pode aceitar a chave na cadeia de consulta; nunca construir erros com `cause` carregando `RequestInit` ou cabeçalhos, porque o devtools os expande; e nenhum caminho de IA passa pelo `logFailure` genérico do background, que repassa o objeto de erro cru.

### D8 — A credencial não passa pelo estado compartilhado da interface

Uma store Pinia contendo a credencial fica visível no Vue devtools e acessível a qualquer componente. O adapter lê a credencial sob demanda do repository, no momento da requisição. O componente trabalha com o valor digitado no campo e com uma marca de "existe credencial salva" que não permite reconstruí-la.

O campo usa `type="password"`, `autocomplete="off"` e `spellcheck="false"`, e nunca é preenchido com o valor armazenado ao reabrir — campo intocado significa preservar a credencial existente.

### D9 — Camadas e fronteiras verificadas

```
src/domain/ai-provider.ts          uniao de provedores, bases fixas,
                                   validacao da base informada   (puro)
         ^
src/application/ai/                AiProviderConfigRepository
                                   AiConnectionTester  (so testConnection)
         ^
src/infrastructure/ai/             openai-adapter.ts
                                   anthropic-adapter.ts
                                   chrome-ai-config-repository.ts
                                   chrome-host-permissions.ts
         ^
src/composition/chrome-ai-service.ts
         ^
src/components/ai/                 area no Side Panel
```

A porta expõe **somente** `testConnection`. Nada de `complete` ou `generate`: sem consumidor, seria abstração especulativa, e a `TF-011` é quem define a forma da operação de geração.

Duas fronteiras passam a ser verificadas por teste:

- `tests/architecture/layer-boundaries.test.ts` ganha `fetch(` na lista de proibições, mantendo rede fora de `domain` e `application` — hoje o teste barra APIs do Chrome, mas `fetch` é global de plataforma e passaria despercebido.
- `tests/manifest/manifest-permissions.test.ts` passa a fixar exatamente o teto de `optional_host_permissions`, continuando a exigir `host_permissions` ausente, `optional_permissions` vazio, nenhum `content_scripts` e nenhum `<all_urls>`. Sem isso, o teste atual aprovaria silenciosamente qualquer teto futuro.

## Risks / Trade-offs

| Risco | Mitigação |
| --- | --- |
| Credencial em texto claro no perfil do disco | Aceito e documentado. Mesmo modelo de ameaça das tarefas; a cifra sem passphrase não acrescentaria proteção (D1). A mitigação real é o escopo: chave separada, fora de backup, fora de log, removível. |
| Mensagem de erro do provedor contendo trechos da chave | Corpo bruto nunca renderizado nem registrado; tradução obrigatória para motivo enumerado (D7), com teste que injeta um corpo contendo a chave e afirma que ela não aparece na saída. |
| Uma Change futura trocar a exportação por "exportar todo o armazenamento" | Teste de regressão que exporta com credencial salva e afirma a ausência dela e do nome da chave no conteúdo serializado. Falha no CI antes de chegar ao PR. |
| Teto `https://*/*` percebido como permissão ampla | Não concede nada por si (D2). A justificativa para a Chrome Web Store pertence à `TF-012`; o desenho lhe entrega o argumento pronto: concessão por origem, sob gesto, revogável. |
| `optional_host_permissions` gerar aviso na instalação, contrariando a expectativa | Verificação obrigatória no apply, com build de produção carregado sem empacotar e comparação do diálogo de permissões com o estado atual. Se houver aviso, a alternativa é o teto restrito às origens oficiais e `CUSTOM` volta para revisão. |
| Usuário apontar `CUSTOM` para um servidor hostil | Inerente ao BYOK. Mitigado por validação da base, exibição em destaque da origem resolvida, `redirect: 'error'` e permissão concedida por origem. |
| Área de configuração sem consumidor até a `TF-011` | A área tem função própria e verificável — configurar e testar. A porta reduzida a `testConnection` evita a abstração especulativa que a regra de projeto proíbe. |
| Permissão revogada por fora deixando a configuração em estado enganoso | Verificação de posse da permissão ao abrir a área e antes de testar, com mensagem específica de revogação e ação para conceder de novo. |

## Migration Plan

Não há migração de dados. A chave `taskflow.ai` nasce ausente e ausência significa "nenhum provedor configurado"; nenhuma instalação existente precisa ser convertida. O codec já nasce com `schemaVersion` para que uma versão futura possa migrar, seguindo a cadeia que tarefas e lixeira já usam.

O Manifest ganha apenas `optional_host_permissions`. Como permissões opcionais não são concedidas na instalação, atualizar a extensão não altera o acesso de nenhum usuário.

Reversão: remover a área, a chave do Manifest e os módulos novos. Instalações que tiverem gravado `taskflow.ai` ficariam com uma chave órfã e inofensiva; o caminho limpo é o usuário remover a configuração antes, o que também revoga a permissão. Nenhum dado de tarefa é afetado em qualquer direção.

## Open Questions

- Rótulo e posicionamento exatos da entrada da área no Side Panel, ao lado de backup e lixeira. É ajuste de interface e não altera specs nem tarefas.
- Se a listagem de modelos obtida no teste deve, no futuro, sugerir valores para o campo de modelo. Fica para a `TF-011`, que é quem terá contexto sobre quais modelos importam; nesta Change o campo é livre.
