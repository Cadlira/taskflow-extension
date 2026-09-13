## Context

Motivação e escopo estão em `proposal.md`; os requisitos, em `specs/extension-icons/spec.md`.

Estado atual observado:

- `wxt.config.ts` declara nome, descrição, versão e permissões, mas não declara ícones. O `.output/chrome-mv3/manifest.json` gerado não tem `icons` nem `action.default_icon`.
- `public/reminder-icon.png` (128×128) é o único asset visual. `ChromeReminderNotifier` o referencia por `browser.runtime.getURL('/reminder-icon.png')`, `tests/entrypoints/background.test.ts` confere o nome e `docs/architecture.md` e `README.md` o citam.
- Tokens de cor em `src/styles/base.css`: `--color-primary` `#5368e8`, `--color-primary-strong` `#3549c7` e anel de foco `#aeb9ff`.
- O WXT descobre ícones em `public/` pelos padrões `icon-<n>.png` e `icon/<n>.png` e os declara em `icons` no Manifest.
- O Chrome não aceita SVG em ícones de extensão. Pela documentação, 16 é usado como favicon das páginas da extensão e na barra, 32 no Windows, 48 em `chrome://extensions` e 128 na instalação e na Web Store.
- O script `npm run validate` e o CI executam lint, typecheck, testes e build, nessa ordem. Os testes rodam antes do build e, por isso, não podem ler `.output/`.

## Goals / Non-Goals

**Goals:**

- Um único desenho-fonte que sirva a todos os tamanhos, mudando apenas a margem do 128.
- PNGs determinísticos e versionados, validados por teste sem nenhuma dependência nova.
- Troca do ícone da notificação sem alterar o comportamento de entrega dos lembretes.

**Non-Goals:**

- Automatizar a exportação dos PNGs no build ou no CI.
- Verificar por teste automatizado a legibilidade perceptiva em 16×16, que continua sendo verificação manual.
- Criar componentes, tokens CSS ou utilitários de marca para a interface.

## Decisions

### 1. Geometria de referência do símbolo

Grade `viewBox="0 0 24 24"`, com `width="24"` e `height="24"` para que unidades de usuário coincidam com pixels nas ferramentas de exportação.

- Quadrado: `<rect width="24" height="24" rx="5.6" fill="#5368e8"/>`.
- Traço inicial: `M4.2 11.2 C7 11.2 8.6 12.8 10.6 16 L19.4 7.4`, com `stroke="#ffffff"`, `stroke-width="3"`, `fill="none"`, `stroke-linecap="round"` e `stroke-linejoin="round"`.
- A espessura 3 na grade corresponde a 2 px no PNG de 16 e a 12 px na arte de 96 do PNG de 128.

Durante o apply, a curva de entrada e o ponto de junção podem ser ajustados após a verificação visual em 16×16, desde que continuem satisfazendo o requisito do símbolo. `taskflow-glyph.svg` repete exatamente o mesmo `path`, sem o `rect` e com `stroke="currentColor"`.

**Alternativas:**

- **Espessuras diferentes por tamanho** (mais fina em 128): exigiria dois mestres e sincronização manual. O ganho estético em 128 não compensa a manutenção.
- **Mestre com margem embutida:** atenderia só ao 128 e desperdiçaria 25% da área em 16, justamente onde cada pixel importa.

### 2. PNGs versionados em vez de gerados no build

Os quatro PNGs ficam commitados em `public/icon/`. O build do WXT apenas os copia e os declara no Manifest.

**Alternativas:**

- **`@wxt-dev/auto-icons`:** gera os tamanhos a partir de uma imagem, mas traz `sharp` (binário nativo) para quatro arquivos que mudam raramente. Também não dispensa a conferência visual do 16 e acopla o build a um rasterizador. A proposta exclui explicitamente essa dependência.
- **Script próprio com `@resvg/resvg-js` como devDependency:** tem os mesmos custos, em menor escala. Rejeitado pelo mesmo motivo.

### 3. Regeneração com ferramenta externa documentada

O procedimento em `docs/brand/README.md` usa o Inkscape 1.x pela linha de comando. Ele não entra no `package.json`.

- 16, 32 e 48: `inkscape docs/brand/taskflow-icon.svg --export-type=png --export-area-page --export-background-opacity=0 --export-width=<n> --export-filename=public/icon/<n>.png`
- 128: `inkscape docs/brand/taskflow-icon.svg --export-type=png --export-area=-4:-4:28:28 --export-background-opacity=0 --export-width=128 --export-filename=public/icon/128.png`

Com uma área de 32 unidades exportada em 128 px, a arte de 24 unidades ocupa 96 px e as 4 unidades de sobra em cada lado viram 16 px transparentes.

A fonte de verdade da conformidade é o teste automatizado da decisão 4. Qualquer ferramenta que produza PNGs aprovados por ele é aceitável, e o README deve dizer isso.

**Alternativas:**

- **Chrome headless com captura de tela:** difícil de controlar em transparência e escala.
- **Exportação manual em editor gráfico:** não é reprodutível por comando.
- **`npx` de um rasterizador:** baixa pacote do registro no momento da exportação e depende de versão flutuante.

### 4. Validação dos assets por teste sem dependência

Novo teste em `tests/brand/extension-icons.test.ts`, executado no Vitest com APIs do Node (`node:fs`, `node:zlib`).

**PNGs:**

- Um leitor mínimo, restrito ao teste, confere a assinatura PNG e o `IHDR`: largura, altura, profundidade 8 e tipo de cor 6 (RGBA, sem entrelaçamento).
- Ele concatena os `IDAT`, descomprime com `inflateSync` e desfaz os filtros de linha (None, Sub, Up, Average, Paeth).
- Com os pixels, verifica as regras da spec: dimensões exatas, pixel central de cada borda opaco nos PNGs de 16, 32 e 48, faixas de 16 px com alfa 0 e bordas opacas da área de 96 no PNG de 128.
- Se o exportador gerar outro tipo de cor, o teste falha com mensagem explícita, e o PNG deve ser reexportado em RGBA.

**SVGs:** leitura como texto, verificando:

- `viewBox`;
- `rect` de 24×24 em `0,0` com `fill="#5368e8"` no ícone e sua ausência no glifo;
- um único `path` com pontas e junções arredondadas;
- `stroke="#ffffff"` no ícone e `stroke="currentColor"` no glifo;
- mesmo atributo `d` nos dois arquivos;
- ausência de `linearGradient`, `radialGradient`, `filter`, `mask`, `image` e `text`.

**Contraste:** função local de luminância relativa da WCAG aplicada às cores documentadas, exigindo pelo menos 3:1 para cada par da spec.

**Asset removido:** o teste verifica que `public/reminder-icon.png` não existe.

O leitor fica dentro do arquivo de teste. Ele não vai para `src/` nem para `tests/support/`, porque não há outro consumidor.

**Alternativa:** comparar os PNGs com imagens de referência ou hashes. Seria frágil: toda reexportação legítima quebraria o teste sem indicar um problema real.

### 5. Declaração no Manifest pela descoberta do WXT

Os arquivos em `public/icon/<n>.png` são descobertos pelo WXT, que gera `icons` no Manifest. Nenhuma alteração em `wxt.config.ts` é feita a princípio.

Após `npm run build`, o apply confere `.output/chrome-mv3/manifest.json` e carrega a extensão no Chrome:

- se a barra e o Side Panel mostrarem o ícone apenas com `icons`, `action.default_icon` não é declarado;
- caso contrário, `wxt.config.ts` passa a declarar `action.default_icon` com `icon/16.png` e `icon/32.png`, e o resultado é registrado em `verification.md`.

Como os testes não podem ler o build, a conferência do manifest gerado (ícones e permissões) é feita por comando após o build e registrada, como na `TF-002`. O teste existente `tests/manifest/manifest-permissions.test.ts` continua cobrindo a configuração.

**Alternativa:** declarar `icons` manualmente em `wxt.config.ts`. Duplicaria a convenção do WXT e criaria dois lugares para manter os caminhos.

### 6. Notificação reutiliza o ícone de 128

`ChromeReminderNotifier` passa a usar `browser.runtime.getURL('/icon/128.png')`. A margem transparente de 16 px mantém o quadrado inteiro dentro das áreas circulares ou recortadas de algumas plataformas.

**Alternativa:** um ícone exclusivo de notificação, só com o glifo ou sem margem. Rejeitada: recria o asset paralelo que esta Change remove, e o ganho só se justificaria com evidência de problema real na verificação no Windows.

### 7. Documentação da marca

`docs/brand/README.md` reúne, de forma curta:

- o símbolo e as direções descartadas;
- a tabela de cores e contrastes;
- as proibições (`#3549c7` no quadrado, gradientes, sombras, calendário, sino e IA);
- onde cada tamanho é usado;
- os comandos de regeneração;
- o checklist de verificação manual.

`docs/architecture.md` troca a menção ao asset de lembrete pelos ícones da extensão com link para `docs/brand/`. A linha `public/` da estrutura no `README.md` passa a descrever os ícones da extensão, e `docs/brand/` entra na lista.

Contrastes calculados pela WCAG para a documentação:

| Par                        | Contraste                    |
| -------------------------- | ---------------------------- |
| `#5368e8` contra `#ffffff` | 4,6:1                        |
| `#5368e8` contra `#202124` | 3,5:1                        |
| `#ffffff` sobre `#5368e8`  | 4,6:1                        |
| `#aeb9ff` contra `#202124` | 8,6:1                        |
| `#3549c7` contra `#202124` | 2,2:1 (proibido no quadrado) |

## Risks / Trade-offs

- **[A curva de entrada lida como "√" ou linha de pulso em 16×16]** → A verificação manual em tamanho real é tarefa obrigatória. A decisão 1 permite ajustar curva e junção durante o apply, dentro do requisito.
- **[Diferenciação moderada, já que checks em azul são comuns entre apps de tarefas]** → A silhueta assimétrica do traço é o diferencial. Ampliar a diferenciação com cor ou forma nova fica fora do escopo e pode ser revisto em `TF-012`.
- **[Temas coloridos do Chrome com tons próximos de `#5368e8` reduzem a separação do quadrado]** → Aceito no MVP. O contraste é garantido para as barras claras e escuras padrão, e o risco fica documentado.
- **[O antialiasing do exportador deixa semitransparentes os pixels de borda verificados]** → As bordas do quadrado caem em limites inteiros de pixel em todos os tamanhos (grade 24 escalada por 16/24, 32/24, 48/24 e 96/24 sobre áreas alinhadas). O teste aponta o arquivo com problema.
- **[O Inkscape não está instalado para quem mantém o projeto]** → O README declara que qualquer ferramenta cujos PNGs passem no teste é aceitável. A regeneração é rara.
- **[O leitor de PNG do teste não suporta variantes como paleta, 16 bits ou entrelaçamento]** → Limitação intencional. O teste falha com mensagem que orienta a reexportar em RGBA de 8 bits.
- **[Renomear o asset da notificação quebra algo fora do código]** → O asset só é referenciado pelo notifier, pelo teste e pela documentação. A busca por `reminder-icon` deve terminar sem ocorrências.

## Migration Plan

Não há dados persistidos nem contrato público afetado. Na atualização da extensão, o Chrome passa a exibir os novos ícones, e as notificações seguintes usam `icon/128.png`. Para reverter, basta reverter o commit. A extensão volta ao ícone genérico e ao `reminder-icon.png` sem impacto em tarefas ou alarmes.
