## Why

O TaskFlow ainda não tem ícone próprio. O Manifest não declara `icons`, por isso o Chrome mostra o ícone genérico, um quadrado cinza com a letra "T", na barra da extensão, em `chrome://extensions` e no cabeçalho do Side Panel. O único asset existente, `public/reminder-icon.png`, é um check branco genérico, só aparece nas notificações e tem nome ligado a lembretes. Com o MVP e o backup concluídos, este é o momento de dar ao produto uma marca mínima e reconhecível antes de refinar a experiência (`TF-003`) e de preparar a publicação (`TF-012`).

## What Changes

- Adotar a direção visual **check em trajetória**:
  - um único traço branco com pontas arredondadas entra pela esquerda em curva curta e conclui em check ascendente;
  - o traço fica sobre um quadrado arredondado `#5368e8`, a cor `--color-primary` já usada na interface.
- Criar o mestre vetorial `docs/brand/taskflow-icon.svg`, em grade 24, com quadrado e sem margem.
- Criar o glifo monocromático `docs/brand/taskflow-glyph.svg` em `currentColor`, com cores documentadas: `#5368e8` para fundo claro e `#aeb9ff` para fundo escuro.
- Exportar os PNGs exigidos pelo Chrome:
  - `public/icon/16.png`, `32.png` e `48.png`, sem margem;
  - `public/icon/128.png`, com 96×96 de arte e 16 px transparentes em cada lado.
- Declarar no Manifest os ícones 16, 32, 48 e 128 pela descoberta automática do WXT. Confirmar no manifest gerado que a barra da extensão e o Side Panel usam esses ícones e declarar `action.default_icon` somente se for necessário.
- Fazer as notificações de lembrete usarem `/icon/128.png`. **BREAKING (asset interno):** `public/reminder-icon.png` é removido.
- Documentar uma orientação curta de uso da marca:
  - contraste mínimo de 3:1;
  - proibição de `#3549c7` no quadrado, que tem 2,2:1 contra a barra escura;
  - sem gradiente nem sombra;
  - procedimento para regenerar os PNGs.
- Atualizar o teste do background, `docs/architecture.md` e `README.md` para a nova localização do ícone.
- Manter as permissões atuais do Manifest, sem novas permissões e sem acesso a hosts.

### Direções descartadas no explore

- **Check com linhas de velocidade:** o movimento desaparece em 16×16 e exigiria um desenho diferente para tamanhos pequenos.
- **Lista com check:** baixa legibilidade em 16×16 e aparência de aplicativo de notas.
- **Monograma TF:** não comunica tarefa, colide com a sigla consagrada do TensorFlow (referência a IA) e lembra o ícone genérico com letra que o Chrome mostra quando não há ícone.

### Não objetivos

- Redesenhar o popup ou o Side Panel.
- Inserir a marca nos cabeçalhos da interface; isso pode ser avaliado em `TF-003`.
- Alterar a paleta de cores ou os tokens de `src/styles/base.css`.
- Ícones dinâmicos com `action.setIcon`, estados alternativos ou badges.
- Adicionar dependência para gerar ícones, como `sharp` ou `@wxt-dev/auto-icons`.
- Preparar assets da Chrome Web Store (ícone promocional, screenshots, textos), que pertencem a `TF-012`.
- Qualquer símbolo de calendário, sino ou IA.
- Ícones por tema (`theme_icons`), sem suporte no Chrome MV3; o mesmo PNG atende aos temas claro e escuro.

## Capabilities

### New Capabilities

- `extension-icons`: conjunto de ícones da extensão. Cobre os PNGs exigidos com dimensões e margens definidas, a declaração no Manifest para barra da extensão, Side Panel e `chrome://extensions`, o ícone usado nas notificações, os mestres vetoriais versionados e as regras de contraste e uso da marca.

### Modified Capabilities

Nenhuma. O comportamento de entrega de lembretes em `task-reminders` não muda: apenas o asset visual da notificação passa a ser o ícone da extensão, requisito coberto por `extension-icons`.

## Impact

- **Assets:** novos `docs/brand/taskflow-icon.svg`, `docs/brand/taskflow-glyph.svg` e `public/icon/{16,32,48,128}.png`; remoção de `public/reminder-icon.png`.
- **Infraestrutura:** `ChromeReminderNotifier` passa a referenciar `/icon/128.png`.
- **Manifest:** o manifest gerado ganha `icons` (e `action.default_icon`, se necessário); as permissões continuam `sidePanel`, `storage`, `alarms` e `notifications`, sem `host_permissions`.
- **Testes:** ajuste de `tests/entrypoints/background.test.ts`; novo teste que valida dimensões e margem transparente dos PNGs sem nova dependência; o teste de permissões permanece inalterado.
- **Dependências:** nenhuma nova. A regeneração dos PNGs usa ferramenta externa documentada, fora do `package.json`.
- **Documentação:** orientação de marca em `docs/brand/`; atualização de `docs/architecture.md` e `README.md`; `docs/roadmap.md` acompanha o estado da `TF-002.1`.
