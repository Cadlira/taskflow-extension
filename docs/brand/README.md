# Marca do TaskFlow

Identidade visual mínima do TaskFlow: o símbolo, as cores aprovadas, as regras de uso e o procedimento para regenerar os arquivos usados pelo Chrome. A conformidade dos assets é verificada por `tests/brand/extension-icons.test.ts`, executado por `npm run test`.

## Símbolo

O símbolo é um **check em trajetória**: um único traço branco, com pontas e junções arredondadas, que entra pela esquerda em uma curva curta e conclui em um check ascendente, sobre um quadrado de cantos arredondados.

- `taskflow-icon.svg`: mestre com o quadrado, sem margem, em grade `0 0 24 24`.
- `taskflow-glyph.svg`: só o traço, em `currentColor`, para uso sobre fundos claros e escuros.
- Quadrado: `width`/`height` 24, `rx` 5.6, preenchimento `#5368e8`.
- Traço: `M4.2 11.2 C7 11.2 8.6 12.8 10.6 16 L19.4 7.4`, `stroke-width` 3, `fill="none"`, `stroke-linecap` e `stroke-linejoin` arredondados.
- O atributo `d` do glifo é idêntico ao do ícone; os dois arquivos devem continuar com a mesma geometria.

### Direções descartadas

- **Check com linhas de velocidade:** o movimento desaparece em 16×16 e exigiria um desenho diferente para tamanhos pequenos.
- **Lista com check:** baixa legibilidade em 16×16 e aparência de aplicativo de notas.
- **Monograma TF:** não comunica tarefa, colide com a sigla consagrada do TensorFlow e lembra o ícone genérico com letra usado pelo Chrome quando não há ícone.

## Cores e contraste

O quadrado usa `#5368e8` (`--color-primary` da interface) e o traço sobre ele é sempre `#ffffff`.

| Aplicação              | Cor       | Fundo de referência | Contraste |
| ---------------------- | --------- | ------------------- | --------- |
| Quadrado do ícone      | `#5368e8` | `#ffffff`           | 4,6:1     |
| Quadrado do ícone      | `#5368e8` | `#202124`           | 3,5:1     |
| Traço sobre o quadrado | `#ffffff` | `#5368e8`           | 4,6:1     |
| Glifo monocromático    | `#5368e8` | `#ffffff`           | 4,6:1     |
| Glifo monocromático    | `#aeb9ff` | `#202124`           | 8,6:1     |
| Proibido no quadrado   | `#3549c7` | `#202124`           | 2,2:1     |

Todas as aplicações precisam atingir pelo menos **3:1** (WCAG, conteúdo não textual). `#3549c7` é proibido no quadrado porque fica em 2,2:1 contra a barra escura do Chrome.

## Proibições

- `#3549c7` ou qualquer cor diferente de `#5368e8` no quadrado do ícone.
- Gradientes, sombras, filtros, máscaras, imagens incorporadas ou texto nos mestres.
- Elementos de calendário, sino, relógio, letras, monogramas ou referências visuais a IA.
- Contraste abaixo de 3:1 em qualquer aplicação da marca.

## Uso de cada tamanho

| Arquivo               | Uso principal                                                     | Regra                                               |
| --------------------- | ----------------------------------------------------------------- | --------------------------------------------------- |
| `public/icon/16.png`  | Favicon das páginas da extensão e barra de ferramentas do Chrome. | Quadro inteiro, sem margem.                         |
| `public/icon/32.png`  | Contextos que pedem 32 px, como a barra do Windows.               | Quadro inteiro, sem margem.                         |
| `public/icon/48.png`  | `chrome://extensions` e gerenciadores de extensões.               | Quadro inteiro, sem margem.                         |
| `public/icon/128.png` | Instalação, Chrome Web Store e notificações de lembrete.          | Arte de 96×96 com 16 px transparentes em cada lado. |

Os ícones são versionados e apenas copiados pelo build do WXT, que os declara automaticamente em `icons` no Manifest. Não há ícone exclusivo de notificação: o lembrete reutiliza `icon/128.png`.

## Regeneração com Inkscape

O procedimento usa o Inkscape 1.x pela linha de comando e não adiciona dependências ao projeto. A partir da raiz do repositório:

```bash
inkscape docs/brand/taskflow-icon.svg --export-type=png --export-area-page --export-background-opacity=0 --export-width=16 --export-filename=public/icon/16.png
inkscape docs/brand/taskflow-icon.svg --export-type=png --export-area-page --export-background-opacity=0 --export-width=32 --export-filename=public/icon/32.png
inkscape docs/brand/taskflow-icon.svg --export-type=png --export-area-page --export-background-opacity=0 --export-width=48 --export-filename=public/icon/48.png
inkscape docs/brand/taskflow-icon.svg --export-type=png --export-area=-4:-4:28:28 --export-background-opacity=0 --export-width=128 --export-filename=public/icon/128.png
```

No tamanho 128, a área exportada tem 32 unidades: a arte de 24 unidades ocupa 96 px e as 4 unidades de sobra em cada lado viram 16 px transparentes.

Qualquer outra ferramenta é aceitável desde que os PNGs resultantes passem em `npm run test`. O teste — e não a ferramenta — é a fonte de verdade da conformidade: ele exige PNGs RGBA de 8 bits, com as dimensões exatas, sem entrelaçamento, bordas opacas nos tamanhos 16, 32 e 48 e margem transparente de 16 px no 128. Se o arquivo for exportado em outro formato de cor, o teste falha com uma mensagem orientando reexportar em RGBA.

## Checklist manual

Depois de regenerar os PNGs, além de `npm run test`, confira:

- os PNGs de 16 e 32 em tamanho real sobre `#ffffff` e `#202124`, verificando que o traço é lido como um check com entrada curva, e não como "√", linha de pulso ou mancha;
- a extensão fixada na barra do Chrome, nos temas claro e escuro;
- o seletor do Side Panel e `chrome://extensions` exibindo o ícone;
- um lembrete real no Windows, verificando que a notificação exibe o ícone sem distorção nem recorte.
