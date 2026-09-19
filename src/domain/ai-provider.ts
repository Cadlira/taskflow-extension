/**
 * Configuração BYOK de um provedor de IA: provedor, base da API, credencial e modelo. Puro: não
 * conhece armazenamento, rede nem interface.
 */

/** Provedores admitidos. `CUSTOM` cobre gateways próprios e servidores locais. */
export type AiProvider = 'OPENAI' | 'ANTHROPIC' | 'CUSTOM';

/** Bases fixas dos provedores oficiais; a extensão não oferece campo para alterá-las. */
export const OPENAI_API_BASE = 'https://api.openai.com/v1';
export const ANTHROPIC_API_BASE = 'https://api.anthropic.com';

export const AI_PROVIDERS: readonly AiProvider[] = ['OPENAI', 'ANTHROPIC', 'CUSTOM'];

export function isAiProvider(value: unknown): value is AiProvider {
  return value === 'OPENAI' || value === 'ANTHROPIC' || value === 'CUSTOM';
}

/** Credencial e modelo são comuns aos três provedores; somente `CUSTOM` carrega base informada. */
interface AiProviderCredentials {
  credential: string;
  model: string;
}

/**
 * Configuração ativa. A base dos provedores oficiais não faz parte do valor porque é constante da
 * extensão: o tipo impede que ela seja informada, gravada ou editada.
 */
export type AiProviderConfig =
  | ({ provider: 'OPENAI' } & AiProviderCredentials)
  | ({ provider: 'ANTHROPIC' } & AiProviderCredentials)
  | ({ provider: 'CUSTOM'; apiBase: string } & AiProviderCredentials);

/** Base efetiva das requisições, fixa para os provedores oficiais. */
export function resolveApiBase(config: AiProviderConfig): string {
  if (config.provider === 'OPENAI') {
    return OPENAI_API_BASE;
  }

  return config.provider === 'ANTHROPIC' ? ANTHROPIC_API_BASE : config.apiBase;
}

/** Hosts em loopback, onde o tráfego não deixa o dispositivo e `http` é admitido. */
const LOOPBACK_HOSTS = ['localhost', '127.0.0.1', '[::1]'];

export type AiBaseFailure =
  | 'REQUIRED'
  | 'MALFORMED'
  | 'INSECURE_SCHEME'
  | 'EMBEDDED_CREDENTIALS'
  | 'QUERY_OR_FRAGMENT';

export type AiBaseValidation =
  | { ok: true; base: string }
  | { ok: false; reason: AiBaseFailure };

/**
 * Valida a base informada para `CUSTOM`. Aceita `https` em qualquer host e `http` somente em
 * loopback; recusa credenciais embutidas, cadeia de consulta e fragmento, porque a chave viajaria
 * no endereço e cairia nos logs do servidor de destino. O caminho é permitido, para admitir
 * gateways servidos sob prefixo, e a barra final é descartada na normalização.
 */
export function validateApiBase(value: string): AiBaseValidation {
  const trimmed = value.trim();

  if (trimmed === '') {
    return { ok: false, reason: 'REQUIRED' };
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'MALFORMED' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'INSECURE_SCHEME' };
  }

  if (url.protocol === 'http:' && !LOOPBACK_HOSTS.includes(url.hostname)) {
    return { ok: false, reason: 'INSECURE_SCHEME' };
  }

  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'EMBEDDED_CREDENTIALS' };
  }

  if (url.search !== '' || url.hash !== '') {
    return { ok: false, reason: 'QUERY_OR_FRAGMENT' };
  }

  const path = url.pathname.replace(/\/+$/, '');

  return { ok: true, base: `${url.origin}${path}` };
}

/**
 * Origem de destino das requisições, usada na exibição ao usuário e na solicitação da permissão de
 * host. Nunca inclui caminho, consulta nem fragmento.
 */
export function resolveOrigin(base: string): string {
  return new URL(base).origin;
}

/** Origem da configuração ativa, já resolvida a partir da base efetiva. */
export function resolveConfigOrigin(config: AiProviderConfig): string {
  return resolveOrigin(resolveApiBase(config));
}

/**
 * Dados informados pela área de provedores. `credential` ausente significa campo intocado: a
 * credencial já gravada é preservada.
 */
export interface AiProviderConfigDraft {
  provider: AiProvider;
  apiBase?: string | undefined;
  credential?: string | undefined;
  model: string;
}

export type AiConfigField = 'apiBase' | 'credential' | 'model';

export type AiConfigFieldErrors = Partial<Record<AiConfigField, string>>;

export type BuildAiProviderConfigResult =
  | { ok: true; config: AiProviderConfig }
  | { ok: false; errors: AiConfigFieldErrors };

const BASE_FAILURE_MESSAGES: Record<AiBaseFailure, string> = {
  REQUIRED: 'Informe a base da API do provedor.',
  MALFORMED: 'Informe um endereço absoluto, como https://gateway.exemplo/v1.',
  INSECURE_SCHEME:
    'Endereços remotos exigem https. Apenas localhost, 127.0.0.1 e [::1] admitem http.',
  EMBEDDED_CREDENTIALS: 'Credenciais não podem ser embutidas no endereço.',
  QUERY_OR_FRAGMENT:
    'O endereço não pode ter parâmetros nem fragmento: a chave não deve viajar no endereço.',
};

export function baseFailureMessage(reason: AiBaseFailure): string {
  return BASE_FAILURE_MESSAGES[reason];
}

/**
 * Monta a configuração a gravar a partir do que o usuário informou, preservando a credencial
 * existente quando o campo não foi tocado. Recusa sem produzir configuração quando algum campo
 * obrigatório falta ou a base é inválida.
 */
export function buildAiProviderConfig(
  draft: AiProviderConfigDraft,
  existing?: AiProviderConfig,
): BuildAiProviderConfigResult {
  const errors: AiConfigFieldErrors = {};

  const typed = draft.credential?.trim() ?? '';
  const credential = typed === '' ? (existing?.credential ?? '') : typed;

  if (credential === '') {
    errors.credential = 'Informe a credencial do provedor.';
  }

  const model = draft.model.trim();

  if (model === '') {
    errors.model = 'Informe o modelo a ser usado.';
  }

  let apiBase: string | undefined;

  if (draft.provider === 'CUSTOM') {
    const validated = validateApiBase(draft.apiBase ?? '');

    if (validated.ok) {
      apiBase = validated.base;
    } else {
      errors.apiBase = baseFailureMessage(validated.reason);
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  if (draft.provider === 'CUSTOM') {
    return { ok: true, config: { provider: 'CUSTOM', apiBase: apiBase!, credential, model } };
  }

  return { ok: true, config: { provider: draft.provider, credential, model } };
}
