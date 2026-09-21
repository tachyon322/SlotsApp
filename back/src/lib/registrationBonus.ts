import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { bonusClaim } from "../db/schema";
import { redis } from "./redis";
import { achievementEngine } from "./achievementEngine";
import { userCache } from "./userCache";
import { getWelcomeBonus } from "./config";
import { affiliateService } from "../affiliate/service";

/**
 * Registration (welcome) bonus — the single code path shared by the one-click
 * (`/api/quick-auth`) and email signup flows. Before this existed only
 * one-click registrations were credited automatically: email signups had to
 * find the manual "welcome" task on the bonuses page, and the custom
 * partner/CashX registration bonus was never applied to them at all.
 */
export const WELCOME_BONUS_TYPE = "welcome";

const LOCK_TTL_SECONDS = 30;
const lockKey = (userId: string) => `bonus:registration:lock:${userId}`;

export interface RegistrationBonusResult {
  /** Whether this call actually credited the bonus. */
  granted: boolean;
  /** Credited amount (0 when nothing was credited). */
  amount: number;
  /** Balance after the operation. */
  balance: number;
}

/**
 * Resolve the registration bonus for the given tracking data: a custom bonus
 * configured on the CashX source (partner link / promo) overrides the standard
 * admin welcome bonus. Never throws — falls back to the admin value when
 * CashX is unreachable.
 */
export async function resolveRegistrationBonus(ref?: string, clickToken?: string): Promise<number> {
  try {
    const resolved =
      ref || clickToken ? await affiliateService.resolveRegistrationSource(ref, clickToken) : null;
    if (resolved?.bonus != null) return resolved.bonus;
  } catch (e) {
    console.warn("[RegistrationBonus] source lookup failed, using admin welcome bonus:", e);
  }
  return getWelcomeBonus();
}

async function hasDurableClaim(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: bonusClaim.id })
    .from(bonusClaim)
    .where(and(eq(bonusClaim.userId, userId), eq(bonusClaim.type, WELCOME_BONUS_TYPE)))
    .limit(1);
  return rows.length > 0;
}

async function recordDurableClaim(userId: string, amount: number): Promise<void> {
  await db
    .insert(bonusClaim)
    .values({
      id: crypto.randomUUID(),
      userId,
      type: WELCOME_BONUS_TYPE,
      amount: Math.floor(amount),
      createdAt: new Date(),
    })
    .onConflictDoNothing();
}

/**
 * Whether the registration bonus was already credited. Checks the durable
 * Postgres record first (survives Redis expiry) and falls back to the legacy
 * Redis marker written by the one-click flow.
 */
export async function isRegistrationBonusClaimed(userId: string): Promise<boolean> {
  try {
    if (await hasDurableClaim(userId)) return true;
  } catch (e) {
    console.warn("[RegistrationBonus] durable claim lookup failed:", e);
  }
  return achievementEngine.isBonusClaimed(userId, WELCOME_BONUS_TYPE);
}

/**
 * Idempotently credit the registration bonus to a user. Safe to call from both
 * signup flows and from the manual "welcome" task: a Redis lock serializes
 * concurrent calls and durable claim records prevent repeat credits.
 */
export async function creditRegistrationBonus(
  userId: string,
  ref?: string,
  clickToken?: string,
): Promise<RegistrationBonusResult> {
  const currentBalance = async (): Promise<number> =>
    (await userCache.getUserProfile(userId))?.balance ?? 0;

  // Serialize concurrent calls (double-click, retries): without it two calls
  // could both pass the "already claimed" check before either marks it. If the
  // lock itself is unavailable we still proceed — losing the bonus is worse
  // than a rare race that the durable claim record also guards against.
  let lockHeld = false;
  try {
    const lockResult = await redis.set(lockKey(userId), "1", "EX", LOCK_TTL_SECONDS, "NX");
    if (lockResult === null) {
      // Another call for this user is in flight.
      return { granted: false, amount: 0, balance: await currentBalance() };
    }
    lockHeld = true;
  } catch (e) {
    console.warn("[RegistrationBonus] lock acquire failed, proceeding without lock:", e);
  }

  try {
    if (await isRegistrationBonusClaimed(userId)) {
      return { granted: false, amount: 0, balance: await currentBalance() };
    }

    const amount = await resolveRegistrationBonus(ref, clickToken);
    // Credit first: the user must not lose the bonus because a bookkeeping
    // write failed after the money was already added.
    const balance = await achievementEngine.grantMoneyBonus(
      userId,
      amount,
      "Бонус за регистрацию",
      `${amount.toLocaleString("ru-RU")} ₽`,
    );

    await achievementEngine.markBonusClaimed(userId, WELCOME_BONUS_TYPE).catch((e) => {
      console.warn("[RegistrationBonus] redis claim marker failed:", e);
    });
    await recordDurableClaim(userId, amount).catch((e) => {
      console.warn("[RegistrationBonus] durable claim record failed:", e);
    });

    return { granted: true, amount, balance };
  } catch (e) {
    // Release the lock so a failed credit can be retried immediately.
    if (lockHeld) {
      await redis.del(lockKey(userId)).catch(() => {});
    }
    throw e;
  }
}
