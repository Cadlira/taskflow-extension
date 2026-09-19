import type { HostPermissions } from '@/application/ai/host-permissions';

/**
 * Padrão de correspondência de uma única origem. A porta é ignorada pelo formato do Chrome, então
 * `http://localhost:11434` e `http://localhost:1234` compartilham o mesmo padrão.
 */
export function originMatchPattern(origin: string): string {
  return `${origin}/*`;
}

/**
 * Permissões de host sobre `chrome.permissions`. Toda operação recebe a origem resolvida da
 * configuração: nenhum padrão abrangente é solicitado em tempo de execução.
 */
export class ChromeHostPermissions implements HostPermissions {
  has(origin: string): Promise<boolean> {
    return browser.permissions.contains({ origins: [originMatchPattern(origin)] });
  }

  /** Exige gesto do usuário: deve ser chamada diretamente do manipulador do clique. */
  request(origin: string): Promise<boolean> {
    return browser.permissions.request({ origins: [originMatchPattern(origin)] });
  }

  revoke(origin: string): Promise<boolean> {
    return browser.permissions.remove({ origins: [originMatchPattern(origin)] });
  }
}
