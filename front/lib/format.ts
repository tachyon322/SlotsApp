// Форматирование сумм и русских числительных для страниц хаба.

export function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')} ₽`;
}

export function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

/** Короткая запись больших чисел для прогресса: 6200 → «6.2K». */
export function formatShort(n: number): string {
  if (n < 1000) return String(n);
  return `${Number((n / 1000).toFixed(1))}K`;
}
