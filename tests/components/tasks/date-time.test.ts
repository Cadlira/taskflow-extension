import { describe, expect, it } from 'vitest';
import {
  fromLocalDateTimeInput,
  INVALID_DATE_INPUT,
  toLocalDateTimeInput,
} from '@/components/tasks/date-time';

describe('conversão de data e hora local', () => {
  it('converte data local digitada para UTC e reapresenta a mesma data e hora local', () => {
    const iso = fromLocalDateTimeInput('2026-09-14T09:30');

    expect(iso).toBe(new Date(2026, 8, 14, 9, 30).toISOString());
    expect(iso).toMatch(/Z$/);
    expect(toLocalDateTimeInput(iso)).toBe('2026-09-14T09:30');
  });

  it('trata valor vazio como ausência de prazo', () => {
    expect(fromLocalDateTimeInput('  ')).toBeUndefined();
    expect(toLocalDateTimeInput(undefined)).toBe('');
  });

  it.each(['2026-02-30T10:00', '2026-13-01T10:00', '14/09/2026 10:00', '2026-09-14T25:00'])(
    'sinaliza data inválida %s',
    (value) => {
      expect(fromLocalDateTimeInput(value)).toBe(INVALID_DATE_INPUT);
    },
  );

  it('ignora instante persistido inválido ao preencher o campo', () => {
    expect(toLocalDateTimeInput('ontem')).toBe('');
  });
});
