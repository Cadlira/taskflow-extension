# TaskFlow

TaskFlow é uma extensão para Google Chrome voltada à captura rápida e ao gerenciamento de tarefas pessoais e profissionais sem interromper o fluxo de navegação.

## Status

O projeto está na fase de **fundação técnica + especificação do MVP**. A extensão mínima já possui popup, Side Panel e service worker carregáveis. O gerenciamento funcional de tarefas está especificado na Change OpenSpec `criar-mvp-gerenciamento-tarefas` e **ainda não foi aplicado**.

## MVP planejado

- Quick Add no popup;
- criação, edição e exclusão de tarefas;
- conclusão, cancelamento e alteração de status;
- listagem, pesquisa, filtros e ordenação;
- prazo, prioridade, solicitante, responsável e tags;
- identificação de tarefas atrasadas e próximas do vencimento;
- persistência com `chrome.storage.local` por meio de um repository;
- lembretes compatíveis com Manifest V3 usando `chrome.alarms` e `chrome.notifications`.

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
5. Abra o popup pelo ícone do TaskFlow e use **Abrir gerenciamento** para validar o Side Panel.

## Estrutura principal

```text
src/
  application/       casos de uso e portas
  components/        componentes Vue compartilhados
  entrypoints/       popup, Side Panel e background do WXT
  infrastructure/    adapters de APIs do Chrome
  styles/            estilos globais mínimos
tests/                testes unitários e de componentes
openspec/             specs e Changes orientadas por SDD
docs/architecture.md  decisões arquiteturais
AGENTS.md             regras para agentes de programação
```

O domínio `Task`, o repository de persistência e os serviços de lembrete serão criados pelo apply da primeira Change; eles não fazem parte da fundação para evitar implementar o MVP antes da revisão.

## Persistência e estado

O MVP usará `chrome.storage.local`, escondido atrás de uma interface `TaskRepository`. A UI acessará casos de uso e não chaves do storage. Pinia coordenará apenas estado de apresentação e ações assíncronas; não substituirá o repository persistente.

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

## CI

O workflow `.github/workflows/ci.yml` roda em pull requests e pushes para `main`, executando instalação reproduzível, lint, typecheck, testes e build. Não há deploy ou publicação configurados.

## Licença

Nenhuma licença pública foi definida. O repositório é privado e essa decisão será tomada posteriormente.
