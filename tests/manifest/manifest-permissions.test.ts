import { describe, expect, it } from 'vitest';
import config from '../../wxt.config';

const REQUIRED_PERMISSIONS = [
  'activeTab',
  'alarms',
  'contextMenus',
  'notifications',
  'sidePanel',
  'storage',
];

const FORBIDDEN_PERMISSIONS = ['tabs', 'scripting', 'favicon', '<all_urls>'];

describe('permissões declaradas no Manifest', () => {
  const manifest = config.manifest as {
    permissions?: string[];
    optional_permissions?: string[];
    host_permissions?: string[];
    content_scripts?: unknown[];
  };

  it('declara exatamente as permissões exigidas pela captura', () => {
    expect([...(manifest.permissions ?? [])].sort()).toEqual([...REQUIRED_PERMISSIONS].sort());
  });

  it('não declara permissões proibidas', () => {
    for (const permission of FORBIDDEN_PERMISSIONS) {
      expect(manifest.permissions ?? [], permission).not.toContain(permission);
    }
    expect(manifest.optional_permissions ?? []).toEqual([]);
  });

  it('não declara acesso a hosts nem content scripts', () => {
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(JSON.stringify(manifest)).not.toContain('<all_urls>');
  });
});
