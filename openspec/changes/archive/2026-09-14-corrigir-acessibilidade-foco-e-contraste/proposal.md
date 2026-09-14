## Why

O explore da `TF-003` não encontrou evidência de uso real nem feedback (nenhuma issue, nenhum comentário nos PRs, sem telemetria por princípio local-first), mas confirmou, por medição e reprodução, defeitos de acessibilidade no popup e no Side Panel:

- no Chromium para Windows, percorrer com as setas o seletor de status de um cartão grava um status a cada tecla e desabilita o seletor, o que joga o foco para o `body`;
- concluir, cancelar ou reabrir uma tarefa pelos botões do cartão e confirmar uma exclusão removem do DOM o controle focado, e o foco vai para o `body` (reproduzido em teste de componente);
- o anel de foco `#aeb9ff` tem 1,88:1 sobre `#ffffff` e 1,77:1 sobre `#f7f8fc`, abaixo de 3:1;
- a opacidade de 0,8 nos cartões concluídos e cancelados reduz rótulos a 3,35:1 e botões secundários a 4,17:1, abaixo de 4,5:1;
- a borda dos campos `#c9d0de` tem 1,55:1, e no popup é o único contorno do campo.

Quem usa teclado ou leitor de tela perde a posição na lista a cada ação e pode gravar status que não escolheu. As correções são pequenas, verificáveis por teste e não dependem de dados de uso, por isso podem ser feitas agora.

## What Changes

- **Status pela listagem:** percorrer as opções do seletor de status pelo teclado deixa de gravar valores intermediários. O status só é aplicado quando a escolha é confirmada (Enter, saída do campo ou seleção com ponteiro), e Escape restaura o valor atual.
- **Foco após ações da listagem:** depois de concluir, cancelar, reabrir, alterar o status ou excluir uma tarefa, o foco vai para um controle previsível: o controle equivalente no mesmo cartão quando ele continua visível, ou o cartão vizinho, ou a ação principal do estado vazio.
- **Controles em processamento:** os controles do cartão deixam de ser desabilitados enquanto a operação é processada, para não perder o foco; acionamentos repetidos continuam ignorados.
- **Foco em erro de validação:** quando salvar falha no formulário do Side Panel ou no Quick Add, o foco vai para o primeiro campo inválido; sem erro de campo, vai para a mensagem de falha.
- **Contraste:** o indicador de foco passa a ter pelo menos 3:1 e a borda dos campos pelo menos 3:1 contra as superfícies onde aparecem; o texto dos cartões concluídos e cancelados mantém pelo menos 4,5:1, sem redução por opacidade.
- **Estrutura de títulos:** a listagem ganha um título de seção próprio, para que as tarefas não fiquem agrupadas sob o título de pesquisa e filtros na navegação por títulos.
- **Seletor de arquivo de backup:** o rótulo "Escolher arquivo de backup" passa a ter a aparência e o indicador de foco dos demais botões secundários.
- **Verificação:** testes de componente para cada comportamento de foco e teclado, teste automatizado das razões de contraste dos tokens de cor e checklist manual no Chrome com o Side Panel na largura real.
- **Roadmap:** a antiga `TF-003` foi restrita a acessibilidade; melhorias de experiência baseadas em uso foram separadas na `TF-013`.

### Não objetivos

- Melhorias de experiência sem evidência de uso, que ficam para a `TF-013`: densidade dos cartões, status repetido no cartão, persistência das mensagens de feedback, destino do foco após salvar uma edição.
- Tema escuro no conteúdo das páginas, troca ou empacotamento da fonte `Inter` e redesenho de popup, Side Panel, cartões ou filtros.
- Alterar a paleta da marca definida em `extension-icons` ou a cor `--color-primary`.
- Auditoria completa de WCAG, conformidade formal ou testes com leitores de tela específicos; a verificação manual cobre teclado e foco.
- Introduzir bibliotecas de acessibilidade ou de auditoria automatizada (por exemplo, axe).
- Novas ações de status no cartão, atalhos de teclado ou reordenação da lista.
- Qualquer mudança de domínio, persistência, lembretes, backup ou permissões.

## Capabilities

### New Capabilities

- `interface-accessibility`: requisitos de acessibilidade das superfícies do TaskFlow. Cobre a alteração de status pelo teclado sem gravações intermediárias, o destino do foco após ações da listagem e após falhas de validação, o contraste mínimo de texto, indicador de foco e bordas de campos, a estrutura de títulos da listagem e o seletor de arquivo de backup.

### Modified Capabilities

Nenhuma. As regras de status, exclusão, validação, Quick Add e backup continuam as mesmas; a Change só define como essas interações se comportam para teclado, foco e contraste, o que fica em `interface-accessibility`.

## Impact

- **Componentes:** `TaskList.vue` (seletor de status, controles em processamento, contraste dos cartões), `TaskManager.vue` (destino do foco e título da listagem), `TaskForm.vue` e `QuickAdd.vue` (foco em erro), `BackupManager.vue` (seletor de arquivo).
- **Estilos:** tokens de foco e de borda de campos em `src/styles/base.css`.
- **Testes:** novos casos em `TaskList`, `TaskManager`, `TaskForm`, `QuickAdd` e `BackupManager`; novo teste de contraste dos tokens.
- **Sem impacto** em domínio, aplicação, persistência, lembretes, Manifest ou permissões; nenhuma dependência nova.
- **Documentação:** `docs/roadmap.md` acompanha a `TF-003` e registra a `TF-013`; `README.md` só muda se algum comportamento documentado mudar.
