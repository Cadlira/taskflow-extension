import { describe, expect, it } from 'vitest';
import {
  buildPageCaptureDraft,
  buildSelectionCaptureDraft,
  isPendingCaptureValid,
  normalizeCaptureText,
  truncateWithEllipsis,
  PENDING_CAPTURE_TTL_MS,
  type CapturedDraft,
  type PendingCapture,
} from '@/domain/page-capture';
import { validateTaskDraft } from '@/domain/task-draft';

describe('normalizeCaptureText', () => {
  it('colapsa espaços e quebras de linha e remove as extremidades', () => {
    expect(normalizeCaptureText('  Revisar\n contrato   de locação ')).toBe(
      'Revisar contrato de locação',
    );
  });

  it('colapsa tabulações e múltiplas quebras', () => {
    expect(normalizeCaptureText('\n\tChamado 4521\r\n\r\nPortal\t ')).toBe('Chamado 4521 Portal');
  });

  it('devolve texto vazio quando só há espaços em branco', () => {
    expect(normalizeCaptureText(' \n\t ')).toBe('');
  });
});

describe('truncateWithEllipsis', () => {
  it('mantém o texto intacto quando está no limite exato', () => {
    const text = 'a'.repeat(200);

    const result = truncateWithEllipsis(text, 200);

    expect(result).toBe(text);
    expect(result).not.toContain('…');
  });

  it('corta em 199 unidades e acrescenta "…" para resultado de exatamente 200', () => {
    const text = 'a'.repeat(205);

    const result = truncateWithEllipsis(text, 200);

    expect(result).toBe(`${'a'.repeat(199)}…`);
    expect(result).toHaveLength(200);
  });

  it('produz exatamente 4.000 unidades no limite da descrição', () => {
    const text = 'b'.repeat(4100);

    const result = truncateWithEllipsis(text, 4000);

    expect(result).toHaveLength(4000);
    expect(result.endsWith('…')).toBe(true);
  });

  it('recua uma unidade quando o corte cairia entre um par substituto', () => {
    const text = `${'a'.repeat(198)}😀${'b'.repeat(5)}`;

    const result = truncateWithEllipsis(text, 200);

    expect(result).toBe(`${'a'.repeat(198)}…`);
    expect(result).toHaveLength(199);
    expect([...result].at(-1)).toBe('…');
    expect(result).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
    expect(result).not.toMatch(/(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
  });
});

describe('buildPageCaptureDraft', () => {
  it('mantém o título normalizado e a URL http como origem', () => {
    expect(
      buildPageCaptureDraft({ title: '  Chamado 4521 – Portal ', url: 'https://portal.exemplo' }),
    ).toEqual({
      title: 'Chamado 4521 – Portal',
      sourceUrl: 'https://portal.exemplo',
    });
  });

  it('reduz título de página com 240 caracteres a exatamente 200 terminando em "…"', () => {
    const draft = buildPageCaptureDraft({ title: 'c'.repeat(240), url: 'https://exemplo.com' });

    expect(draft.title).toHaveLength(200);
    expect(draft.title.endsWith('…')).toBe(true);
  });

  it('mantém o título vazio quando a página não tem título', () => {
    expect(buildPageCaptureDraft({ title: '   ', url: 'https://exemplo.com' })).toEqual({
      title: '',
      sourceUrl: 'https://exemplo.com',
    });
  });

  it.each(['chrome://extensions', 'file:///C:/documento.pdf', 'ftp://exemplo.com'])(
    'omite a URL de origem quando usa %s',
    (url) => {
      expect(buildPageCaptureDraft({ title: 'Página', url })).toEqual({ title: 'Página' });
    },
  );

  it('omite a URL de origem quando a aba não informa URL', () => {
    expect(buildPageCaptureDraft({ title: 'Página' })).toEqual({ title: 'Página' });
  });
});

describe('buildSelectionCaptureDraft', () => {
  it('seleção curta vira somente título normalizado', () => {
    expect(
      buildSelectionCaptureDraft({
        selectionText: '  Revisar\n contrato   de locação ',
        pageUrl: 'https://exemplo.com',
      }),
    ).toEqual({
      title: 'Revisar contrato de locação',
      sourceUrl: 'https://exemplo.com',
    });
  });

  it('seleção de 650 caracteres gera título de 200 e descrição completa sem extremos', () => {
    const selectionText = `  ${'d'.repeat(650)}  `;

    const draft = buildSelectionCaptureDraft({ selectionText, pageUrl: 'https://exemplo.com' });

    expect(draft.title).toBe(`${'d'.repeat(199)}…`);
    expect(draft.title).toHaveLength(200);
    expect(draft.description).toBe('d'.repeat(650));
  });

  it('seleção de 6.000 caracteres gera descrição de exatamente 4.000 terminando em "…"', () => {
    const draft = buildSelectionCaptureDraft({ selectionText: 'e'.repeat(6000) });

    expect(draft.description).toHaveLength(4000);
    expect(draft.description).toBe(`${'e'.repeat(3999)}…`);
    expect(draft.title).toHaveLength(200);
  });

  it('omite a descrição quando a seleção cabe no título', () => {
    expect(buildSelectionCaptureDraft({ selectionText: 'Curta' })).toEqual({ title: 'Curta' });
  });

  it('omite URL de origem não http quando informada pelo menu', () => {
    expect(
      buildSelectionCaptureDraft({ selectionText: 'Texto', pageUrl: 'chrome://extensions' }),
    ).toEqual({ title: 'Texto' });
  });

  it('aceita todo rascunho com título não vazio nas validações da tarefa', () => {
    const drafts: CapturedDraft[] = [
      buildPageCaptureDraft({ title: 'Página', url: 'https://exemplo.com' }),
      buildPageCaptureDraft({ title: 'f'.repeat(240) }),
      buildSelectionCaptureDraft({ selectionText: 'Seleção curta' }),
      buildSelectionCaptureDraft({ selectionText: 'g'.repeat(650), pageUrl: 'https://exemplo.com' }),
      buildSelectionCaptureDraft({ selectionText: 'h'.repeat(6000), pageUrl: 'file:///x' }),
    ];

    for (const draft of drafts) {
      expect(draft.title).not.toBe('');
      expect(validateTaskDraft(draft).ok, draft.title).toBe(true);
    }
  });
});

describe('isPendingCaptureValid', () => {
  const now = new Date('2026-09-14T12:00:00.000Z');

  function captureAt(capturedAt: string): PendingCapture {
    return { version: 1, id: 'capture-1', kind: 'page', capturedAt, draft: { title: 'Página' } };
  }

  function invalidAt(elapsedMs: number): string {
    return new Date(now.getTime() - elapsedMs).toISOString();
  }

  it('é válida a 9 minutos e 59 segundos', () => {
    expect(isPendingCaptureValid(captureAt(invalidAt(PENDING_CAPTURE_TTL_MS - 1000)), now)).toBe(
      true,
    );
  });

  it('é válida no limite exato de 10 minutos', () => {
    expect(isPendingCaptureValid(captureAt(invalidAt(PENDING_CAPTURE_TTL_MS)), now)).toBe(true);
  });

  it('está expirada a 10 minutos e 1 segundo', () => {
    expect(isPendingCaptureValid(captureAt(invalidAt(PENDING_CAPTURE_TTL_MS + 1000)), now)).toBe(
      false,
    );
  });

  it('é inválida quando o acionamento está 2 minutos no futuro', () => {
    expect(isPendingCaptureValid(captureAt(invalidAt(-2 * 60 * 1000)), now)).toBe(false);
  });

  it('é inválida quando o instante capturado é malformado', () => {
    expect(isPendingCaptureValid(captureAt('ontem'), now)).toBe(false);
  });
});
