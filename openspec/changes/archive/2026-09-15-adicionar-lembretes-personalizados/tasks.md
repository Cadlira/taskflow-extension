## 1. Modelo e regras de domínio

- [x] 1.1 Substituir o lembrete legado pela união estrita `OFFSET | AT` com `processedFor`, preservar IDs em edição e verificar em testes de domínio a criação, alteração e remoção dos dois tipos.
- [x] 1.2 Implementar a resolução pura do instante efetivo e verificar em testes offsets arbitrários, horário absoluto, mudança de prazo, duração exata de 24 horas e instantes ISO 8601 UTC.
- [x] 1.3 Validar até dez lembretes, deslocamentos inteiros seguros não negativos, horários absolutos até o prazo, itens novos ou alterados ainda futuros e unicidade do instante efetivo, verificando todos os erros e fronteiras em `task-draft` e `task-integrity`.
- [x] 1.4 Planejar, liquidar e marcar ocorrências por `processedFor`, separando tolerância de alarme obsoleto da janela de atraso de cinco minutos, e verificar em testes lembretes futuros, processados, vencidos, reabertos e atrasados exatamente nos limites.

## 2. Persistência e compatibilidade local

- [x] 2.1 Evoluir o envelope para `schemaVersion: 2`, adicionar leitura e migração explícita da versão 1 e verificar que lembretes pendentes e processados preservam identificador, deslocamento e ocorrência efetiva.
- [x] 2.2 Fazer o decoder v2 aceitar somente a união atual e recusar versões futuras ou dados inválidos sem sobrescrita, verificando também que qualquer offset inteiro não negativo aceito pelo decoder v1 é preservado na migração.
- [x] 2.3 Atualizar `ChromeTaskRepository`, fakes e fixtures para gravar somente v2 e verificar leitura, escrita, assinatura de mudanças e proteção contra dados incompatíveis.

## 3. Backup versão 2

- [x] 3.1 Elevar o backup para `formatVersion: 2`, implementar a migração v1 -> v2 e adicionar uma fixture imutável v2 com lembretes relativos, absolutos e processados, verificando que as fixtures v1 e v2 produzem as tarefas esperadas.
- [x] 3.2 Atualizar a validação integral para tipos, limites, instantes e deduplicação efetiva dos lembretes, verificando arquivos válidos, tipos desconhecidos, horários posteriores ao prazo, mais de dez itens e colisões entre `OFFSET` e `AT`.
- [x] 3.3 Adaptar exportação e restauração para preservar a forma v2, liquidar ocorrências passadas sem notificar e reconciliar alarmes futuros, verificando ida e volta, restauração atômica, propriedades desconhecidas e ausência de dados alheios às tarefas.
- [x] 3.4 Atualizar prévia, rótulos e testes de componente do backup para informar a versão 2 sem alterar o fluxo de confirmação ou solicitar permissões adicionais.

## 4. Entrega e reconciliação Manifest V3

- [x] 4.1 Implementar uma operação condicional de claim que releia a tarefa e grave `processedFor` somente se a mesma ocorrência ainda estiver válida e pendente, verificando sucesso, edição concorrente, falha de persistência e evento repetido.
- [x] 4.2 Alterar `ReminderService` para validar o instante efetivo e a janela de cinco minutos, executar o claim antes da notificação e usar ID determinístico da ocorrência, verificando entrega válida, atraso excessivo, alarme obsoleto, eventos simultâneos e falha da API de notificações sem nova tentativa.
- [x] 4.3 Adaptar a reconciliação por tarefa e global para os dois tipos sem persistir estado derivado de agendamento, verificando convergência idempotente após execução parcial, mudança de prazo, mudança de tipo, conclusão, cancelamento, reabertura, exclusão e restauração.
- [x] 4.4 Manter listeners registrados sincronamente em `runtime.onInstalled`, `runtime.onStartup` e `alarms.onAlarm` e verificar em testes do background que suspensão ou recriação do worker depende somente de storage e alarmes persistentes, sem timer em memória.
- [x] 4.5 Preservar um alarme nomeado por tarefa e lembrete, tratamento explícito de rejeição/capacidade da API e feedback de lembretes pendentes, verificando criação, substituição, remoção seletiva e nova reconciliação com o fake browser.

## 5. Interface de lembretes personalizados

- [x] 5.1 Substituir o grupo fixo por presets e uma lista editável de até dez lembretes, com tipo, valor/unidade ou `datetime-local` e remoção, verificando em testes de componente inclusão, edição, exclusão, limite e conversão para o rascunho discriminado.
- [x] 5.2 Manter os atalhos `0`, `15`, `60` e `1440` sincronizados com itens `OFFSET` sem duplicatas e verificar que ativar e desativar presets preserva IDs e outros lembretes.
- [x] 5.3 Associar erros ao item e ao grupo, manter operação por teclado e foco no primeiro controle inválido e verificar acessibilidade, dados preservados após falha e feedback de agendamento pendente.
- [x] 5.4 Verificar na integração do Side Panel que lembrete relativo acompanha o prazo, absoluto preserva o instante, mudança inválida de prazo é rejeitada e os horários reabrem convertidos no fuso local vigente.

## 6. Documentação e gates

- [x] 6.1 Atualizar `README.md` e `docs/architecture.md` com o comportamento atual, a semântica `OFFSET | AT`, a janela de cinco minutos, a tentativa `at-most-once`, as migrações v2 e o limite de melhor esforço do Chrome, verificando ausência de afirmações de pontualidade ou entrega exatamente uma vez.
- [x] 6.2 Validar que o Manifest de produção mantém exatamente `activeTab`, `alarms`, `contextMenus`, `notifications`, `sidePanel` e `storage`, não contém `host_permissions` e não ganhou dependências, verificando o teste de Manifest e o `package.json`.
- [x] 6.3 Executar `npm run lint`, `npm run typecheck`, `npm run test` e `npm run build`, corrigir todas as falhas dentro do escopo e registrar os resultados da validação automatizada.
- [x] 6.4 Carregar o build MV3 em um perfil de teste e validar manualmente presets, offset personalizado, horário absoluto, mudança de prazo, evento repetido, descarte após cinco minutos, reinício do navegador e restauração dos backups v1 e v2, registrando as evidências na Change.
- [x] 6.5 Executar `npx openspec validate adicionar-lembretes-personalizados --type change --strict --no-interactive` e considerar o apply concluído somente quando artefatos, implementação, testes e evidências manuais estiverem coerentes.
