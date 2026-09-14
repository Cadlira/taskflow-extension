import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const baseCss = readFileSync(join(root, 'src', 'styles', 'base.css'), 'utf8');

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 2) + 0.0722 * channel(hex, 4);
}

function contrastRatio(foreground: string, background: string): number {
  const luminanceA = relativeLuminance(foreground);
  const luminanceB = relativeLuminance(background);
  return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05);
}

function declarations(body: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const match of body.matchAll(/([\w-]+)\s*:\s*([^;]+);/g)) {
    result.set(match[1]!, match[2]!.trim());
  }
  return result;
}

interface Rule {
  selector: string;
  declarations: Map<string, string>;
}

function rules(css: string): Rule[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)].flatMap((match) => {
    const selectors = match[1]!
      .split(',')
      .map((selector) => selector.trim().replace(/\s+/g, ' '))
      .filter((selector) => selector !== '' && selector !== ':root');
    const body = declarations(match[2]!);
    return selectors.map((selector) => ({ selector, declarations: body }));
  });
}

function vueFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return vueFiles(path);
    return entry.isFile() && entry.name.endsWith('.vue') ? [path] : [];
  });
}

/** Regras de `src/styles/*.css` e dos blocos `<style>` dos `.vue` de `src/`. */
const sourceRules: Rule[] = [
  ...rules(baseCss),
  ...vueFiles(join(root, 'src')).flatMap((file) =>
    [...readFileSync(file, 'utf8').matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].flatMap((match) =>
      rules(match[1]!),
    ),
  ),
];

function ruleDeclaration(selector: string, property: string): string {
  const rule = sourceRules.find((candidate) => candidate.selector === selector);
  const value = rule?.declarations.get(property);
  if (value === undefined) {
    throw new Error(`Declaração ${property} não encontrada na regra ${selector}`);
  }
  return resolve(value);
}

const rootBlock = /:root\s*\{([^}]*)\}/.exec(baseCss)?.[1];
if (!rootBlock) throw new Error('Bloco :root não encontrado em base.css');

const tokens = new Map<string, string>();
for (const match of rootBlock.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
  tokens.set(`--${match[1]}`, match[2]!.trim());
}

function resolve(value: string): string {
  let resolved = value;
  while (resolved.includes('var(')) {
    const next = resolved.replace(/var\((--[\w-]+)\)/g, (_match, name: string) => {
      const token = tokens.get(name);
      if (!token) throw new Error(`Token ${name} não encontrado em base.css`);
      return token;
    });
    if (next === resolved) throw new Error(`Valor não resolvido: ${value}`);
    resolved = next;
  }
  return resolved;
}

interface ContrastPair {
  description: string;
  foreground: string;
  background: string;
}

describe('contraste dos tokens', () => {
  const textPairs: ContrastPair[] = [];

  for (const foreground of [
    '--color-ink',
    '--color-muted',
    '--color-danger',
    '--color-primary-strong',
  ]) {
    for (const background of ['--color-surface', '--color-page']) {
      textPairs.push({
        description: `${foreground} sobre ${background}`,
        foreground: resolve(`var(${foreground})`),
        background: resolve(`var(${background})`),
      });
    }
  }

  textPairs.push(
    {
      description: 'branco sobre --color-primary',
      foreground: '#ffffff',
      background: resolve('var(--color-primary)'),
    },
    {
      description: 'branco sobre --color-danger',
      foreground: '#ffffff',
      background: resolve('var(--color-danger)'),
    },
    {
      description: '--color-primary-strong sobre --color-primary-soft',
      foreground: resolve('var(--color-primary-strong)'),
      background: resolve('var(--color-primary-soft)'),
    },
    {
      description: 'feedback de sucesso',
      foreground: ruleDeclaration('.feedback-success', 'color'),
      background: ruleDeclaration('.feedback-success', 'background'),
    },
    {
      description: 'feedback de aviso',
      foreground: ruleDeclaration('.feedback-warning', 'color'),
      background: ruleDeclaration('.feedback-warning', 'background'),
    },
    {
      description: 'feedback de erro',
      foreground: ruleDeclaration('.feedback-error', 'color'),
      background: ruleDeclaration('.feedback-error', 'background'),
    },
    {
      description: 'selo de tarefa atrasada',
      foreground: ruleDeclaration('.badge-overdue', 'color'),
      background: ruleDeclaration('.badge-overdue', 'background'),
    },
    {
      description: 'selo de prazo próximo',
      foreground: ruleDeclaration('.badge-due_soon', 'color'),
      background: ruleDeclaration('.badge-due_soon', 'background'),
    },
  );

  it.each(textPairs)('mantém pelo menos 4,5:1 em $description', ({ foreground, background }) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(4.5);
  });

  const indicatorPairs: ContrastPair[] = [];

  for (const indicator of ['--color-focus-ring', '--color-control-border']) {
    for (const background of ['--color-surface', '--color-page']) {
      indicatorPairs.push({
        description: `${indicator} sobre ${background}`,
        foreground: resolve(`var(${indicator})`),
        background: resolve(`var(${background})`),
      });
    }
  }

  it.each(indicatorPairs)('mantém pelo menos 3:1 em $description', ({ foreground, background }) => {
    expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(3);
  });

  it('usa o anel de foco nas regras de outline do base.css', () => {
    const outlineValues = [...rules(baseCss)]
      .map((rule) => rule.declarations.get('outline'))
      .filter((value): value is string => value !== undefined);

    expect(outlineValues.length).toBeGreaterThanOrEqual(2);
    for (const value of outlineValues) {
      expect(value).toContain('var(--color-focus-ring)');
    }
  });

  it('não reduz a opacidade fora de :disabled ou [aria-disabled]', () => {
    const offenders = sourceRules
      .filter(
        (rule) =>
          rule.declarations.has('opacity') &&
          !rule.selector.includes(':disabled') &&
          !rule.selector.includes('aria-disabled'),
      )
      .map((rule) => rule.selector);

    expect(offenders).toEqual([]);
  });
});
