import { BACKUP_MAX_BYTES, type BackupFailureReason } from '@/application/backup/backup-service';
import type { BackupField } from '@/domain/task-integrity';

const BACKUP_MAX_MIB = BACKUP_MAX_BYTES / (1024 * 1024);

/** Motivos de recusa ou bloqueio, apresentados ao usuário. */
export const BACKUP_REASON_LABELS: Record<BackupFailureReason, string> = {
  FILE_TOO_LARGE: `O arquivo é maior que o limite de ${BACKUP_MAX_MIB} MiB e não foi lido. Nenhuma tarefa foi alterada.`,
  INVALID_JSON: 'O arquivo não pôde ser lido como backup. Nenhuma tarefa foi alterada.',
  NOT_TASKFLOW_BACKUP: 'O arquivo não é um backup do TaskFlow. Nenhuma tarefa foi alterada.',
  INVALID_FORMAT_VERSION: 'A versão do arquivo de backup é inválida. Nenhuma tarefa foi alterada.',
  NEWER_FORMAT_VERSION:
    'O backup foi gerado por uma versão mais nova do TaskFlow. Atualize a extensão para restaurá-lo.',
  INVALID_STRUCTURE:
    'O arquivo não contém a estrutura esperada de um backup do TaskFlow. Nenhuma tarefa foi alterada.',
  INVALID_TASKS:
    'O arquivo contém tarefas inválidas e não pode ser restaurado. Nenhuma tarefa foi alterada.',
  LOCAL_DATA_INCOMPATIBLE:
    'As tarefas atuais estão em um formato incompatível e foram preservadas. Exportação e restauração ficam bloqueadas até que os dados sejam corrigidos.',
  STORAGE_UNAVAILABLE:
    'Não foi possível acessar o armazenamento local. Nenhuma tarefa foi alterada.',
};

export const BACKUP_UNENCRYPTED_WARNING =
  'O arquivo de backup não é criptografado e pode conter dados pessoais. Guarde-o em um local seguro.';

export const RESTORE_CONFIRM_TITLE = 'Substituir todas as tarefas?';

export const RESTORE_CONFIRM_MESSAGE =
  'Todas as tarefas atuais serão substituídas pelas tarefas do arquivo. Esta ação não pode ser desfeita.';

export const BACKUP_RESTORE_UNCONFIRMED_MESSAGE =
  'A restauração foi gravada, mas não pôde ser confirmada. Confira a listagem de tarefas.';

/** Nome legível de cada campo apontado por um erro de validação do arquivo. */
export const BACKUP_FIELD_LABELS: Record<BackupField, string> = {
  task: 'estrutura',
  id: 'identificador',
  title: 'título',
  description: 'descrição',
  requester: 'solicitante',
  assignee: 'responsável',
  status: 'status',
  priority: 'prioridade',
  dueAt: 'prazo',
  reminders: 'lembretes',
  seriesId: 'série',
  recurrence: 'recorrência',
  tags: 'tags',
  sourceUrl: 'URL de origem',
  createdAt: 'criação',
  updatedAt: 'atualização',
  completedAt: 'conclusão',
};
