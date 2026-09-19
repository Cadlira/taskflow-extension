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

/**
 * Teto exato do que pode ser pedido em tempo de execução. Declarar não concede: a concessão
 * efetiva é sempre a origem específica do provedor configurado.
 */
const OPTIONAL_HOST_PERMISSIONS = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'];

describe('permissões declaradas no Manifest', () => {
  const manifest = config.manifest as {
    permissions?: string[];
    optional_permissions?: string[];
    host_permissions?: string[];
    optional_host_permissions?: string[];
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

  it('fixa exatamente o teto de optional_host_permissions', () => {
    expect([...(manifest.optional_host_permissions ?? [])].sort()).toEqual(
      [...OPTIONAL_HOST_PERMISSIONS].sort(),
    );
  });

  it('não amplia o teto com esquemas ou padrões além dos fixados', () => {
    for (const pattern of manifest.optional_host_permissions ?? []) {
      expect(OPTIONAL_HOST_PERMISSIONS, pattern).toContain(pattern);
      expect(pattern).not.toContain('<all_urls>');
      expect(pattern).not.toMatch(/^\*:/);
      expect(pattern).not.toMatch(/^file:/);
    }
    // Sem TLS só em loopback: nenhum padrão http remoto entra no teto.
    for (const pattern of manifest.optional_host_permissions ?? []) {
      if (pattern.startsWith('http://')) {
        expect(pattern).toMatch(/^http:\/\/(localhost|127\.0\.0\.1)\//);
      }
    }
  });
});

interface ManifestCommand {
  suggested_key?: Record<string, string>;
  description?: string;
  global?: boolean;
}

describe('comandos de teclado declarados no Manifest', () => {
  const commands = (config.manifest as { commands?: Record<string, ManifestCommand> }).commands;
  const entries = Object.entries(commands ?? {});
  const combinations = entries.flatMap(([name, command]) =>
    Object.entries(command.suggested_key ?? {}).map(([platform, combination]) => ({
      name,
      platform,
      combination,
    })),
  );

  it('declara exatamente o comando reservado de ação e open-task-manager', () => {
    expect(Object.keys(commands ?? {}).sort()).toEqual(['_execute_action', 'open-task-manager']);
  });

  it('sugere Ctrl+Shift+K e Command+Shift+K para o Quick Add, sem descrição', () => {
    expect(commands?._execute_action?.suggested_key).toEqual({
      default: 'Ctrl+Shift+K',
      mac: 'Command+Shift+K',
    });
    expect(commands?._execute_action?.description).toBeUndefined();
  });

  it('sugere Ctrl+Shift+L e Command+Shift+L para o gerenciamento, com descrição em pt-BR', () => {
    expect(commands?.['open-task-manager']?.suggested_key).toEqual({
      default: 'Ctrl+Shift+L',
      mac: 'Command+Shift+L',
    });
    expect(commands?.['open-task-manager']?.description).toBe(
      'Abrir o gerenciamento de tarefas no Side Panel',
    );
  });

  it('não declara comando sem combinação sugerida', () => {
    for (const [name, command] of entries) {
      expect(Object.keys(command.suggested_key ?? {}), name).not.toEqual([]);
    }
  });

  it('declara apenas as chaves default e mac em cada combinação sugerida', () => {
    for (const [name, command] of entries) {
      expect(Object.keys(command.suggested_key ?? {}).sort(), name).toEqual(['default', 'mac']);
    }
  });

  it('não marca nenhum comando como global', () => {
    for (const [name, command] of entries) {
      expect(command.global, name).toBeUndefined();
    }
    expect(JSON.stringify(commands)).not.toContain('global');
  });

  it('não usa Ctrl+Alt em nenhuma combinação', () => {
    for (const { name, platform, combination } of combinations) {
      expect(combination, `${name}.${platform}`).not.toMatch(/Ctrl\+Alt|Alt\+Ctrl/);
    }
  });

  it('restringe MacCtrl à combinação de macOS', () => {
    for (const { name, platform, combination } of combinations) {
      if (platform !== 'mac') {
        expect(combination, `${name}.${platform}`).not.toContain('MacCtrl');
      }
    }
  });
});
