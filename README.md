# TaskFlow

TaskFlow é uma extensão para Google Chrome voltada à captura rápida e ao gerenciamento de tarefas pessoais e profissionais sem interromper o fluxo de navegação.

## Princípio do produto

O TaskFlow é **sempre autocontido e local-first**. Seu funcionamento principal não dependerá de backend próprio, conta, autenticação central ou serviço operado pelo projeto. Integrações externas e IA poderão existir futuramente como recursos opcionais, configurados e autorizados pelo usuário, sem impedir o uso local quando estiverem desativados ou indisponíveis.

## Status

O MVP de gerenciamento local de tarefas foi implementado pela Change OpenSpec `criar-mvp-gerenciamento-tarefas` (`TF-001`). A exportação e a restauração manual de backup foram implementadas pela Change `adicionar-backup-importacao-exportacao` (`TF-002`), em verificação antes do archive.

## Funcionalidades do MVP

- **Quick Add no popup:** título, prazo, solicitante, responsável e prioridade (padrão `Média`), com foco inicial no título, envio pelo teclado e ação **Abrir gerenciamento**;
- **Side Panel de gerenciamento:** criação e edição de todos os campos (descrição, status, lembretes, tags e URL de origem digitada manualmente), com erros junto aos campos;
- conclusão, cancelamento, reabertura, alteração direta de status e exclusão com confirmação;
- pesquisa sem diferenciar maiúsculas em título, descrição, solicitante, responsável e tags;
- filtros combináveis por status, prioridade e situação de prazo, e ordenação por prazo, prioridade ou status;
- sinalização de tarefas **atrasadas** e que **vencem em até 24 horas**;
- persistência local em `chrome.storage.local`, com atualização automática entre popup e Side Panel abertos;
- lembretes no horário do prazo, 15 minutos, 1 hora ou 1 dia antes, entregues por `chrome.notifications`;
- **backup manual no Side Panel:** exportação de todas as tarefas para um arquivo JSON versionado e restauração por substituição total, com prévia, confirmação e feedback acessível.

Não há backend, conta, sincronização em nuvem, captura da página atual, menu de contexto nem integrações externas.

## Tecnologias

- Chrome Extension Manifest V3;
- WXT 0.21 + Vite 8;
- Vue 3 + Pinia;
- TypeScript 6 em modo estrito;
- Vitest + Vue Test Utils;
- ESLint + Prettier;
- OpenSpec 1.13;
- npm e GitHub Actions.

### Por que WXT

WXT foi escolhido em vez de uma estrutura manual com Vite porque trata entrypoints, Manifest V3, desenvolvimento e build de extensões de forma nativa. O projeto mantém acesso à configuração do Vite sem precisar manter scripts próprios para popup, Side Panel e service worker. A decisão completa está em [`docs/architecture.md`](docs/architecture.md).

## Requisitos

- Node.js 22.12 ou superior (Node 24 é usado na CI);
- npm 10 ou superior;
- Google Chrome com suporte a Side Panel.

## Instalação e desenvolvimento

```bash
npm install
npm run dev
```

O WXT inicia o modo de desenvolvimento e abre um navegador com a extensão quando um navegador compatível estiver disponível.

## Qualidade

```bash
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run format:check
npm run build
```

Para executar o gate local completo:

```bash
npm run validate
```

## Build e instalação manual no Chrome

Gere o build:

```bash
npm run build
```

O build de produção para Chrome/Manifest V3 fica em `.output/chrome-mv3`.

Para carregá-lo manualmente:

1. Abra `chrome://extensions`.
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação**.
4. Selecione a pasta `.output/chrome-mv3`.
5. Abra o popup pelo ícone do TaskFlow, adicione uma tarefa e use **Abrir gerenciamento** para validar o Side Panel.

Para validar lembretes, crie no Side Panel uma tarefa com prazo alguns minutos à frente e selecione **No horário do prazo**. O Chrome aplica um intervalo mínimo de cerca de 30 segundos a alarmes de extensões empacotadas e pode atrasá-los em economia de energia; as notificações do Chrome precisam estar permitidas no sistema operacional.

## Estrutura principal

```text
public/               ícone usado nas notificações de lembrete
src/
  domain/            modelo Task e regras puras (validação, status, prazos, lembretes)
  application/       casos de uso e portas (TaskRepository, ReminderScheduler, ReminderNotifier)
  infrastructure/    adapters de chrome.storage, chrome.alarms, chrome.notifications e Side Panel
  composition/       montagem dos casos de uso com os adapters do Chrome
  stores/            store Pinia de apresentação
  components/        componentes Vue do Quick Add, do gerenciamento e do backup
  entrypoints/       popup, Side Panel e background do WXT
  styles/            estilos globais mínimos
tests/                testes de domínio, aplicação, infraestrutura, componentes e entrypoints
openspec/             specs e Changes orientadas por SDD
docs/architecture.md  decisões arquiteturais
docs/roadmap.md       ordem e prompts das futuras Changes
AGENTS.md             regras para agentes de programação
```

## Persistência e estado

As tarefas ficam em `chrome.storage.local`, na chave `taskflow.tasks`, dentro de um envelope versionado (`schemaVersion: 1`) acessado somente pelo `ChromeTaskRepository`, que implementa a interface `TaskRepository`. Dados em formato incompatível são rejeitados e preservados sem sobrescrita. A UI usa casos de uso e não conhece chaves do storage. Pinia coordena apenas o estado de apresentação de cada superfície; as superfícies abertas convergem pelas notificações de alteração do storage. A restauração de backup usa `replaceAll` para gravar todas as tarefas em uma única escrita, sem criar nem alterar outras chaves.

## Lembretes

Cada lembrete é persistido na tarefa e materializado como um alarme `taskflow:reminder:<taskId>:<reminderId>`. Criar, editar, concluir, cancelar, reabrir ou excluir uma tarefa reconcilia seus alarmes; instalação, atualização e inicialização do navegador reconciliam todo o conjunto. Ao disparar, o service worker recarrega a tarefa e só notifica se ela continuar ativa, com o mesmo lembrete e prazo e sem ocorrência já processada. Lembretes cujo horário passou antes de uma reconciliação são marcados como processados sem notificação retroativa. Se o agendamento falhar, a tarefa permanece salva e a interface informa que os lembretes estão pendentes.

## Backup e restauração

O backup é manual e fica no Side Panel, acessível pelo botão **Backup** no cabeçalho ou por **Restaurar backup** quando não há tarefas.

- **Exportar:** gera `taskflow-backup-AAAA-MM-DD-HHmm.json` com todas as tarefas persistidas, inclusive as ocultas por filtros. O arquivo contém `format: "taskflow-backup"`, `formatVersion: 1`, `exportedAt`, a versão da extensão e a lista de tarefas com timestamps e estado dos lembretes. Nenhum outro dado armazenado é incluído.
- **Restaurar:** escolhe um arquivo, valida integralmente todas as tarefas e mostra uma prévia com a data de exportação, as versões, quantas tarefas vêm do arquivo e quantas serão substituídas. A gravação só ocorre após a confirmação e substitui todas as tarefas atuais de uma só vez.

Limites e avisos:

- o arquivo precisa ser um JSON gerado pelo TaskFlow, com `formatVersion` igual ou anterior à suportada, e ter no máximo 20 MiB;
- qualquer tarefa inválida recusa o arquivo inteiro; os primeiros erros são listados com posição e campo;
- o arquivo **não é criptografado** e pode conter dados pessoais; guarde-o em um local seguro;
- a restauração não pode ser desfeita nesta versão; não há mesclagem com os dados locais nem backup automático;
- dados locais em formato incompatível bloqueiam exportação e restauração e são preservados.

## Permissões

| Permissão       | Motivo                                                            |
| --------------- | ----------------------------------------------------------------- |
| `sidePanel`     | Abrir o painel principal de gerenciamento a partir do popup.      |
| `storage`       | Persistir as tarefas localmente em `chrome.storage.local`.        |
| `alarms`        | Programar lembretes que sobrevivem à suspensão do service worker. |
| `notifications` | Exibir os lembretes de tarefas.                                   |

Não há `host_permissions` nem permissões de acesso à página atual.

## OpenSpec

O OpenSpec está configurado no schema `spec-driven`, em pt-BR, com comandos/skills para Codex, Claude Code, OpenCode, GitHub Copilot e agentes compatíveis.

Consulte as Changes:

```bash
npm run openspec -- list
npm run openspec -- status --change criar-mvp-gerenciamento-tarefas
npm run openspec -- show criar-mvp-gerenciamento-tarefas
```

Para iniciar uma nova Change, use o workflow `openspec-propose` do agente configurado ou a CLI:

```bash
npm run openspec -- new change nome-da-change
```

Depois, produza `proposal.md`, specs delta, `design.md` e `tasks.md` seguindo as instruções retornadas por `openspec instructions`. Revise e valide os artefatos antes de implementar:

```bash
npm run openspec -- validate nome-da-change --type change --strict --no-interactive
```

O workflow `/opsx:apply` (ou equivalente do agente) só deve ser executado após revisão e aprovação explícita da Change.

O fluxo completo adotado pelo projeto é:

```text
Roadmap → Explore → Propose → revisão humana → Apply → Verify
→ PR → revisão/aprovação → Archive na mesma branch → CI final → Merge
```

O archive deve ser commitado na própria feature branch antes do merge. Dessa forma, os artefatos arquivados e as specs consolidadas entram na `main` pelo mesmo PR, sem commit direto. Consulte [`docs/roadmap.md`](docs/roadmap.md).

## CI

O workflow `.github/workflows/ci.yml` roda em pull requests e pushes para `main`, executando instalação reproduzível, lint, typecheck, testes e build. Não há deploy ou publicação configurados.

## Licença

Nenhuma licença pública foi definida. O repositório é privado e essa decisão será tomada posteriormente.
