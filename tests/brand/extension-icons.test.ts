import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');

const iconSvg = readFileSync(join(root, 'docs', 'brand', 'taskflow-icon.svg'), 'utf8');
const glyphSvg = readFileSync(join(root, 'docs', 'brand', 'taskflow-glyph.svg'), 'utf8');

function element(svg: string, name: string): string {
  const match = svg.match(new RegExp(`<${name}\\b[^>]*>`));
  expect(match, `elemento <${name}> não encontrado`).not.toBeNull();
  return match?.[0] ?? '';
}

function attribute(tag: string, name: string): string | undefined {
  return new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1];
}

function elementCount(svg: string, name: string): number {
  return (svg.match(new RegExp(`<${name}\\b`, 'g')) ?? []).length;
}

describe('mestres vetoriais da marca', () => {
  it('ícone mestre ocupa a grade 24 com o quadrado aprovado', () => {
    expect(attribute(element(iconSvg, 'svg'), 'viewBox')).toBe('0 0 24 24');
    expect(attribute(element(iconSvg, 'svg'), 'width')).toBe('24');
    expect(attribute(element(iconSvg, 'svg'), 'height')).toBe('24');

    const rect = element(iconSvg, 'rect');
    expect(attribute(rect, 'x') ?? '0').toBe('0');
    expect(attribute(rect, 'y') ?? '0').toBe('0');
    expect(attribute(rect, 'width')).toBe('24');
    expect(attribute(rect, 'height')).toBe('24');
    expect(attribute(rect, 'rx')).toBe('5.6');
    expect(attribute(rect, 'fill')).toBe('#5368e8');
  });

  it('glifo mantém a grade 24 e não tem quadrado de fundo', () => {
    expect(attribute(element(glyphSvg, 'svg'), 'viewBox')).toBe('0 0 24 24');
    expect(attribute(element(glyphSvg, 'svg'), 'width')).toBe('24');
    expect(attribute(element(glyphSvg, 'svg'), 'height')).toBe('24');
    expect(glyphSvg).not.toMatch(/<rect\b/);
  });

  it('cada mestre tem um único traço sem preenchimento e com pontas arredondadas', () => {
    for (const svg of [iconSvg, glyphSvg]) {
      expect(elementCount(svg, 'path')).toBe(1);
      const path = element(svg, 'path');
      expect(attribute(path, 'fill')).toBe('none');
      expect(attribute(path, 'stroke-width')).toBe('3');
      expect(attribute(path, 'stroke-linecap')).toBe('round');
      expect(attribute(path, 'stroke-linejoin')).toBe('round');
    }
  });

  it('usa branco no ícone e currentColor no glifo', () => {
    expect(attribute(element(iconSvg, 'path'), 'stroke')).toBe('#ffffff');
    expect(attribute(element(glyphSvg, 'path'), 'stroke')).toBe('currentColor');
  });

  it('compartilha exatamente o mesmo traço entre os mestres', () => {
    const iconPath = attribute(element(iconSvg, 'path'), 'd');
    const glyphPath = attribute(element(glyphSvg, 'path'), 'd');
    expect(iconPath).toBeTruthy();
    expect(glyphPath).toBe(iconPath);
  });

  it('não contém efeitos nem elementos proibidos', () => {
    for (const svg of [iconSvg, glyphSvg]) {
      for (const forbidden of [
        'linearGradient',
        'radialGradient',
        'filter',
        'mask',
        'image',
        'text',
      ]) {
        expect(svg, `elemento <${forbidden}> no mestre`).not.toMatch(
          new RegExp(`<${forbidden}\\b`),
        );
      }
      expect(svg).not.toContain('#3549c7');
    }
  });
});

function channel(hex: string, offset: number): number {
  const value = Number.parseInt(hex.slice(1 + offset, 3 + offset), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 2) + 0.0722 * channel(hex, 4);
}

function contrastRatio(a: string, b: string): number {
  const luminanceA = relativeLuminance(a);
  const luminanceB = relativeLuminance(b);
  return (Math.max(luminanceA, luminanceB) + 0.05) / (Math.min(luminanceA, luminanceB) + 0.05);
}

describe('contraste da marca pela WCAG', () => {
  const documentedPairs: Array<{ description: string; foreground: string; background: string }> = [
    { description: 'quadrado contra fundo claro', foreground: '#5368e8', background: '#ffffff' },
    { description: 'quadrado contra barra escura', foreground: '#5368e8', background: '#202124' },
    { description: 'traço branco sobre o quadrado', foreground: '#ffffff', background: '#5368e8' },
    { description: 'glifo sobre fundo claro', foreground: '#5368e8', background: '#ffffff' },
    { description: 'glifo sobre fundo escuro', foreground: '#aeb9ff', background: '#202124' },
  ];

  it('mantém pelo menos 3:1 nos pares documentados', () => {
    for (const { description, foreground, background } of documentedPairs) {
      expect(contrastRatio(foreground, background), description).toBeGreaterThanOrEqual(3);
    }
  });

  it('documenta por que #3549c7 é proibido no quadrado', () => {
    expect(contrastRatio('#3549c7', '#202124')).toBeLessThan(3);
  });
});

interface RasterImage {
  width: number;
  height: number;
  pixels: Uint8Array;
}

const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const distanceLeft = Math.abs(estimate - left);
  const distanceUp = Math.abs(estimate - up);
  const distanceUpLeft = Math.abs(estimate - upLeft);
  if (distanceLeft <= distanceUp && distanceLeft <= distanceUpLeft) return left;
  if (distanceUp <= distanceUpLeft) return up;
  return upLeft;
}

function readPng(path: string): RasterImage {
  const buffer = readFileSync(path);
  if (!buffer.subarray(0, 8).equals(pngSignature)) {
    throw new Error(`${path}: assinatura PNG inválida`);
  }

  let offset = 8;
  const dataChunks: Buffer[] = [];
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
      interlace = data[12] ?? 0;
    } else if (type === 'IDAT') {
      dataChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += length + 12;
  }

  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(
      `${path}: o PNG deve ser RGBA de 8 bits sem entrelaçamento ` +
        `(profundidade=${bitDepth}, tipo de cor=${colorType}, entrelaçamento=${interlace})`,
    );
  }

  const raw = inflateSync(Buffer.concat(dataChunks));
  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    if (filter === undefined) throw new Error(`${path}: dados PNG truncados`);
    const row = raw.subarray(y * (stride + 1) + 1, y * (stride + 1) + 1 + stride);
    const current = pixels.subarray(y * stride, (y + 1) * stride);
    const previous = y === 0 ? undefined : pixels.subarray((y - 1) * stride, y * stride);
    for (let index = 0; index < stride; index += 1) {
      const value = row[index] ?? 0;
      const left = index >= bytesPerPixel ? (current[index - bytesPerPixel] ?? 0) : 0;
      const up = previous?.[index] ?? 0;
      const upLeft = index >= bytesPerPixel ? (previous?.[index - bytesPerPixel] ?? 0) : 0;
      let decoded: number;
      switch (filter) {
        case 0:
          decoded = value;
          break;
        case 1:
          decoded = value + left;
          break;
        case 2:
          decoded = value + up;
          break;
        case 3:
          decoded = value + ((left + up) >> 1);
          break;
        case 4:
          decoded = value + paethPredictor(left, up, upLeft);
          break;
        default:
          throw new Error(`${path}: filtro PNG desconhecido (${filter})`);
      }
      current[index] = decoded & 0xff;
    }
  }

  return { width, height, pixels };
}

function alphaAt(image: RasterImage, x: number, y: number): number {
  return image.pixels[(y * image.width + x) * 4 + 3] ?? 0;
}

const iconSizes = [16, 32, 48, 128] as const;

function iconPath(size: number): string {
  return join(root, 'public', 'icon', `${size}.png`);
}

describe('PNGs exigidos pelo Chrome', () => {
  it.each(iconSizes)('%i.png é um PNG RGBA de 8 bits com dimensões exatas', (size) => {
    const image = readPng(iconPath(size));
    expect(image.width).toBe(size);
    expect(image.height).toBe(size);
  });

  it.each([16, 32, 48] as const)('%i.png ocupa o quadro inteiro, com bordas opacas', (size) => {
    const image = readPng(iconPath(size));
    const centers = [Math.floor(size / 2), Math.ceil(size / 2) - 1];
    for (const index of centers) {
      expect(alphaAt(image, index, 0), `topo de ${size}.png em x=${index}`).toBe(255);
      expect(alphaAt(image, index, size - 1), `base de ${size}.png em x=${index}`).toBe(255);
      expect(alphaAt(image, 0, index), `esquerda de ${size}.png em y=${index}`).toBe(255);
      expect(alphaAt(image, size - 1, index), `direita de ${size}.png em y=${index}`).toBe(255);
    }
  });

  it('128.png tem 16 px transparentes em cada lado e arte de 96 com bordas opacas', () => {
    const image = readPng(iconPath(128));
    for (let offset = 0; offset < 16; offset += 1) {
      for (let index = 0; index < 128; index += 1) {
        expect(alphaAt(image, index, offset), `margem superior em (${index}, ${offset})`).toBe(0);
        expect(
          alphaAt(image, index, 127 - offset),
          `margem inferior em (${index}, ${offset})`,
        ).toBe(0);
        expect(alphaAt(image, offset, index), `margem esquerda em (${offset}, ${index})`).toBe(0);
        expect(alphaAt(image, 127 - offset, index), `margem direita em (${offset}, ${index})`).toBe(
          0,
        );
      }
    }

    const centers = [16 + Math.floor(96 / 2), 16 + Math.ceil(96 / 2) - 1];
    for (const index of centers) {
      expect(alphaAt(image, index, 16), `topo da arte em x=${index}`).toBe(255);
      expect(alphaAt(image, index, 111), `base da arte em x=${index}`).toBe(255);
      expect(alphaAt(image, 16, index), `esquerda da arte em y=${index}`).toBe(255);
      expect(alphaAt(image, 111, index), `direita da arte em y=${index}`).toBe(255);
    }
  });
});

describe('asset antigo removido', () => {
  it('não existe public/reminder-icon.png', () => {
    expect(existsSync(join(root, 'public', 'reminder-icon.png'))).toBe(false);
  });
});
