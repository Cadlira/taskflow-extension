const LOCAL_INPUT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

/** Valor enviado ao domínio quando a data digitada não representa um instante válido. */
export const INVALID_DATE_INPUT = 'data-invalida';

const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** Converte um instante UTC para o valor de `<input type="datetime-local">` no fuso local. */
export function toLocalDateTimeInput(iso: string | undefined): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** Converte data e hora locais digitadas para ISO 8601 UTC. Retorna `undefined` se vazio. */
export function fromLocalDateTimeInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const match = LOCAL_INPUT_PATTERN.exec(trimmed);
  if (!match) {
    return INVALID_DATE_INPUT;
  }

  const [year, month, day, hours, minutes] = match.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
  ];
  const date = new Date(year, month - 1, day, hours, minutes);

  const matchesInput =
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hours &&
    date.getMinutes() === minutes;

  return matchesInput ? date.toISOString() : INVALID_DATE_INPUT;
}

export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}
