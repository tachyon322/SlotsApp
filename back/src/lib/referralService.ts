import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { user, userReferral, userReferralCode } from "../db/schema";
import { achievementEngine } from "./achievementEngine";

const REFERRAL_REWARD = 500;
const CODE_LENGTH = 6;
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

function randomCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

function normalizeCode(raw: string): string {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

export interface ReferralFriend {
  name: string;
  createdAt: string;
}

export interface ReferralStatus {
  code: string;
  link: string;
  friendsCount: number;
  earned: number;
  perFriend: number;
  friends: ReferralFriend[];
}

class ReferralService {
  async getOrCreateCode(userId: string): Promise<string> {
    const existing = await db
      .select({ code: userReferralCode.code })
      .from(userReferralCode)
      .where(eq(userReferralCode.userId, userId))
      .limit(1);
    if (existing[0]) return existing[0].code;

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = randomCode();
      const inserted = await db
        .insert(userReferralCode)
        .values({ userId, code: candidate, createdAt: new Date() })
        .onConflictDoNothing()
        .returning({ code: userReferralCode.code });
      if (inserted.length > 0) return inserted[0].code;

      const again = await db
        .select({ code: userReferralCode.code })
        .from(userReferralCode)
        .where(eq(userReferralCode.userId, userId))
        .limit(1);
      if (again[0]) return again[0].code;
    }

    return userId.replace(/-/g, "").slice(0, CODE_LENGTH).toUpperCase();
  }

  async resolveReferrer(ref: string): Promise<string | null> {
    const code = normalizeCode(ref);
    if (!code) return null;
    const rows = await db
      .select({ userId: userReferralCode.userId })
      .from(userReferralCode)
      .where(eq(userReferralCode.code, code))
      .limit(1);
    return rows[0]?.userId ?? null;
  }

  async attribute(newUserId: string, ref: string): Promise<boolean> {
    const referrerId = await this.resolveReferrer(ref);
    if (!referrerId || referrerId === newUserId) return false;

    const inserted = await db
      .insert(userReferral)
      .values({
        id: crypto.randomUUID(),
        referrerId,
        referredId: newUserId,
        rewardAmount: REFERRAL_REWARD,
        createdAt: new Date(),
      })
      .onConflictDoNothing()
      .returning({ id: userReferral.id });
    if (inserted.length === 0) return false;

    const name = await this.userName(newUserId);
    await achievementEngine.grantMoneyBonus(
      referrerId,
      REFERRAL_REWARD,
      "Приведи друга",
      `Друг: ${name}`,
    );
    return true;
  }

  async getStatus(userId: string): Promise<ReferralStatus> {
    const code = await this.getOrCreateCode(userId);
    const rows = await db
      .select({
        rewardAmount: userReferral.rewardAmount,
        createdAt: userReferral.createdAt,
        name: user.name,
      })
      .from(userReferral)
      .innerJoin(user, eq(user.id, userReferral.referredId))
      .where(eq(userReferral.referrerId, userId))
      .orderBy(desc(userReferral.createdAt));

    const earned = rows.reduce(
      (acc, r) => acc + Math.floor(Number(r.rewardAmount) || 0),
      0,
    );
    const friends: ReferralFriend[] = rows.map((r) => ({
      name: r.name,
      createdAt: r.createdAt.toISOString(),
    }));

    return {
      code,
      link: `${FRONTEND_ORIGIN}/r/${code}`,
      friendsCount: rows.length,
      earned,
      perFriend: REFERRAL_REWARD,
      friends,
    };
  }

  private async userName(userId: string): Promise<string> {
    const rows = await db
      .select({ name: user.name })
      .from(user)
      .where(eq(user.id, userId))
      .limit(1);
    return rows[0]?.name || "Игрок";
  }
}

export const referralService = new ReferralService();
