const MSK_TIMEZONE = 'Europe/Moscow';

export function formatRub(amount: number): string {
  return `${Number(amount || 0).toLocaleString('ru-RU')}\u00A0₽`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: MSK_TIMEZONE,
    });
  } catch {
    return '';
  }
}

export function formatDay(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      timeZone: MSK_TIMEZONE,
    });
  } catch {
    return '';
  }
}

export function formatPercent(value: number | null): string {
  if (value === null || value === undefined) return '—';
  return `${value}%`;
}

export function shortCode(code: string): string {
  const trimmed = code.trim();
  return trimmed.length > 26 ? `${trimmed.slice(0, 24)}…` : trimmed;
}

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Сегодняшняя дата «YYYY-MM-DD» по московскому времени. */
export function todayStr(): string {
  return toInputDate(new Date());
}

/** Дата «YYYY-MM-DD» по московскому времени (не зависит от TZ сервера/браузера). */
export function toInputDate(d: Date): string {
  const shifted = new Date(d.getTime() + MSK_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Начало дня (00:00 МСК) из строки «YYYY-MM-DD». */
export function fromInputDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1) - MSK_OFFSET_MS);
}

export function addDays(d: Date, n: number): Date {
  return new Date(d.getTime() + n * 86_400_000);
}

export function formatDayShort(iso: string): string {
  try {
    const shifted = new Date(new Date(iso).getTime() + MSK_OFFSET_MS);
    const dd = String(shifted.getUTCDate()).padStart(2, '0');
    const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
    return `${dd}.${mm}`;
  } catch {
    return '';
  }
}
