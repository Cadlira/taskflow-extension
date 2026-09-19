/**
 * Permissão de host obtida em tempo de execução, sempre restrita à origem do provedor
 * configurado. A origem tem a forma `https://api.exemplo` ou `http://localhost:11434`, sem
 * caminho: um padrão abrangente nunca é solicitado.
 */
export interface HostPermissions {
  /** Verifica se a extensão já detém acesso àquela origem. */
  has(origin: string): Promise<boolean>;
  /** Solicita o acesso a partir de um gesto do usuário; resolve `false` quando recusado. */
  request(origin: string): Promise<boolean>;
  /** Devolve o acesso àquela origem; resolve `false` quando o navegador não o revogou. */
  revoke(origin: string): Promise<boolean>;
}
