# Verificação manual — criar-mvp-gerenciamento-tarefas (TF-001)

Registro da tarefa 7.2: fluxo manual no Chrome para Quick Add, CRUD, pesquisa/filtros, sincronização entre popup e Side Panel e lembrete.

## Contexto

- **Data:** 2026-09-13
- **Build:** `npm run build` a partir do commit `8a1e1bf`, carregado sem compactação a partir de `.output/chrome-mv3`
- **Ambiente:** Windows 11, Google Chrome com Modo do desenvolvedor
- **Execução:** manual, pelo responsável humano, com conferência dos dados persistidos no console do service worker (`chrome.storage.local` e `chrome.alarms`)
- **Resultado geral:** **aprovado**

## Resultados

| Bloco                            | Cenários verificados                                                                                                                                                                                                                                                                          | Resultado                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| 1. Quick Add e sincronização     | Popup com foco no título e prioridade `Média`; validação de título vazio; criação por teclado com limpeza do formulário; Side Panel aberto refletindo a tarefa criada; tarefa persistida em `taskflow.tasks` com status `TODO` e prioridade `MEDIUM`                                          | Aprovado                 |
| 2. CRUD e ações                  | Erro de URL `ftp://` junto ao campo; tags duplicadas por caixa normalizadas; selo **Atrasada** para prazo passado e **Vence em até 24 h** para prazo próximo; edição cancelada sem alteração e edição salva; concluir, reabrir e cancelar; exclusão com diálogo cancelado e depois confirmada | Aprovado                 |
| 3. Pesquisa, filtros e ordenação | Pesquisa sem diferenciar maiúsculas; combinação de filtros com estado "Nenhuma tarefa encontrada"; limpar filtros; alternância de ordenação; dados preservados ao fechar e reabrir o painel                                                                                                   | Aprovado                 |
| 4. Lembrete                      | Alarme `taskflow:reminder:<taskId>:<reminderId>` criado no horário do prazo; notificação entregue com título da tarefa, prazo e ícone; ocorrência registrada em `lastTriggeredFor`; tarefa exibida como **Atrasada** após o prazo                                                             | Aprovado, com observação |

## Observação sobre a exibição da notificação

Na primeira tentativa (prazo 16:51), o lembrete foi processado (`lastTriggeredFor` preenchido após a última edição, às 16:50:16), mas nada foi exibido. Uma notificação criada manualmente pelo console, sem passar pelo código do TaskFlow, também não apareceu, o que isolou a causa na configuração de notificações do sistema operacional.

Após ajuste das configurações do Windows, o lembrete seguinte (prazo 16:54) foi entregue e registrado na Central de Notificações do Windows como "Teste lembrete — Prazo: 13/09/2026, 16:54 — Lembrete do TaskFlow". A faixa (banner) não foi exibida na tela porque o modo **Não perturbe** do Windows permanecia ativo. A apresentação da faixa é controlada pelo sistema operacional e não pela extensão; o comportamento especificado em `task-reminders` (notificação com título e prazo e registro da ocorrência processada) foi atendido.

## Pendências

Nenhuma pendência funcional. Não foram exercitados manualmente:

- reconciliação após reinício completo do navegador, coberta por testes automatizados do background com o fake browser do WXT;
- atraso de alarmes por economia de energia, tratado como melhor esforço no `design.md` e não verificado.
