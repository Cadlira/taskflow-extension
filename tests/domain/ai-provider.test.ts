import { describe, expect, it } from 'vitest';
import {
  ANTHROPIC_API_BASE,
  buildAiProviderConfig,
  isAiProvider,
  OPENAI_API_BASE,
  resolveApiBase,
  resolveConfigOrigin,
  resolveOrigin,
  validateApiBase,
  type AiProviderConfig,
} from '@/domain/ai-provider';

describe('provedores admitidos', () => {
  it('reconhece exatamente os três provedores', () => {
    expect(['OPENAI', 'ANTHROPIC', 'CUSTOM'].every(isAiProvider)).toBe(true);
    expect(isAiProvider('GEMINI')).toBe(false);
    expect(isAiProvider(undefined)).toBe(false);
  });

  it('usa a base fixa dos provedores oficiais e a informada apenas em CUSTOM', () => {
    expect(resolveApiBase({ provider: 'OPENAI', credential: 'k', model: 'm' })).toBe(
      OPENAI_API_BASE,
    );
    expect(resolveApiBase({ provider: 'ANTHROPIC', credential: 'k', model: 'm' })).toBe(
      ANTHROPIC_API_BASE,
    );
    expect(
      resolveApiBase({
        provider: 'CUSTOM',
        apiBase: 'http://localhost:11434/v1',
        credential: 'k',
        model: 'm',
      }),
    ).toBe('http://localhost:11434/v1');
  });

  it('não admite base informada para provedor oficial nem base ausente em CUSTOM', () => {
    const withBase: AiProviderConfig = {
      provider: 'OPENAI',
      // @ts-expect-error provedor oficial não carrega base: ela é constante da extensão.
      apiBase: 'https://proxy.exemplo/v1',
      credential: 'k',
      model: 'm',
    };
    // @ts-expect-error CUSTOM exige a base informada pelo usuário.
    const withoutBase: AiProviderConfig = { provider: 'CUSTOM', credential: 'k', model: 'm' };

    expect(withBase.provider).toBe('OPENAI');
    expect(withoutBase.provider).toBe('CUSTOM');
  });

  it('expõe as bases oficiais como constantes, sem caminho de escrita pelo tipo', () => {
    const official: AiProviderConfig = { provider: 'ANTHROPIC', credential: 'k', model: 'm' };

    // @ts-expect-error não existe campo de base a sobrescrever em um provedor oficial.
    official.apiBase = 'https://proxy.exemplo';

    expect(resolveApiBase({ provider: 'ANTHROPIC', credential: 'k', model: 'm' })).toBe(
      ANTHROPIC_API_BASE,
    );
  });
});

describe('validação da base informada', () => {
  it('aceita https em host remoto', () => {
    expect(validateApiBase('https://gateway.exemplo/v1')).toEqual({
      ok: true,
      base: 'https://gateway.exemplo/v1',
    });
  });

  it('aceita http em loopback, porque o tráfego não deixa o dispositivo', () => {
    expect(validateApiBase('http://localhost:11434/v1')).toEqual({
      ok: true,
      base: 'http://localhost:11434/v1',
    });
    expect(validateApiBase('http://127.0.0.1:1234/v1')).toEqual({
      ok: true,
      base: 'http://127.0.0.1:1234/v1',
    });
    expect(validateApiBase('http://[::1]:11434/v1')).toEqual({
      ok: true,
      base: 'http://[::1]:11434/v1',
    });
  });

  it('recusa base remota sem TLS', () => {
    expect(validateApiBase('http://gateway.exemplo/v1')).toEqual({
      ok: false,
      reason: 'INSECURE_SCHEME',
    });
  });

  it('recusa esquema que não seja http nem https', () => {
    expect(validateApiBase('ftp://gateway.exemplo/v1')).toEqual({
      ok: false,
      reason: 'INSECURE_SCHEME',
    });
  });

  it('recusa credenciais embutidas no endereço', () => {
    expect(validateApiBase('https://usuario:senha@gateway.exemplo/v1')).toEqual({
      ok: false,
      reason: 'EMBEDDED_CREDENTIALS',
    });
    expect(validateApiBase('https://usuario@gateway.exemplo/v1')).toEqual({
      ok: false,
      reason: 'EMBEDDED_CREDENTIALS',
    });
  });

  it('recusa cadeia de consulta e fragmento', () => {
    expect(validateApiBase('https://gateway.exemplo/v1?api_key=sk-abc')).toEqual({
      ok: false,
      reason: 'QUERY_OR_FRAGMENT',
    });
    expect(validateApiBase('https://gateway.exemplo/v1#chave')).toEqual({
      ok: false,
      reason: 'QUERY_OR_FRAGMENT',
    });
  });

  it('recusa endereço relativo ou malformado', () => {
    expect(validateApiBase('gateway.exemplo/v1')).toEqual({ ok: false, reason: 'MALFORMED' });
    expect(validateApiBase('/v1')).toEqual({ ok: false, reason: 'MALFORMED' });
  });

  it('recusa base vazia como campo obrigatório', () => {
    expect(validateApiBase('   ')).toEqual({ ok: false, reason: 'REQUIRED' });
  });

  it('admite caminho sob prefixo e descarta a barra final', () => {
    expect(validateApiBase('https://gateway.exemplo/ia/openai/v1/')).toEqual({
      ok: true,
      base: 'https://gateway.exemplo/ia/openai/v1',
    });
    expect(validateApiBase('https://gateway.exemplo/')).toEqual({
      ok: true,
      base: 'https://gateway.exemplo',
    });
  });
});

describe('resolução da origem', () => {
  it('resolve base com caminho e porta para a origem correta', () => {
    expect(resolveOrigin('http://localhost:11434/v1')).toBe('http://localhost:11434');
    expect(resolveOrigin('https://gateway.exemplo:8443/ia/v1')).toBe(
      'https://gateway.exemplo:8443',
    );
  });

  it('nunca inclui caminho, consulta ou fragmento na origem', () => {
    const origin = resolveOrigin('https://gateway.exemplo/ia/openai/v1');

    expect(origin).toBe('https://gateway.exemplo');
    expect(origin).not.toContain('/ia');
    expect(origin).not.toContain('?');
    expect(origin).not.toContain('#');
  });

  it('resolve a origem dos provedores oficiais a partir da base fixa', () => {
    expect(resolveConfigOrigin({ provider: 'OPENAI', credential: 'k', model: 'm' })).toBe(
      'https://api.openai.com',
    );
    expect(resolveConfigOrigin({ provider: 'ANTHROPIC', credential: 'k', model: 'm' })).toBe(
      'https://api.anthropic.com',
    );
  });
});

describe('montagem da configuração', () => {
  it('normaliza credencial e modelo removendo espaços nas extremidades', () => {
    const result = buildAiProviderConfig({
      provider: 'OPENAI',
      credential: '  sk-abc  ',
      model: ' gpt-4o-mini\n',
    });

    expect(result).toEqual({
      ok: true,
      config: { provider: 'OPENAI', credential: 'sk-abc', model: 'gpt-4o-mini' },
    });
  });

  it('recusa sem credencial quando não há nenhuma gravada', () => {
    const result = buildAiProviderConfig({ provider: 'OPENAI', credential: '  ', model: 'm' });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.credential).toBeTruthy();
    expect(result.ok === false && result.errors.model).toBeUndefined();
  });

  it('recusa sem modelo', () => {
    const result = buildAiProviderConfig({ provider: 'OPENAI', credential: 'sk-abc', model: ' ' });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.errors.model).toBeTruthy();
  });

  it('preserva a credencial gravada quando o campo não foi tocado', () => {
    const existing: AiProviderConfig = {
      provider: 'OPENAI',
      credential: 'sk-existente',
      model: 'gpt-4o-mini',
    };

    const result = buildAiProviderConfig({ provider: 'OPENAI', model: 'gpt-4o' }, existing);

    expect(result).toEqual({
      ok: true,
      config: { provider: 'OPENAI', credential: 'sk-existente', model: 'gpt-4o' },
    });
  });

  it('exige base válida em CUSTOM e recusa a inválida sem produzir configuração', () => {
    const missing = buildAiProviderConfig({
      provider: 'CUSTOM',
      apiBase: '',
      credential: 'sk-abc',
      model: 'm',
    });
    const insecure = buildAiProviderConfig({
      provider: 'CUSTOM',
      apiBase: 'http://gateway.exemplo/v1',
      credential: 'sk-abc',
      model: 'm',
    });

    expect(missing.ok).toBe(false);
    expect(missing.ok === false && missing.errors.apiBase).toBeTruthy();
    expect(insecure.ok).toBe(false);
    expect(insecure.ok === false && insecure.errors.apiBase).toContain('https');
  });

  it('ignora base informada quando o provedor é oficial', () => {
    const result = buildAiProviderConfig({
      provider: 'ANTHROPIC',
      apiBase: 'https://proxy.exemplo/v1',
      credential: 'sk-abc',
      model: 'claude-sonnet-4',
    });

    expect(result).toEqual({
      ok: true,
      config: { provider: 'ANTHROPIC', credential: 'sk-abc', model: 'claude-sonnet-4' },
    });
  });
});
