## 1. Mestres vetoriais

- [x] 1.1 Criar `docs/brand/taskflow-icon.svg` com `width`/`height` 24, `viewBox="0 0 24 24"`, quadrado `rx="5.6"` em `#5368e8` e o traço de referência da decisão 1 do design. Verificar abrindo o SVG no navegador que o símbolo corresponde à direção "check em trajetória".
- [x] 1.2 Criar `docs/brand/taskflow-glyph.svg` com o mesmo `path`, sem o quadrado e com `stroke="currentColor"`. Verificar por inspeção que o atributo `d` é idêntico ao do ícone mestre.
- [x] 1.3 Criar `tests/brand/extension-icons.test.ts` com as verificações dos SVGs da decisão 4: `viewBox`, `rect` 24×24 em `#5368e8` só no ícone, único `path` arredondado, `#ffffff` no ícone e `currentColor` no glifo, `d` idêntico e ausência de gradiente, filtro, máscara, imagem e texto. Adicionar a verificação de contraste WCAG (pelo menos 3:1) para os pares documentados. Verificar que `npm run test` passa e que trocar temporariamente o quadrado para `#3549c7` faz o teste falhar.

## 2. PNGs exigidos pelo Chrome

- [x] 2.1 Exportar `public/icon/16.png`, `32.png`, `48.png` sem margem e `public/icon/128.png` com área `-4:-4:28:28`, em RGBA de 8 bits, pelos comandos da decisão 3. Verificar que os quatro arquivos existem.
- [x] 2.2 Observar os PNGs de 16 e 32 em tamanho real sobre `#ffffff` e `#202124`. Se a curva de entrada for lida como "√", linha de pulso ou mancha, ajustar curva e junção nos dois mestres e reexportar. Verificar que o traço é lido como check com entrada curva e registrar a geometria final.
- [x] 2.3 Adicionar a `tests/brand/extension-icons.test.ts` o leitor mínimo de PNG com `node:zlib` (assinatura, `IHDR` RGBA 8 bits, `IDAT`, filtros None/Sub/Up/Average/Paeth) e as verificações de dimensões exatas, bordas opacas de 16/32/48 e margem transparente de 16 px com bordas opacas da área de 96 no PNG de 128. Verificar que `npm run test` passa e que um PNG de 128 exportado sem margem faz o teste falhar com mensagem clara.

## 3. Manifest e notificações

- [x] 3.1 Alterar `ChromeReminderNotifier` para `browser.runtime.getURL('/icon/128.png')` e atualizar a expectativa de `iconUrl` em `tests/entrypoints/background.test.ts` para `icon/128.png`. Verificar que o teste do background passa.
- [x] 3.2 Remover `public/reminder-icon.png` e adicionar a `tests/brand/extension-icons.test.ts` a verificação de que o arquivo não existe. Verificar que `npm run test` passa e que a busca por `reminder-icon` em `src/`, `tests/`, `public/`, `README.md` e `docs/` não retorna ocorrências após a tarefa 4.2.
- [x] 3.3 Executar `npm run build` e verificar em `.output/chrome-mv3/manifest.json` que `icons` contém as chaves `16`, `32`, `48` e `128`, que cada caminho existe em `.output/chrome-mv3/icon/`, que `reminder-icon.png` não existe no pacote e que as permissões são exatamente `sidePanel`, `storage`, `alarms` e `notifications`, sem `host_permissions` nem `optional_host_permissions`. Confirmar que `tests/manifest/manifest-permissions.test.ts` passa sem alteração.
- [x] 3.4 Carregar `.output/chrome-mv3` no Chrome e verificar se a barra da extensão e o seletor do Side Panel mostram o ícone do TaskFlow apenas com `icons`. Somente se não mostrarem, declarar `action.default_icon` com `icon/16.png` e `icon/32.png` em `wxt.config.ts`, repetir a tarefa 3.3 e confirmar que o teste de permissões continua passando.

## 4. Documentação

- [x] 4.1 Criar `docs/brand/README.md` conforme a decisão 7: símbolo e direções descartadas, cores e tabela de contraste, proibições, uso de cada tamanho, comandos de regeneração com Inkscape, aceitação de outra ferramenta cujos PNGs passem no teste e checklist manual. Verificar por leitura a acentuação pt-BR e a coerência dos valores com os mestres e com o teste.
- [x] 4.2 Atualizar `docs/architecture.md` (ícone das notificações e ícones da extensão, com link para `docs/brand/`) e a seção de estrutura do `README.md` (`public/` com os ícones da extensão e `docs/brand/`). Verificar por leitura que não restam menções a `reminder-icon.png` nem descrições de funcionalidades não implementadas, como ícones dinâmicos ou marca nos cabeçalhos.

## 5. Verificação final

- [x] 5.1 Executar o checklist manual na extensão empacotada e registrar o resultado em `verification.md` da Change:
  - barra da extensão com o ícone fixado, no tema claro e no escuro do Chrome;
  - seletor do Side Panel com o ícone;
  - `chrome://extensions` com o ícone de 48;
  - uma notificação real de lembrete no Windows com o ícone sem distorção nem recorte;
  - conclusão sobre a necessidade de `action.default_icon`.
- [x] 5.2 Executar `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build` e `npx openspec validate definir-identidade-visual-e-icones --type change --strict --no-interactive`, corrigindo qualquer falha antes de solicitar a revisão final.
