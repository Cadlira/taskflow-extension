import type { TaskPriority, TaskStatus } from '@/domain/task';
import type { DueSituation, TaskSortKey } from '@/domain/task-queries';
import type { RecurrenceFrequency } from '@/domain/task-recurrence';
import type { ReminderPreset } from '@/domain/task-reminders';

export const STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'A fazer',
  IN_PROGRESS: 'Em andamento',
  DONE: 'Concluída',
  CANCELLED: 'Cancelada',
};

export const RECURRENCE_FREQUENCY_LABELS: Record<RecurrenceFrequency, string> = {
  DAILY: 'Diariamente',
  WEEKLY: 'Semanalmente',
  MONTHLY: 'Mensalmente',
};

export const WEEKDAY_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

/** Nome do controle que expande as subtarefas no cartão. */
export const SUBTASKS_TOGGLE_LABEL = 'Subtarefas';

/** Progresso textual das subtarefas, por exemplo "2 de 5". */
export function subtaskProgressLabel(done: number, total: number): string {
  return `${done} de ${total}`;
}

/** Indicação textual de tarefa recorrente no cartão. */
export const RECURRENCE_BADGE_LABEL = 'Recorrente';

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

/** Unidades oferecidas pelo formulário; convertidas pelo domínio para minutos. */
export type ReminderOffsetUnit = 'MINUTES' | 'HOURS' | 'DAYS';

export const REMINDER_UNITS: readonly ReminderOffsetUnit[] = ['MINUTES', 'HOURS', 'DAYS'];

export const REMINDER_UNIT_MINUTES: Record<ReminderOffsetUnit, number> = {
  MINUTES: 1,
  HOURS: 60,
  DAYS: 1440,
};

export const REMINDER_UNIT_LABELS: Record<ReminderOffsetUnit, string> = {
  MINUTES: 'minutos',
  HOURS: 'horas',
  DAYS: 'dias',
};

export const REMINDER_LABELS: Record<ReminderPreset, string> = {
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
