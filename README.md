# TaskFlow

TaskFlow é uma extensão para Google Chrome voltada à captura rápida e ao gerenciamento de tarefas pessoais e profissionais sem interromper o fluxo de navegação.

## Princípio do produto

O TaskFlow é **sempre autocontido e local-first**. Seu funcionamento principal não dependerá de backend próprio, conta, autenticação central ou serviço operado pelo projeto. Integrações externas e IA poderão existir futuramente como recursos opcionais, configurados e autorizados pelo usuário, sem impedir o uso local quando estiverem desativados ou indisponíveis.

## Status

O MVP de gerenciamento local de tarefas foi implementado pela Change OpenSpec `criar-mvp-gerenciamento-tarefas` (`TF-001`). A exportação e a restauração manual de backup foram implementadas pela Change `adicionar-backup-importacao-exportacao` (`TF-002`). A captura da página atual e do texto selecionado foi implementada pela Change `capturar-pagina-como-tarefa` (`TF-004`). Os lembretes personalizados, com deslocamentos e horários absolutos, migração do storage para `schemaVersion: 2` e backup `formatVersion: 2`, foram implementados pela Change `adicionar-lembretes-personalizados` (`TF-005`). As tarefas recorrentes, com séries diárias, semanais e mensais, geração da próxima ocorrência e a migração do storage para `schemaVersion: 3` e do backup para `formatVersion: 3`, foram implementadas pela Change `adicionar-tarefas-recorrentes` (`TF-006`). As subtarefas, com marcação pelo cartão, progresso calculado e a migração do storage para `schemaVersion: 4` e do backup para `formatVersion: 4`, foram implementadas pela Change `adicionar-subtarefas` (`TF-007`).

## Funcionalidades do MVP

- **Quick Add no popup:** título, prazo, solicitante, responsável e prioridade (padrão `Média`), com foco inicial no título, envio pelo teclado e ação **Abrir gerenciamento**;
- **captura da página atual:** a ação **Usar página atual** lê o título e a URL da aba ativa somente quando acionada, preenche o título vazio e exibe a URL de origem editável e removível;
- **menu de contexto:** **Adicionar página ao TaskFlow** e **Criar tarefa com o texto selecionado** abrem o Side Panel com o formulário pré-preenchido para revisão antes de salvar;
- **Side Panel de gerenciamento:** criação e edição de todos os campos (descrição, subtarefas, status, lembretes, tags e URL de origem), com erros junto aos campos;
- conclusão, cancelamento, reabertura, alteração de status pelo seletor do cartão e exclusão com confirmação; o seletor aplica a escolha somente ao confirmar com Enter, ao sair do seletor ou ao escolher com o ponteiro, e Escape restaura o status persistido;
- uso por teclado com foco previsível: após concluir, cancelar, reabrir, alterar o status ou excluir, o foco vai para o controle equivalente do mesmo cartão, para o cartão vizinho ou para a ação do estado apresentado; falhas de validação levam o foco ao primeiro campo inválido ou à mensagem de erro;
- **subtarefas:** até 20 passos marcáveis por tarefa, em ordem manual; o formulário adiciona, renomeia, remove e reordena os itens, e o cartão mostra o progresso (por exemplo, “2 de 5”) e permite marcar e desmarcar em uma lista expansível. Tarefa e subtarefas são independentes: concluir a tarefa não marca os itens, e marcar todos os itens não conclui a tarefa;
- pesquisa sem diferenciar maiúsculas em título, descrição, solicitante, responsável, tags e títulos das subtarefas;
- filtros combináveis por status, prioridade e situação de prazo, e ordenação por prazo, prioridade ou status;
- sinalização de tarefas **atrasadas** e que **vencem em até 24 horas**;
- persistência local em `chrome.storage.local`, com atualização automática entre popup e Side Panel abertos;
- lembretes personalizados por tarefa: até dez, combinando deslocamentos em minutos antes do prazo e horários absolutos escolhidos no fuso local, entregues por `chrome.notifications` dentro de uma tolerância de cinco minutos; em tarefas recorrentes somente deslocamentos são aceitos;
- **tarefas recorrentes:** regras diárias com intervalo de dias, semanais com um conjunto de dias e mensais por dia do mês, com limite opcional. Cada ocorrência é uma tarefa real: concluir ou pular gera a próxima, cancelar pergunta se deve pular a ocorrência ou encerrar a série e o cartão indica **Recorrente**;
- **backup manual no Side Panel:** exportação de todas as tarefas para um arquivo JSON versionado e restauração por substituição total, com prévia, confirmação e feedback acessível.

Não há backend, conta, sincronização em nuvem nem integrações externas. Não há favicon persistido, atalho de teclado para captura nem leitura do conteúdo da página.

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

Para validar lembretes, crie no Side Panel uma tarefa com prazo alguns minutos à frente e adicione um lembrete por um atalho (**No horário do prazo**, **15 minutos antes**, **1 hora antes** ou **1 dia antes**) ou por uma configuração personalizada com deslocamento ou data e hora. O Chrome aplica um intervalo mínimo de cerca de 30 segundos a alarmes de extensões empacotadas, pode atrasá-los em economia de energia e não garante entrega exatamente no horário planejado; as notificações do Chrome precisam estar permitidas no sistema operacional. Alarmes entregues com mais de cinco minutos de atraso são descartados sem notificação.

## Estrutura principal

```text
public/               ícones da extensão (16, 32, 48 e 128) usados pela barra, pelo
                      Side Panel, por chrome://extensions e pelas notificações
src/
  domain/            modelo Task e regras puras (validação, status, prazos, lembretes, recorrência,
                     subtarefas e captura)
  application/       casos de uso e portas (TaskRepository, ReminderScheduler, ReminderNotifier,
                     ActivePageReader, PendingCaptureInbox)
  infrastructure/    adapters de chrome.storage, chrome.alarms, chrome.notifications,
                     chrome.tabs, chrome.contextMenus e Side Panel
  composition/       montagem dos casos de uso com os adapters do Chrome
  stores/            store Pinia de apresentação
  components/        componentes Vue do Quick Add, do gerenciamento e do backup
  entrypoints/       popup, Side Panel e background do WXT
  styles/            estilos globais mínimos
tests/                testes de domínio, aplicação, infraestrutura, componentes e entrypoints
openspec/             specs e Changes orientadas por SDD
docs/architecture.md  decisões arquiteturais
docs/brand/           símbolo, cores, regras de uso e regeneração dos ícones
docs/roadmap.md       ordem e prompts das futuras Changes
AGENTS.md             regras para agentes de programação
```

## Persistência e estado

As tarefas ficam em `chrome.storage.local`, na chave `taskflow.tasks`, dentro de um envelope versionado (`schemaVersion: 4`) acessado somente pelo `ChromeTaskRepository`, que implementa a interface `TaskRepository`. Coleções nos formatos anteriores são migradas na leitura: em `schemaVersion: 1` cada lembrete vira um deslocamento com o mesmo identificador e a ocorrência eventualmente processada é preservada; a migração de `schemaVersion: 2` é puramente aditiva e não adiciona `seriesId` nem `recurrence` às tarefas existentes; a de `schemaVersion: 3` atribui a lista de subtarefas vazia. Dados em formato incompatível são rejeitados e preservados sem sobrescrita. A UI usa casos de uso e não conhece chaves do storage. Pinia coordena apenas o estado de apresentação de cada superfície; as superfícies abertas convergem pelas notificações de alteração do storage. A restauração de backup usa `replaceAll` para gravar todas as tarefas em uma única escrita, sem criar nem alterar outras chaves; fechar uma ocorrência recorrente e criar a seguinte usam `saveMany`, também em uma única escrita. Marcar uma subtarefa relê a tarefa e altera somente aquela marcação, sem desfazer alterações feitas em outra superfície; salvar o formulário preserva a marcação mais recente de cada item existente.

## Lembretes

Cada lembrete é persistido na tarefa como um deslocamento em minutos antes do prazo (`OFFSET`) ou como um instante absoluto (`AT`) e materializado como um alarme `taskflow:reminder:<taskId>:<reminderId>`. Deslocamentos acompanham mudanças do prazo; instantes absolutos não se movem. Até dez lembretes por tarefa, sem repetir o mesmo instante efetivo.

Criar, editar, concluir, cancelar, reabrir ou excluir uma tarefa reconcilia seus alarmes; instalação, atualização e inicialização do navegador reconciliam todo o conjunto. Ao disparar, o service worker recarrega a tarefa, confirma que ela continua ativa, com o mesmo lembrete e o mesmo instante efetivo, e registra a ocorrência de forma condicional antes de criar uma notificação com identificador determinístico. A entrega é de tentativa única (`at-most-once`): a ocorrência é consumida antes da notificação, e uma falha da API de notificações não repete a tentativa.

A entrega depende do agendamento de melhor esforço do Chrome, que pode atrasar alarmes ou não acordar o dispositivo. Alarmes recebidos até cinco minutos depois do instante efetivo ainda notificam; eventos posteriores e ocorrências vencidas durante uma reconciliação são marcados como processados sem notificação retroativa. Se o agendamento falhar, a tarefa permanece salva e a interface informa que os lembretes estão pendentes.

Em tarefas com recorrência, somente lembretes por deslocamento são aceitos: um instante absoluto não acompanharia as ocorrências seguintes.

## Recorrência

Uma tarefa com prazo pode repetir por três regras, associadas no formulário:

- **diária**, a cada 1 a 365 dias;
- **semanal**, em um a sete dias da semana escolhidos;
- **mensal**, em um dia do mês de 1 a 31.

A série pode terminar em um limite opcional ou continuar indefinidamente. Cada ocorrência é uma tarefa real com o mesmo `seriesId`, e apenas a ocorrência aberta carrega a regra:

- **concluir** a ocorrência gera a próxima; **cancelar** pergunta se você quer pular esta ocorrência (que gera a próxima) ou encerrar a série; excluir a ocorrência que carrega a regra também encerra a série, e a confirmação avisa disso;
- o próximo instante é calculado a partir do instante **agendado** da ocorrência, não do momento da conclusão: concluir atrasado não desloca a série, e ocorrências perdidas são puladas em vez de acumuladas;
- mover o prazo **apenas desta ocorrência** não muda o calendário das seguintes; alterar a regra vale a partir da ocorrência aberta;
- o dia do mês inexistente é ajustado para o último dia daquele mês, sem tornar o ajuste permanente: 31 de janeiro leva ao último dia de fevereiro e depois a 31 de março;
- a série segue o fuso local do navegador e preserva a hora local do dia, inclusive ao atravessar horário de verão;
- lembretes por deslocamento são copiados para a nova ocorrência e voltam a ficar pendentes; ocorrências vencidas durante a geração são liquidadas sem notificação retroativa;
- as subtarefas são copiadas para a nova ocorrência na mesma ordem e desmarcadas; a ocorrência fechada mantém suas marcações;
- reabrir uma ocorrência concluída não devolve a regra nem gera outra ocorrência.

Nenhuma ocorrência nasce sozinha: a próxima é criada quando a atual é fechada, em uma única gravação, sem alarme novo, despertar periódico ou permissão adicional.

## Backup e restauração

O backup é manual e fica no Side Panel, acessível pelo botão **Backup** no cabeçalho ou por **Restaurar backup** quando não há tarefas.

- **Exportar:** gera `taskflow-backup-AAAA-MM-DD-HHmm.json` com todas as tarefas persistidas, inclusive as ocultas por filtros. O arquivo contém `format: "taskflow-backup"`, `formatVersion: 4`, `exportedAt`, a versão da extensão e a lista de tarefas com timestamps, estado dos lembretes (deslocamentos ou instantes absolutos com a ocorrência processada), subtarefas com suas marcações e, quando existirem, o identificador de série e a regra de recorrência. Nenhum outro dado armazenado é incluído.
- **Restaurar:** escolhe um arquivo, valida integralmente todas as tarefas e mostra uma prévia com a data de exportação, as versões, quantas tarefas vêm do arquivo e quantas serão substituídas. A gravação só ocorre após a confirmação e substitui todas as tarefas atuais de uma só vez.

Limites e avisos:

- o arquivo precisa ser um JSON gerado pelo TaskFlow, com `formatVersion` igual ou anterior à suportada (arquivos `formatVersion: 1`, `formatVersion: 2` e `formatVersion: 3` são migrados na leitura, em sequência, até a versão 4), e ter no máximo 20 MiB;
- qualquer tarefa inválida recusa o arquivo inteiro; os primeiros erros são listados com posição e campo;
- o arquivo **não é criptografado** e pode conter dados pessoais; guarde-o em um local seguro;
- a restauração não pode ser desfeita nesta versão; não há mesclagem com os dados locais nem backup automático;
- dados locais em formato incompatível bloqueiam exportação e restauração e são preservados.

## Captura de página e seleção

A captura acontece em duas entradas e sempre por ação explícita do usuário:

- **Popup:** o botão **Usar página atual** lê o título e a URL da aba ativa apenas no clique. O título normalizado (até 200 caracteres) preenche o campo se ele estiver vazio e é preservado se você já tiver digitado; a URL aparece em **URL de origem**, onde pode ser editada ou removida com **Remover URL de origem**. Nada é salvo sem a confirmação do formulário.
- **Menu de contexto:** clique com o botão direito na página para **Adicionar página ao TaskFlow** ou sobre um texto selecionado para **Criar tarefa com o texto selecionado**, exibido somente em páginas `http` e `https`. O Side Panel abre com o formulário **Nova tarefa** pré-preenchido e a indicação "Dados capturados da página. Revise antes de salvar.".

Mapeamento e limites:

- o título da página ou a seleção normalizada (espaços e quebras de linha colapsados) vira o título, reduzido a 200 caracteres com "…";
- quando a seleção não cabe no título, o texto completo vai para a descrição, reduzido a 4.000 caracteres;
- a URL `http`/`https` vira a URL de origem; páginas internas do navegador não podem ser capturadas;
- a captura pendente é única, válida por 10 minutos e substituída pela mais recente; se o Side Panel estiver em edição ou na área de backup, a captura aguarda e pode ser revisada ou descartada;
- a captura pendente fica somente na sessão do navegador: não é gravada junto às tarefas, não entra em backups e desaparece ao fechar o navegador.

Páginas internas (`chrome://`), arquivos locais (`file://`), o visualizador de PDF e a Chrome Web Store não exibem o menu nem permitem a captura. A extensão não lê o conteúdo da página, não lê o texto selecionado pelo popup, não lê o favicon, não acessa outras abas e não envia dados para fora.

## Permissões

| Permissão       | Motivo                                                            |
| --------------- | ----------------------------------------------------------------- |
| `sidePanel`     | Abrir o painel principal de gerenciamento a partir do popup.      |
| `storage`       | Persistir as tarefas localmente e manter a captura pendente na sessão do navegador. |
| `alarms`        | Programar lembretes que sobrevivem à suspensão do service worker. |
| `notifications` | Exibir os lembretes de tarefas.                                   |
| `activeTab`     | Ler título e URL da aba ativa somente quando você aciona a captura. |
| `contextMenus`  | Registrar os itens de captura da página e do texto selecionado.   |

Nenhuma dessas permissões exibe aviso de instalação, e não há `tabs`, `scripting`, `favicon`, `host_permissions`, `content_scripts` nem acesso permanente a sites.

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

Este projeto é disponibilizado sob a licença MIT. Consulte o arquivo [`LICENSE`](LICENSE) para conhecer os termos.
