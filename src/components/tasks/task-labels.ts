import type { TaskPriority, TaskStatus } from '@/domain/task';
import type { DueSituation, TaskSortKey } from '@/domain/task-queries';
import type { ReminderOffset } from '@/domain/task-reminders';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'A fazer',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  URGENT: 'Urgente',
};

export const DUE_SITUATION_LABELS: Record<DueSituation, string> = {
  OVERDUE: 'Atrasada',
  DUE_SOON: 'Vence em até 24 h',
};

export const REMINDER_LABELS: Record<ReminderOffset, string> = {
  0: 'No horário do prazo',
  15: '15 minutos antes',
  60: '1 hora antes',
  1440: '1 dia antes',
};

export const SORT_LABELS: Record<TaskSortKey, string> = {
  DUE_DATE: 'Prazo',
  PRIORITY: 'Prioridade',
  STATUS: 'Status',
};

export const REMINDERS_PENDING_MESSAGE =
  'A tarefa foi salva, mas os lembretes ficaram pendentes. O TaskFlow tentará agendá-los novamente ao reiniciar a extensão ou ao salvar a tarefa.';
