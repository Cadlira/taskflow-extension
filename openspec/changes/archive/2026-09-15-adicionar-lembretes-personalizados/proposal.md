## Why

Os lembretes atuais já são persistentes e confiáveis no Manifest V3, mas a interface limita cada tarefa a quatro deslocamentos fixos. O TaskFlow precisa permitir combinações pessoais de antecedência e instantes exatos sem perder compatibilidade com tarefas e backups existentes nem introduzir notificações duplicadas ou retroativas.

## What Changes

- Permitir até dez lembretes distintos por tarefa com prazo, combinando deslocamentos personalizados em minutos antes do prazo e horários absolutos escolhidos no fuso local do navegador.
- Manter os quatro deslocamentos atuais como atalhos e distinguir explicitamente lembretes relativos, que acompanham alterações do prazo, de lembretes absolutos, que preservam o instante escolhido.
- Identificar a ocorrência processada pelo instante efetivo de disparo, deduplicar configurações que resultem no mesmo instante e limitar a entrega a uma tolerância de cinco minutos após o horário planejado.
- Adotar tentativa de entrega `at-most-once`: registrar condicionalmente a ocorrência antes de criar uma notificação com identificador determinístico.
- Reconciliar alarmes idempotentemente a partir dos dados persistidos, inclusive após reinício do navegador, restauração de backup e alterações de prazo, status ou configuração.
- Evoluir o storage e o backup para a versão 2, migrando lembretes relativos e ocorrências processadas da versão 1 sem alterar seus identificadores nem perder dados.
- Preservar as permissões atuais e o funcionamento totalmente local, sem backend, novas dependências ou novos acessos a sites.
- Não inclui recorrência, snooze, regras por dia útil, feriados, fuso IANA por tarefa, horários de calendário como “um dia antes às 09:00” nem um dispatcher global de alarmes; recorrência e regras de calendário permanecem deferidas para a `TF-006`.

## Capabilities

### New Capabilities

Nenhuma.

### Modified Capabilities

- `task-reminders`: amplia a configuração para deslocamentos e horários absolutos personalizados e define validação, fuso, reconciliação, tolerância de atraso e deduplicação por ocorrência.
- `task-backup`: evolui o formato para a versão 2 e exige migração compatível dos lembretes exportados na versão 1.

## Impact

- Modelo e regras de domínio de tarefas e lembretes, validação de rascunhos e integridade de dados persistidos.
- Formulário completo do Side Panel e seus estados acessíveis de validação e feedback.
- Serviço de lembretes, reconciliação idempotente, adapter de `chrome.alarms` e criação de `chrome.notifications` no service worker Manifest V3.
- Envelope de `chrome.storage.local`, formato público de backup, migrações e fixtures de compatibilidade.
- Testes de domínio, aplicação, infraestrutura Chrome, componentes, backup, Manifest e build de produção; nenhuma permissão nova é necessária.
