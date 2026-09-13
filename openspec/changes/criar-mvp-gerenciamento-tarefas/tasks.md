## 1. Domínio de tarefas

- [x] 1.1 Criar tipos `Task`, `TaskReminder`, `TaskStatus` e `TaskPriority`, incluindo UUID e timestamps UTC, e verificar por typecheck que o domínio não importa Vue, Pinia, WXT ou APIs Chrome.
- [x] 1.2 Implementar criação e validação de tarefas com normalização de texto, tags, limites e URL HTTP(S), e verificar com testes unitários os casos válidos e cada rejeição prevista em `task-management`.
- [x] 1.3 Implementar transições de status, conclusão, reabertura e cancelamento com as regras de `completedAt`, e verificar todos os caminhos com relógio determinístico em testes unitários.
- [x] 1.4 Implementar seletores puros de pesquisa, combinação de filtros, ordenação, atraso e vencimento em 24 horas, e verificar limites temporais, tarefas sem prazo e status terminais em testes unitários.

## 2. Persistência local

- [x] 2.1 Definir a porta `TaskRepository` e o envelope `StoredTaskCollection` com `schemaVersion: 1`, e verificar por typecheck que aplicação/domínio não dependem de tipos Chrome.
- [x] 2.2 Implementar o repository de `chrome.storage.local` na chave `taskflow.tasks`, incluindo leitura inicial, normalização segura, escrita e exclusão, e verificar com o fake browser do WXT persistência e recuperação.
- [x] 2.3 Implementar assinatura de mudanças via storage para sincronizar superfícies abertas, e verificar em teste de infraestrutura que uma alteração externa notifica assinantes com a coleção atualizada.
- [x] 2.4 Tratar dados ausentes, envelope incompatível e falhas da API sem informar sucesso enganoso, e verificar os estados de erro e a preservação dos dados anteriores em testes.

## 3. Casos de uso e estado de apresentação

- [x] 3.1 Implementar casos de uso de listar, obter, criar, atualizar, excluir e alterar status por composição explícita de repository, relógio, gerador de IDs e scheduler, e verificar cada caso com fakes unitários.
- [x] 3.2 Implementar store Pinia para carregamento, erro, tarefas, filtros, ordenação e seleção, mantendo o repository como fonte persistente, e verificar ações e getters em testes isolados.
- [x] 3.3 Conectar a assinatura do repository ao ciclo de vida das stores do popup e Side Panel, com descarte do listener, e verificar em teste que atualizações externas aparecem sem vazamento de inscrições.

## 4. Gerenciamento completo no Side Panel

- [x] 4.1 Substituir a tela de fundação por layout acessível com estados de carregamento, vazio, erro e tentativa novamente, e verificar renderização e foco das ações com Vue Test Utils.
- [x] 4.2 Criar formulário completo para todos os campos do MVP, conversão local/UTC e erros junto aos campos, e verificar criação, edição, cancelamento e preservação de identidade em testes de componente.
- [x] 4.3 Criar lista com título, status, prioridade, prazo e sinalização de atrasada/próxima do vencimento, e verificar visualmente os quatro status e as situações temporais em testes de componente.
- [x] 4.4 Adicionar ações de concluir, cancelar, reabrir, alterar status e excluir com confirmação, e verificar que cada ação chama o caso de uso correto e que cancelar a confirmação não altera a tarefa.
- [x] 4.5 Adicionar pesquisa, filtros combináveis, limpeza e ordenações previstas na spec, e verificar os resultados e estados sem correspondência com testes de componente.

## 5. Quick Add no popup

- [x] 5.1 Implementar formulário compacto com título, prazo, solicitante, responsável e prioridade `MEDIUM`, foco inicial e envio por teclado, e verificar criação válida e valores padrão em teste de componente.
- [x] 5.2 Exibir validações sem perder o preenchimento e limpar o formulário somente após sucesso confirmado, e verificar falha de validação, falha de persistência e sucesso em testes.
- [x] 5.3 Manter a ação de abrir o Side Panel sem ler a aba atual e preservar o formulário se a abertura falhar, e verificar a navegação com gateway fake e a ausência de permissões de captura no Manifest.

## 6. Lembretes Manifest V3

- [x] 6.1 Implementar validação e cálculo de lembretes únicos para `0`, `15`, `60` e `1440` minutos antes do prazo, incluindo `lastTriggeredFor`, e verificar casos sem prazo, duplicados, futuros e vencidos em testes unitários.
- [x] 6.2 Definir a porta `ReminderScheduler` e implementar o adapter `chrome.alarms` com nomes determinísticos, criação e remoção idempotentes, e verificar as operações com o fake browser do WXT.
- [x] 6.3 Integrar a reconciliação por tarefa aos casos de uso de criar, editar, concluir, cancelar, reabrir e excluir, e verificar em testes que alarmes obsoletos são removidos e falha de agendamento mantém a tarefa com aviso.
- [x] 6.4 Implementar no background a reconciliação global em `runtime.onInstalled` e `runtime.onStartup`, e verificar que alarmes futuros ausentes são recriados e ocorrências passadas são marcadas sem notificação.
- [x] 6.5 Implementar `alarms.onAlarm` com recarga e revalidação da tarefa antes de usar `chrome.notifications`, e verificar entrega válida, descarte de alarme obsoleto e prevenção de duplicidade em testes.
- [x] 6.6 Adicionar seleção de lembretes ao formulário completo e feedback de agendamento pendente, e verificar opções, exigência de prazo e mensagens em testes de componente.

## 7. Manifest, integração e documentação

- [x] 7.1 Adicionar somente `storage`, `alarms` e `notifications` às permissões existentes do Manifest e verificar no `.output/chrome-mv3/manifest.json` a presença exata dessas quatro permissões e a ausência de `host_permissions`.
- [ ] 7.2 Executar o fluxo manual no Chrome para Quick Add, CRUD, pesquisa/filtros, sincronização popup/Side Panel e pelo menos um lembrete, registrando o resultado da verificação na Change antes de marcá-la concluída.
- [x] 7.3 Atualizar README e arquitetura apenas com comandos e comportamentos efetivamente implementados, e verificar que não há indicação de backend, captura de página ou integração externa como funcionalidade disponível.
- [x] 7.4 Executar `npm run lint`, `npm run typecheck`, `npm run test`, `npm run test:coverage`, `npm run build` e a validação OpenSpec estrita, corrigindo qualquer falha antes de solicitar revisão final da implementação.
