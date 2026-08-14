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

export const USDT_RATE_DEFAULT = 90;
const USDT_RATE_KEY = "affiliate:usdt_rate";

export async function getUsdtRate(): Promise<number> {
  try {
    const raw = await redis.get(USDT_RATE_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
  } catch (err) {
    console.warn("[Config] Redis read error, using default USDT rate:", err);
  }
  return USDT_RATE_DEFAULT;
}

export async function setUsdtRate(value: number): Promise<void> {
  await redis.set(USDT_RATE_KEY, String(Number(value)));
}

export const SBP_FEE_FLAT_DEFAULT = 0;
const SBP_FEE_FLAT_KEY = "affiliate:sbp_fee_flat";

export async function getSbpFeeFlat(): Promise<number> {
  try {
    const raw = await redis.get(SBP_FEE_FLAT_KEY);
    if (raw !== null) {
      const parsed = Math.floor(Number(raw));
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  } catch (err) {
    console.warn("[Config] Redis read error, using default SBP flat fee:", err);
  }
  return SBP_FEE_FLAT_DEFAULT;
}

export async function setSbpFeeFlat(value: number): Promise<void> {
  await redis.set(SBP_FEE_FLAT_KEY, String(Math.floor(value)));
}

export const SBP_FEE_PERCENT_DEFAULT = 0;
const SBP_FEE_PERCENT_KEY = "affiliate:sbp_fee_percent";

export async function getSbpFeePercent(): Promise<number> {
  try {
    const raw = await redis.get(SBP_FEE_PERCENT_KEY);
    if (raw !== null) {
      const parsed = Number(raw);
      if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 100) return parsed;
    }
  } catch (err) {
    console.warn("[Config] Redis read error, using default SBP percent fee:", err);
  }
  return SBP_FEE_PERCENT_DEFAULT;
}

export async function setSbpFeePercent(value: number): Promise<void> {
  await redis.set(SBP_FEE_PERCENT_KEY, String(Number(value)));
}

export const MIN_WITHDRAW_DEFAULT = 5000;
const MIN_WITHDRAW_KEY = "affiliate:min_withdraw";

export async function getMinWithdraw(): Promise<number> {
  try {
    const raw = await redis.get(MIN_WITHDRAW_KEY);
    if (raw !== null) {
      const parsed = Math.floor(Number(raw));
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  } catch (err) {
    console.warn("[Config] Redis read error, using default min withdraw:", err);
  }
  return MIN_WITHDRAW_DEFAULT;
}

export async function setMinWithdraw(value: number): Promise<void> {
  await redis.set(MIN_WITHDRAW_KEY, String(Math.floor(value)));
}
