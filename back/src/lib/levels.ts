export const MAX_LEVEL = 1000;

export const ROUND_XP = 2;
export const WIN_XP = 8;

/**
 * XP required to advance from `level` to `level + 1`.
 * Curve: 100 * level^1.5 -> LVL1: 100, LVL7: 1852, LVL15: 5809.
 * NOTE: the same formula is mirrored inside the Lua script in
 * userCache.addXp (src/lib/userCache.ts) — keep both in sync.
 */
export function xpToNext(level: number): number {
  return Math.round(100 * Math.pow(Math.max(1, level), 1.5));
}

/**
 * Money (rubles) awarded when reaching `level`.
 * LVL15: 800 (matches the bonuses page design).
 * NOTE: mirrored in the Lua script in userCache.addXp — keep both in sync.
 */
export function levelReward(level: number): number {
  return 50 + 50 * Math.max(1, level);
}

/**
 * XP granted for a fixed amount of bonus money (1 XP per 10 rubles).
 */
export function xpForBonusMoney(amount: number): number {
  return Math.floor(amount / 10);
}
