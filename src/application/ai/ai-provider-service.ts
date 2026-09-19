import {
  buildAiProviderConfig,
  resolveApiBase,
  resolveConfigOrigin,
  type AiConfigFieldErrors,
  type AiProvider,
  type AiProviderConfig,
  type AiProviderConfigDraft,
} from '@/domain/ai-provider';
import type {
  AiConnectionFailure,
  AiConnectionProbe,
  AiConnectionTester,
} from './ai-connection-tester';
import {
  AiConfigStorageError,
  type AiProviderConfigRepository,
} from './ai-provider-config-repository';
import type { HostPermissions } from './host-permissions';

/**
 * Visão da configuração entregue à interface. Não carrega a credencial: apenas a marca de que
 * existe uma gravada, que não permite reconstruí-la.
 */
export interface AiConfigSummary {
  provider: AiProvider;
  /** Base efetiva, fixa nos provedores oficiais e informada em `CUSTOM`. */
  apiBase: string;
  origin: string;
  model: string;
  hasCredential: boolean;
}

/** Bloqueios que impedem salvar e testar, deixando ao usuário apenas a remoção explícita. */
export type AiConfigBlock = 'INCOMPATIBLE' | 'UNAVAILABLE';

export type AiConfigStatus =
  | { state: 'NONE' }
  | { state: 'CONFIGURED'; summary: AiConfigSummary; permissionGranted: boolean }
  | { state: 'BLOCKED'; blocked: AiConfigBlock };

export type SaveAiConfigResult =
  | { ok: true; status: AiConfigStatus }
  | { ok: false; errors: AiConfigFieldErrors }
  | { ok: false; blocked: AiConfigBlock };

export type RemoveAiConfigResult =
  | { ok: true; permissionRevoked: boolean }
  | { ok: false; blocked: AiConfigBlock };

export type AiTestResult =
  | { ok: true }
  | { ok: false; reason: AiConnectionFailure; status?: number }
  | { ok: false; blocked: AiConfigBlock };

export interface AiProviderServiceDependencies {
  repository: AiProviderConfigRepository;
  permissions: HostPermissions;
  tester: AiConnectionTester;
}

function summarize(config: AiProviderConfig): AiConfigSummary {
  return {
    provider: config.provider,
    apiBase: resolveApiBase(config),
    origin: resolveConfigOrigin(config),
    model: config.model,
    hasCredential: config.credential !== '',
  };
}

function blockFor(error: unknown): AiConfigBlock {
  return error instanceof AiConfigStorageError && error.reason === 'INCOMPATIBLE_DATA'
    ? 'INCOMPATIBLE'
    : 'UNAVAILABLE';
}

/**
 * Casos de uso da configuração BYOK: ler o estado atual, gravar substituindo por completo,
 * remover apagando a credencial e revogando o acesso, e testar a conexão. Nenhuma operação
 * contata o provedor fora de `testConnection`, que só é chamada por acionamento do usuário.
 */
export function createAiProviderService({
  repository,
  permissions,
  tester,
}: AiProviderServiceDependencies) {
  async function readConfig(): Promise<
    { ok: true; config: AiProviderConfig | undefined } | { ok: false; blocked: AiConfigBlock }
  > {
    try {
      return { ok: true, config: await repository.read() };
    } catch (error) {
      return { ok: false, blocked: blockFor(error) };
    }
  }

  async function describe(config: AiProviderConfig | undefined): Promise<AiConfigStatus> {
    if (config === undefined) {
      return { state: 'NONE' };
    }

    const summary = summarize(config);

    return {
      state: 'CONFIGURED',
      summary,
      // Verificação de posse ao abrir a área: revogação por fora fica visível de imediato.
      permissionGranted: await permissions.has(summary.origin),
    };
  }

  /** Estado atual da área. Não realiza nenhuma requisição ao provedor. */
  async function load(): Promise<AiConfigStatus> {
    const read = await readConfig();

    return read.ok ? describe(read.config) : { state: 'BLOCKED', blocked: read.blocked };
  }

  async function save(draft: AiProviderConfigDraft): Promise<SaveAiConfigResult> {
    const read = await readConfig();

    // Configuração incompatível bloqueia a gravação: nada é sobrescrito por caminho automático.
    if (!read.ok) {
      return { ok: false, blocked: read.blocked };
    }

    const built = buildAiProviderConfig(draft, read.config);

    if (!built.ok) {
      return { ok: false, errors: built.errors };
    }

    try {
      await repository.save(built.config);
    } catch (error) {
      return { ok: false, blocked: blockFor(error) };
    }

    return { ok: true, status: await describe(built.config) };
  }

  /** Apaga a configuração e devolve o acesso à origem que ela usava. */
  async function remove(): Promise<RemoveAiConfigResult> {
    const read = await readConfig();
    const origin = read.ok && read.config !== undefined ? resolveConfigOrigin(read.config) : undefined;

    try {
      await repository.remove();
    } catch (error) {
      return { ok: false, blocked: blockFor(error) };
    }

    if (origin === undefined) {
      return { ok: true, permissionRevoked: false };
    }

    try {
      return { ok: true, permissionRevoked: await permissions.revoke(origin) };
    } catch {
      return { ok: true, permissionRevoked: false };
    }
  }

  /**
   * Solicita o acesso à origem configurada. Deve ser chamada diretamente do gesto do usuário,
   * porque o navegador exige isso; a origem é sempre específica, nunca um padrão abrangente.
   */
  async function requestPermission(origin: string): Promise<boolean> {
    if (await permissions.has(origin)) {
      return true;
    }

    return permissions.request(origin);
  }

  /**
   * Único caminho de rede desta capability. Sem permissão concedida, nada é enviado: a credencial
   * não sai do dispositivo.
   */
  async function testConnection(probe: AiConnectionProbe): Promise<AiTestResult> {
    const read = await readConfig();

    if (!read.ok) {
      return { ok: false, blocked: read.blocked };
    }

    if (read.config === undefined) {
      return { ok: false, reason: 'PERMISSION_MISSING' };
    }

    const origin = resolveConfigOrigin(read.config);

    if (!(await permissions.has(origin))) {
      return { ok: false, reason: 'PERMISSION_MISSING' };
    }

    return tester.testConnection({ config: read.config, probe });
  }

  return { load, save, remove, requestPermission, testConnection };
}

export type AiProviderService = ReturnType<typeof createAiProviderService>;
