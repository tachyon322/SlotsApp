import { redis } from "./redis";

export const WELCOME_BONUS_DEFAULT = 8888;
const WELCOME_BONUS_KEY = "admin:welcome_bonus";

export async function getWelcomeBonus(): Promise<number> {
  try {
    const raw = await redis.get(WELCOME_BONUS_KEY);
    if (raw !== null) {
      const parsed = Math.floor(Number(raw));
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  } catch (err) {
    console.warn("[Config] Redis read error, using default welcome bonus:", err);
  }
  return WELCOME_BONUS_DEFAULT;
}

export async function setWelcomeBonus(value: number): Promise<void> {
  await redis.set(WELCOME_BONUS_KEY, String(Math.floor(value)));
}

export const MIN_DEPOSIT_DEFAULT = 0;
const MIN_DEPOSIT_KEY = "admin:min_deposit";

export async function getMinDeposit(): Promise<number> {
  try {
    const raw = await redis.get(MIN_DEPOSIT_KEY);
    if (raw !== null) {
      const parsed = Math.floor(Number(raw));
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  } catch (err) {
    console.warn("[Config] Redis read error, using default min deposit:", err);
  }
  return MIN_DEPOSIT_DEFAULT;
}

export async function setMinDeposit(value: number): Promise<void> {
  await redis.set(MIN_DEPOSIT_KEY, String(Math.floor(value)));
}
