/**
 * Москва живёт в фиксированном UTC+3 (в РФ нет перехода на летнее время
 * с 2014 года). Все границы «суток» в проекте считаем явно по Москве,
 * не полагаясь на часовой пояс окружения (контейнеры по умолчанию в UTC).
 */

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Тот же момент времени, но со «сдвинутыми» UTC-компонентами = МСК-компоненты. */
function shifted(d: Date): Date {
  return new Date(d.getTime() + MSK_OFFSET_MS);
}

/** 00:00 МСК для момента времени d. */
export function startOfMskDay(d: Date): Date {
  const s = shifted(d);
  const utcStart = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate());
  return new Date(utcStart - MSK_OFFSET_MS);
}

/** 23:59:59.999 МСК для момента времени d. */
export function endOfMskDay(d: Date): Date {
  return new Date(startOfMskDay(d).getTime() + DAY_MS - 1);
}

/** 00:00 МСК n дней назад от текущего момента. */
export function mskDaysAgo(n: number): Date {
  const now = new Date();
  const d = new Date(now.getTime() - n * DAY_MS);
  return startOfMskDay(d);
}

/** Ключ дня «YYYY-MM-DD» в московском времени. */
export function mskDateKey(d: Date): string {
  const s = shifted(d);
  const y = s.getUTCFullYear();
  const m = String(s.getUTCMonth() + 1).padStart(2, "0");
  const day = String(s.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
