import type { InjectionKey } from 'vue';
import type { BackupService } from '@/application/backup/backup-service';

export const backupServiceKey: InjectionKey<BackupService> = Symbol('BackupService');
