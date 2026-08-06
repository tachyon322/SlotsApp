// Провeряемо-честный движок раунда Crash.
// Краш-точка считается из seed'а раунда ещё до старта (хотя игроку не показывается).
// Рост множителя во времени — экспоненциальный.

/** Генерация seed раунда (32 случайных байта -> hex). */
export function generateSeed(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** House edge — доля «преимущества заведения», учитывается в CDF. */
const HOUSE_EDGE = 1.9;
/** 1/33 -> ~3% раундов мгновенно крашатся на 1.00× (конвенция bustabit). */
const INSTANT_CRASH_DIV = 33;
const TWO_52 = Math.pow(2, 52);

/**
 * Вычисляет точку краша из hex-seed по провeряемо-честному алгоритму bustabit.
 * Берём первые 13 hex-символов (52 бита) как большое случайное целое (в пределах Number.MAX_SAFE_INTEGER).
 */
export function computeCrashPoint(seed: string): number {
  const hex = seed.replace(/^0x/i, "").slice(0, 13).padStart(13, "0");
  const h = parseInt(hex, 16) % TWO_52;
  if (h % INSTANT_CRASH_DIV === 0) return 1;

  // P(crash >= m) = HOUSE_EDGE / m  ⇒  crash = HOUSE_EDGE / (1 - U), U = h / 2^52
  const u = h / TWO_52;
  const point = HOUSE_EDGE / (1 - u);
  return Math.max(1, Math.floor(point * 100) / 100);
}

/**
 * Степенная кривая с насыщением и плавным стартом: m(t) = 1 + A*((1+t)^p - 1), 0 < p < 1.
 * Производная A*p*(1+t)^(p-1) конечна на старте (нет мгновенного рывка)
 * и убывает → рост замедляется. Сдвиг (1+t) гарантирует, что 1→2 не «выстреливает» за секунду.
 * При A=0.45, p=0.85: 2× ≈ 3.0с, 3× ≈ 6.4с, 5× ≈ 13.8с, 10× ≈ 35с.
 */
export const GROWTH_A = 0.15;
export const GROWTH_P = 0.85;

/** Множитель из прошедшего времени (секунды). */
export function multiplierFromTime(seconds: number): number {
  if (seconds <= 0) return 1;
  return 1 + GROWTH_A * (Math.pow(1 + seconds, GROWTH_P) - 1);
}

/** Время (секунды), за которое множитель достигнет m. */
export function timeFromMultiplier(m: number): number {
  if (m <= 1) return 0;
  return Math.pow(1 + (m - 1) / GROWTH_A, 1 / GROWTH_P) - 1;
}

export type Tier = "low" | "mid" | "high";

/** Категория множителя для цвета чипа/кривой. */
export function tier(m: number): Tier {
  if (m < 2) return "low";
  if (m < 10) return "mid";
  return "high";
}

/** Тепловая шкала 1..3 для множителя (data-heat в макете). */
export function heat(m: number): 1 | 2 | 3 {
  if (m < 2) return 1;
  if (m < 10) return 2;
  return 3;
}

/** Формат множителя как «13.19×». */
export function formatMultiplier(m: number): string {
  return `${m.toFixed(2)}×`;
}

/** Сумма как «4 002,66 ₽» через ru-RU. */
export function formatRub(amount: number): string {
  return `${Math.round(amount).toLocaleString("ru-RU")} ₽`;
}