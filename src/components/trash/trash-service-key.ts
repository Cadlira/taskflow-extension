import type { InjectionKey } from 'vue';
import type { TrashService } from '@/application/trash-service';

export const trashServiceKey: InjectionKey<TrashService> = Symbol('TrashService');
