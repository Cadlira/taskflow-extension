## Purpose

Define a identidade visual mínima do TaskFlow e o conjunto de ícones da extensão: símbolo, mestres vetoriais, PNGs exigidos pelo Chrome, onde cada ícone é usado e as regras de contraste que mantêm a marca reconhecível em fundos claros e escuros.

## ADDED Requirements

### Requirement: Símbolo check em trajetória

O ícone do TaskFlow SHALL ser um único traço branco, com pontas e junções arredondadas, que entra pela esquerda em curva curta e conclui em um check ascendente, sobre um quadrado de cantos arredondados preenchido com `#5368e8`. O símbolo MUST NOT conter elementos de calendário, sino, relógio ou referências visuais a IA, nem letras ou monogramas.

#### Scenario: Mestre vetorial descreve o símbolo

- **WHEN** o arquivo `docs/brand/taskflow-icon.svg` é inspecionado
- **THEN** ele contém um quadrado arredondado com preenchimento `#5368e8` e um único traço com cor `#ffffff`, `stroke-linecap` e `stroke-linejoin` arredondados e sem preenchimento

#### Scenario: Símbolo é reconhecível em 16×16

- **WHEN** o PNG de 16×16 é observado em tamanho real na barra da extensão
- **THEN** o traço é lido como um check com entrada curva, sem se confundir com um sinal de raiz, uma linha de pulso ou uma mancha

### Requirement: Mestres vetoriais versionados

O repositório SHALL versionar os arquivos-fonte da marca em `docs/brand/`: `taskflow-icon.svg`, com quadrado e sem margem, e `taskflow-glyph.svg`, só com o traço. Ambos MUST usar `viewBox="0 0 24 24"` e a mesma geometria de traço. O glifo MUST usar `currentColor` como cor do traço e MUST NOT conter o quadrado de fundo. Os mestres MUST NOT conter gradientes, filtros, sombras, máscaras, imagens incorporadas ou texto.

#### Scenario: Ícone mestre ocupa toda a grade

- **WHEN** `docs/brand/taskflow-icon.svg` é inspecionado
- **THEN** o `viewBox` é `0 0 24 24` e o quadrado começa em `0,0` com largura e altura 24

#### Scenario: Glifo herda a cor do contexto

- **WHEN** `docs/brand/taskflow-glyph.svg` é inspecionado
- **THEN** o `viewBox` é `0 0 24 24`, o traço usa `stroke="currentColor"`, não há preenchimento de fundo e a geometria do traço é idêntica à do ícone mestre

#### Scenario: Mestre contém efeito proibido

- **WHEN** um mestre contém `linearGradient`, `radialGradient`, `filter`, `mask`, `image` ou `text`
- **THEN** a validação automatizada falha

### Requirement: PNGs exigidos pelo Chrome

A extensão SHALL incluir os ícones PNG `icon/16.png`, `icon/32.png`, `icon/48.png` e `icon/128.png` com transparência, gerados a partir de `docs/brand/taskflow-icon.svg`. Os tamanhos 16, 32 e 48 MUST ocupar o quadro inteiro, sem margem. O tamanho 128 MUST conter a arte em uma área central de 96×96 com 16 px transparentes em cada lado.

#### Scenario: Dimensões exatas

- **WHEN** os arquivos em `public/icon/` são lidos
- **THEN** `16.png`, `32.png`, `48.png` e `128.png` são PNGs válidos com canal alfa e dimensões exatamente iguais ao número do nome do arquivo

#### Scenario: Ícones pequenos sem margem

- **WHEN** os PNGs de 16, 32 e 48 são lidos
- **THEN** o pixel central de cada borda (superior, inferior, esquerda e direita) é opaco

#### Scenario: Ícone de 128 com margem transparente

- **WHEN** o PNG de 128 é lido
- **THEN** todos os pixels das 16 primeiras e das 16 últimas linhas e colunas são totalmente transparentes e o pixel central de cada borda da área de 96×96 é opaco

#### Scenario: Asset antigo removido

- **WHEN** a extensão é empacotada
- **THEN** `reminder-icon.png` não existe no pacote nem é referenciado pelo código

### Requirement: Ícones declarados no Manifest

O manifest gerado SHALL declarar em `icons` os tamanhos 16, 32, 48 e 128 apontando para os PNGs de `icon/`. A barra da extensão, o seletor do Side Panel e `chrome://extensions` MUST exibir o ícone do TaskFlow em vez do ícone genérico do Chrome. Se `icons` não bastar para a barra da extensão, o manifest MUST declarar `action.default_icon` com os mesmos arquivos de 16 e 32.

#### Scenario: Manifest de produção declara os ícones

- **WHEN** a extensão é construída para produção
- **THEN** `manifest.json` contém `icons` com as chaves `16`, `32`, `48` e `128` e cada caminho existe no pacote

#### Scenario: Barra da extensão nos temas claro e escuro

- **WHEN** a extensão empacotada é carregada no Chrome e fixada na barra, com o tema claro e depois com o tema escuro
- **THEN** a barra mostra o ícone do TaskFlow, e não a letra genérica, com o quadrado distinguível do fundo nos dois temas

#### Scenario: Side Panel e página de extensões

- **WHEN** o Side Panel do TaskFlow é aberto e `chrome://extensions` é exibida
- **THEN** ambos mostram o ícone do TaskFlow

### Requirement: Ícone das notificações

As notificações de lembrete SHALL usar como ícone o PNG de 128 do conjunto da extensão (`icon/128.png`). Não SHALL existir asset de ícone exclusivo para lembretes.

#### Scenario: Lembrete entregue

- **WHEN** um lembrete elegível dispara uma notificação
- **THEN** o `iconUrl` da notificação aponta para `icon/128.png` dentro da extensão

#### Scenario: Notificação real no Windows

- **WHEN** um lembrete é entregue na extensão empacotada no Windows
- **THEN** a notificação exibe o ícone do TaskFlow sem distorção nem recorte

### Requirement: Contraste e uso da marca

O quadrado do ícone SHALL usar `#5368e8`, que tem contraste de pelo menos 3:1 contra `#ffffff` e contra `#202124`. O traço sobre o quadrado MUST ser `#ffffff`. O glifo monocromático MUST usar `#5368e8` sobre fundo claro e `#aeb9ff` sobre fundo escuro. Nenhuma aplicação da marca MUST usar `#3549c7` como cor do quadrado, gradientes ou sombras. Essas regras e o procedimento de regeneração dos PNGs SHALL estar documentados em `docs/brand/`.

#### Scenario: Cores dentro do limite de contraste

- **WHEN** as cores documentadas são verificadas pela fórmula de contraste da WCAG
- **THEN** o quadrado contra `#ffffff` e contra `#202124`, o traço branco contra o quadrado e cada cor do glifo contra seu fundo de referência atingem pelo menos 3:1

#### Scenario: Cor proibida no quadrado

- **WHEN** o mestre do ícone usa `#3549c7` ou qualquer cor diferente de `#5368e8` no quadrado
- **THEN** a validação automatizada falha

#### Scenario: Regeneração documentada

- **WHEN** uma pessoa mantenedora segue o procedimento de `docs/brand/`
- **THEN** ela obtém os quatro PNGs com as dimensões e margens exigidas sem instalar dependências no projeto

### Requirement: Ícones sem novas permissões

A introdução dos ícones MUST NOT adicionar permissões nem acesso a hosts. O manifest gerado SHALL continuar com exatamente as permissões `sidePanel`, `storage`, `alarms` e `notifications`.

#### Scenario: Permissões do build de produção

- **WHEN** a extensão é construída para produção
- **THEN** `manifest.json` lista exatamente `sidePanel`, `storage`, `alarms` e `notifications` e não contém `host_permissions` nem `optional_host_permissions`
