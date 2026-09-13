export interface TaskManagerNavigator {
  open(): Promise<void>;
}

export async function openTaskManager(navigator: TaskManagerNavigator): Promise<void> {
  await navigator.open();
}
