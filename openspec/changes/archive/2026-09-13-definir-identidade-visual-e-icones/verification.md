# Verificação manual — `definir-identidade-visual-e-icones` (TF-002.1)

## Ambiente

- Data: 2026-09-13.
- Navegador: Chromium 151.0.7922.34 (build Playwright, não branded) no Windows. O Chrome estável 152 instalado não aceita mais `--load-extension`, e a verificação manual usa esse caminho para carregar `.output/chrome-mv3` sem compactação em um perfil temporário e descartável (`chromium-taskflow`). O comportamento de ícones é o mesmo motor do Chrome.
- Build: `npm run build`, carregado de `.output/chrome-mv3`.
- Instalação: `--load-extension` com perfil temporário; extensão `TaskFlow` (`ogfmokknbofabjomlfeekkceegkocacb`) listada em `chrome://extensions`.
- Side Panel aberto pelo menu de extensões, opção **Abrir painel lateral**.
- Notificação real capturada por screenshot do toast do Windows.

## Itens verificados

### 1. Barra da extensão no tema claro — PASSOU

Após fixar o TaskFlow pela barra (menu de extensões → **Fixar na barra de ferramentas**), o ícone do quadrado azul com o check aparece na barra, ao lado do botão de extensões, no tema claro. Apenas `icons` foi suficiente: nenhuma declaração de `action.default_icon` foi necessária.

### 2. Barra da extensão no tema escuro — PASSOU

Com `chrome://settings/appearance` → **Modo** → **Escuro**, o mesmo ícone permaneceu visível e distinguível do fundo escuro da barra.

### 3. Seletor do Side Panel — PASSOU

O cabeçalho do Side Panel mostra o ícone do TaskFlow ao lado do nome `TaskFlow`, no seletor do painel.

### 4. `chrome://extensions` — PASSOU

O cartão do TaskFlow exibe o ícone de 48 px (quadrado azul com check), sem erros de carregamento; o único selo é o indicador de extensão descompactada.

### 5. Notificação real de lembrete no Windows — PASSOU

Tarefa `Teste de notificação do TaskFlow` criada pelo formulário do Side Panel com prazo `13/09/2026, 19:58` e lembrete **No horário do prazo**. O alarme `taskflow:reminder:28ee4f52-038e-4e03-b9d7-ff6fd98c16d1:42ae0ed6-2940-4d19-a5c0-c0c234e074d6` foi agendado para `2026-09-13T22:58:00.000Z`. A notificação do Windows apareceu às 19:58 com o ícone do TaskFlow **sem distorção nem recorte**, título `Teste de notificação do TaskFlow` e mensagem `Prazo: 13/09/2026, 19:58`.

### 6. Manifest de produção — PASSOU

`.output/chrome-mv3/manifest.json` declara `icons` com `16`, `32`, `48` e `128`, cada caminho existe em `.output/chrome-mv3/icon/`, `reminder-icon.png` não existe no pacote e as permissões são exatamente `sidePanel`, `storage`, `alarms` e `notifications`, sem `host_permissions` nem `optional_host_permissions`. `tests/manifest/manifest-permissions.test.ts` passou sem alteração.

### 7. Geometria final do símbolo — MANTIDA

A geometria de referência da decisão 1 foi mantida, sem ajustes:

- traço `M4.2 11.2 C7 11.2 8.6 12.8 10.6 16 L19.4 7.4`, `stroke-width` 3, preenchimento `none`, pontas e junções arredondadas;
- quadrado `24 × 24` com `rx` 5.6 em `#5368e8`;
- o glifo repete o mesmo atributo `d`.

Os PNGs de 16 e 32 foram observados em tamanho real sobre `#ffffff` e `#202124`, em tamanho real e ampliados: o traço é lido como um check com entrada curva, sem se confundir com "√", linha de pulso ou mancha.

### 8. Ferramenta de exportação — DESVIO REGISTRADO

O Inkscape não está instalado nesta máquina. Os quatro PNGs foram exportados por um rasterizador local a partir da geometria aprovada e validados pelo teste automatizado, que a decisão 3 define como fonte de verdade da conformidade em vez da ferramenta. O `docs/brand/README.md` documenta o procedimento com Inkscape e declara que qualquer ferramenta cujos PNGs passem em `npm run test` é aceitável.

### 9. Busca por `reminder-icon` — LIMPA

Nenhuma ocorrência em `src/`, `public/`, `README.md` ou `docs/`. A única menção restante é o teste-guarda `tests/brand/extension-icons.test.ts`, que existe justamente para exigir a ausência de `public/reminder-icon.png`, conforme a decisão 4 do design.

## Limitações do método

- O Chrome estável 152 não aceita `--load-extension`; a verificação usou um Chromium não branded do mesmo projeto, portanto o chrome do navegador pode ter pequenas diferenças visuais sem relação com a declaração `icons`.
- A fixação na barra foi feita pelo menu de extensões do navegador, simulando o gesto da pessoa usuária.
- A notificação foi capturada no momento em que apareceu no Windows; o agendamento foi conferido por `chrome.alarms.getAll()` no contexto da extensão.

## Conclusão

Todos os itens do checklist da task 5.1 foram executados na extensão empacotada e passaram. `icons` sozinho exibiu o ícone na barra (temas claro e escuro), no seletor do Side Panel e em `chrome://extensions`; `action.default_icon` não foi necessário, e as notificações usam `icon/128.png` sem distorção nem recorte.
