## Why

O TaskFlow precisa transformar sua fundação técnica em um MVP local que permita capturar uma atividade sem interromper a navegação e administrá-la em uma superfície mais ampla. Esta Change estabelece o primeiro fluxo útil completo, mantendo os dados no navegador e preparando lembretes compatíveis com o ciclo de vida do Manifest V3.

## What Changes

- Adicionar o modelo de tarefa com título, descrição, solicitante, responsável, status, prioridade, prazo, lembretes, tags, URL de origem e timestamps de auditoria.
- Permitir criar, visualizar, editar, excluir, concluir, cancelar e alterar o status de tarefas.
- Implementar um Quick Add no popup, com os campos de uso mais frequente e acesso ao gerenciamento completo.
- Usar o Side Panel como interface principal para listagem, formulário completo, pesquisa, filtros e ordenação.
- Destacar tarefas atrasadas e próximas do vencimento com critérios determinísticos.
- Persistir tarefas localmente por meio de um repository sobre `chrome.storage.local`, sem acesso direto da UI ao storage.
- Programar lembretes persistidos por meio de `chrome.alarms` e exibi-los com `chrome.notifications`, incluindo reconciliação após inicialização/atualização.
- Adicionar ao Manifest somente as permissões `storage`, `alarms` e `notifications` exigidas pelo MVP, preservando a permissão `sidePanel` já existente.
- Criar testes de domínio, aplicação, persistência, lembretes e componentes para os comportamentos definidos.

Não são objetivos desta Change: backend, autenticação, sincronização em nuvem ou entre dispositivos, integração com Jira/GitHub/Outlook/Teams, tarefas recorrentes, subtarefas, histórico de alterações, dashboards, captura automática da página ou texto selecionado, menus de contexto, interpretação de linguagem natural, IA, notificações por canais externos ou publicação na Chrome Web Store. Esses itens exigirão Changes futuras.

## Capabilities

### New Capabilities

- `task-management`: ciclo de vida, validação, persistência local, listagem, pesquisa, filtros, ordenação e indicadores temporais das tarefas.
- `quick-add`: criação rápida de tarefas pelo popup e acesso à experiência completa no Side Panel.
- `task-reminders`: configuração, agendamento, reconciliação e entrega local de lembretes compatíveis com Manifest V3.

### Modified Capabilities

Nenhuma. O projeto ainda não possui specs consolidadas.

## Impact

- **Domínio/aplicação:** novas entidades e regras puras de tarefa, casos de uso e contratos de repository e agendamento.
- **Infraestrutura Chrome:** adapter de `chrome.storage.local`, scheduler baseado em `chrome.alarms`, notificações e listeners no service worker.
- **UI:** evolução do popup para Quick Add e do Side Panel para gerenciamento completo, com estado de apresentação em Pinia.
- **Manifest:** inclusão das permissões `storage`, `alarms` e `notifications`; nenhuma `host_permission` será adicionada.
- **Dados:** criação de envelope local versionado para permitir migrações futuras; não há API pública nem migração de dados preexistentes nesta primeira versão.
- **Qualidade:** ampliação da suíte Vitest/Vue Test Utils e manutenção do gate de lint, typecheck, testes e build.
