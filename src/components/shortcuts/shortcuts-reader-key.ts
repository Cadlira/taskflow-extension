import type { InjectionKey } from 'vue';
import type { KeyboardShortcutsReader } from '@/application/keyboard-shortcuts';

export const shortcutsReaderKey: InjectionKey<KeyboardShortcutsReader> =
  Symbol('KeyboardShortcutsReader');
