import { describe, expect, it } from 'vitest';
import config from '../../wxt.config';

describe('permissões declaradas no Manifest', () => {
  const manifest = config.manifest as { permissions?: string[]; host_permissions?: string[] };

  it('solicita somente as permissões exigidas pelo MVP', () => {
    expect([...(manifest.permissions ?? [])].sort()).toEqual(
      ['alarms', 'notifications', 'sidePanel', 'storage'].sort(),
    );
  });

  it('não solicita permissões de captura de página nem acesso a hosts', () => {
    for (const permission of ['activeTab', 'tabs', 'scripting', 'contextMenus', '<all_urls>']) {
      expect(manifest.permissions ?? []).not.toContain(permission);
    }
    expect(manifest.host_permissions).toBeUndefined();
  });
});
