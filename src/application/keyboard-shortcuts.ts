/** Ações do TaskFlow que podem ter um atalho de teclado atribuído pelo navegador. */
export type ShortcutAction = 'QUICK_ADD' | 'OPEN_TASK_MANAGER';

/**
 * Atalho em vigor de uma ação. `combination` ausente representa explicitamente
 * "sem atalho": o navegador conhece o comando, mas nenhuma combinação está atribuída.
 */
export interface ActionShortcut {
  action: ShortcutAction;
  combination?: string;
}

/** Porta de leitura dos atalhos em vigor e de acesso à personalização do navegador. */
export interface KeyboardShortcutsReader {
  /** Atalhos em vigor no momento da consulta; o navegador é a fonte da verdade. */
  read(): Promise<ActionShortcut[]>;
  /** Abre a tela de atalhos do navegador para personalização. */
  openCustomization(): Promise<void>;
}

/** Rótulo em pt-BR de cada ação, usado onde os atalhos são apresentados. */
export const SHORTCUT_ACTION_LABELS: Record<ShortcutAction, string> = {
  QUICK_ADD: 'Nova tarefa (Quick Add)',
  OPEN_TASK_MANAGER: 'Abrir o gerenciamento de tarefas',
};

/** Ordem de apresentação das ações, independente da ordem devolvida pelo navegador. */
export const SHORTCUT_ACTION_ORDER: readonly ShortcutAction[] = ['QUICK_ADD', 'OPEN_TASK_MANAGER'];
