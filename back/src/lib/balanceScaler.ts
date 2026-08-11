import { userCache } from './userCache';

// Регулятор выплат по балансу: чем выше баланс, тем ниже реальная выплата.
// Цель — держать балансы в разумных пределах (порядка ~50k ₽).
//
// Кривая масштаба (мягкий вариант):
//   0₽        -> 1.30   (сильно в плюс, баланс растёт)
//   49 999₽   -> 1.00   (примерно безубыточно)
//   50 000₽   -> 0.90   (в минус)
//   100 000₽+ -> 0.76   (в минус, флур)

export const BALANCE_TARGET = 50_000;
export const BALANCE_HIGH_SATURATION = 100_000;

export const SCALE_LOW = 1.3;
export const SCALE_AT_TARGET = 1.0;
export const SCALE_HIGH = 0.9;
export const SCALE_HIGH_FLOOR = 0.76;

// Жёсткий потолок выплаты за один раунд — защита от единичных выплат-миллионов.
export const MAX_PAYOUT_PER_ROUND = 100_000;

export function payoutScaleForBalance(balance: number): number {
  const b = Math.max(0, Math.floor(balance));

  if (b < BALANCE_TARGET) {
    const t = BALANCE_TARGET > 0 ? b / BALANCE_TARGET : 0;
    return SCALE_LOW + (SCALE_AT_TARGET - SCALE_LOW) * t;
  }

  const span = BALANCE_HIGH_SATURATION - BALANCE_TARGET;
  const t = span > 0 ? Math.min(1, (b - BALANCE_TARGET) / span) : 1;
  return Math.max(SCALE_HIGH_FLOOR, SCALE_HIGH + (SCALE_HIGH_FLOOR - SCALE_HIGH) * t);
}

export async function getBalanceScale(userId: string): Promise<number> {
  const profile = await userCache.getUserProfile(userId);
  return payoutScaleForBalance(profile?.balance ?? 0);
}

export async function scalePayout(
  userId: string,
  payout: number,
  options: { cap?: number } = {},
): Promise<{ payout: number; scale: number }> {
  if (payout <= 0) return { payout: 0, scale: 1 };

  const scale = await getBalanceScale(userId);
  let scaled = Math.floor(payout * scale);

  const cap = options.cap ?? MAX_PAYOUT_PER_ROUND;
  if (scaled > cap) scaled = cap;

  return { payout: scaled, scale };
}
