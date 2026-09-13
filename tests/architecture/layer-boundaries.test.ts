import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : path.endsWith('.ts') ? [path] : [];
  });
}

const FORBIDDEN = [
  { label: 'Vue', pattern: /from ['"]vue['"]/ },
  { label: 'Pinia', pattern: /from ['"]pinia['"]/ },
  { label: 'WXT', pattern: /from ['"](wxt|#imports)[^'"]*['"]/ },
  { label: 'infraestrutura', pattern: /from ['"]@\/(infrastructure|components|entrypoints)/ },
  { label: 'API Chrome', pattern: /\b(browser|chrome)\.[a-zA-Z]/ },
];

describe.each(['domain', 'application'])('camada %s', (layer) => {
  it('não depende de Vue, Pinia, WXT, infraestrutura nem APIs Chrome', () => {
    const violations = sourceFiles(join(root, 'src', layer)).flatMap((file) => {
      const content = readFileSync(file, 'utf8');
      return FORBIDDEN.filter(({ pattern }) => pattern.test(content)).map(
        ({ label }) => `${relative(root, file)} → ${label}`,
      );
    });

    expect(violations).toEqual([]);
  });
});
