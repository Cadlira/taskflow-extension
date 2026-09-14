/** Ação da listagem que originou uma alteração de status. */
export type TaskStatusAction = 'complete' | 'cancel' | 'reopen' | 'status';

/** Origem de uma alteração de status emitida pela listagem. */
export interface StatusChangeOrigin {
  action: TaskStatusAction;
  fromFocusout: boolean;
}
