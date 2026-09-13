## Why

Todas as tarefas do TaskFlow vivem apenas em `chrome.storage.local`, que é apagado quando a extensão é removida e não tem cópia em nenhum outro lugar. Como o produto não tem nem terá backend, um arquivo exportado pelo próprio usuário é a única forma de proteger os dados contra desinstalação, troca de computador ou falha do navegador, e ele precisa continuar legível pelas versões futuras do TaskFlow.

## What Changes

- Adicionar ao Side Panel uma área de backup acessível pelo cabeçalho e pelo estado de lista vazia.
- Permitir exportar manualmente todas as tarefas para um arquivo JSON versionado (`format: "taskflow-backup"`, `formatVersion: 1`, `exportedAt`, `app.version`, `tasks`), montado a partir das tarefas do domínio e baixado pelo navegador.
- Permitir restaurar um backup local no modo **substituir tudo**:
  - leitura de arquivo escolhido pelo usuário, com limite de tamanho;
  - validação integral (tudo ou nada) do formato e de todas as regras de uma tarefa persistida;
  - rejeição de arquivos que não sejam backups do TaskFlow ou que tenham `formatVersion` superior à suportada;
  - migração encadeada de versões anteriores do formato;
  - prévia com data de exportação, versão, total de tarefas do arquivo e total local que será substituído;
  - oferta de exportar os dados atuais antes e confirmação explícita.
- Restaurar preservando timestamps, marcando como processados os lembretes cujo horário já passou, gravando a coleção de uma só vez, reconciliando todos os alarmes e verificando a coleção gravada.
- Bloquear exportação e restauração quando os dados locais estiverem em formato incompatível, preservando-os.
- Garantir por construção e por teste que nada além das tarefas é exportado e que a importação não grava nenhuma outra chave, preparando o terreno para credenciais locais futuras.
- Manter as permissões atuais do Manifest, sem `downloads` nem acesso a hosts.

### Não objetivos

- Mesclagem de backups com os dados locais ou resolução de conflitos por tarefa.
- Backup automático, periódico ou agendado.
- Criptografia ou proteção por senha do arquivo.
- Exportação/importação em CSV ou importação de outros aplicativos.
- Importação parcial (ignorar tarefas inválidas e importar o restante).
- Desfazer uma restauração ou manter snapshots internos; pertence a `TF-008` (histórico e desfazer).
- Sincronização entre navegadores ou dispositivos.
- Backup de configurações, preferências ou credenciais; credenciais de IA de `TF-010` nunca serão exportadas.
- Restauração a partir do popup.

Mesclagem, backup agendado e criptografia exigirão Changes futuras próprias, somente se houver necessidade demonstrada.

## Capabilities

### New Capabilities

- `task-backup`: exportação manual de tarefas em arquivo versionado, validação e migração do formato, prévia e restauração segura no modo substituir tudo, bloqueio diante de dados incompatíveis e isolamento de dados que não sejam tarefas.

### Modified Capabilities

- `task-reminders`: a reconciliação de alarmes passa a ocorrer também após uma restauração de backup, recriando alarmes das tarefas restauradas e removendo os das tarefas substituídas.

## Impact

- **Domínio:** validação completa de uma tarefa persistida (limites, normalização, URL, coerência de status e lembretes), reaproveitando as regras já existentes.
- **Aplicação:** novo caso de uso de backup (exportar, preparar restauração, restaurar), formato de arquivo com migrações e novo método `TaskRepository.replaceAll`.
- **Infraestrutura:** `ChromeTaskRepository.replaceAll` com escrita única na chave `taskflow.tasks`, preservando a recusa em sobrescrever dados incompatíveis; composição informa a versão do Manifest.
- **UI:** nova área de backup no Side Panel com seletor de arquivo, prévia, confirmação e feedback acessível; o popup não muda.
- **Manifest:** nenhuma permissão nova; o teste de permissões permanece inalterado.
- **Dados:** novo contrato público de arquivo (`formatVersion` 1), independente do `schemaVersion` do storage, com arquivo de referência v1 versionado nos testes.
- **Documentação:** `docs/architecture.md` e `README.md` descrevem backup e restauração; `docs/roadmap.md` acompanha o estado da `TF-002`.
