import type { InjectionKey } from 'vue';
import type { PendingCaptureInbox } from '@/application/page-capture';

export const pendingCaptureKey: InjectionKey<PendingCaptureInbox> = Symbol('PendingCaptureInbox');
