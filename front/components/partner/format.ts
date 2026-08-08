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

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
