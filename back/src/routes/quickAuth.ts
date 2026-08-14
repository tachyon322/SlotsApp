import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { db } from "../db";
import { transaction } from "../db/schema";
import { auth } from "../lib/auth";
import { userCache } from "../lib/userCache";
import { achievementEngine } from "../lib/achievementEngine";
import { xpForBonusMoney } from "../lib/levels";
import { getWelcomeBonus } from "../lib/config";
import { affiliateService } from "../affiliate/service";
import { referralService } from "../lib/referralService";

const quickAuth = new Hono();

const MAX_ATTEMPTS = 5;

const DIGITS = "0123456789";
const LOWER = "abcdefghijklmnopqrstuvwxyz";
const PASSWORD_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

function randomString(chars: string, length: number): string {
  let out = "";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (let i = 0; i < length; i++) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function randomLogin(): string {
  return `User${randomString(DIGITS, 3)}${randomString(LOWER, 2)}`;
}

function randomPassword(): string {
  return randomString(PASSWORD_CHARS, 8);
}

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

quickAuth.post("/", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { ref?: string };
  const ref = String(body.ref || "").trim();

  // If the user came through an affiliate link with a custom registration
  // bonus, it overrides the standard welcome bonus.
  const resolved = ref ? await affiliateService.resolveRegistrationSource(ref) : null;
  const welcomeBonus = resolved
    ? (resolved.bonus ?? (await getWelcomeBonus()))
    : await getWelcomeBonus();

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const login = randomLogin();
    const password = randomPassword();
    const email = `${login.toLowerCase()}@litgame.games`;

    let result: unknown;

    try {
      result = await auth.api.signUpEmail({
        body: { email, password, name: login },
        returnHeaders: true,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "USER_ALREADY_EXISTS") continue;
      throw e;
    }

    if (result instanceof Response || !result) continue;
    const data = result as { headers?: Headers; response?: { user?: { id?: string } } };
    const userId = data.response?.user?.id;
    if (!userId) {
      return fail(c, "Не удалось создать аккаунт", 502);
    }

    const setCookies = data.headers?.getSetCookie?.() ?? [];
    for (const cookie of setCookies) {
      c.header("set-cookie", cookie, { append: true });
    }

    let balance = 0;
    try {
      balance = await userCache.adjustUserBalance(userId, welcomeBonus);
    } catch {
      return fail(c, "Не удалось начислить бонус", 502);
    }

    // Баланс уже зачислен — если запись в историю упадёт, мы обязаны хотя бы
    // залогировать это, иначе у аккаунта будут деньги без единого следа.
    try {
      await db.insert(transaction).values({
        id: crypto.randomUUID(),
        userId,
        type: "bonus",
        amount: welcomeBonus,
        status: "success",
        method: "Бонус за регистрацию",
        details: `${welcomeBonus.toLocaleString("ru-RU")} ₽`,
        createdAt: new Date(),
      });
    } catch (e) {
      console.error("[QuickAuth] welcome bonus transaction insert failed:", e);
    }

    await achievementEngine.markBonusClaimed(userId, "welcome");
    userCache.addXp(userId, xpForBonusMoney(welcomeBonus)).catch((e) => {
      console.warn("[QuickAuth] addXp error:", e);
    });

    if (resolved) {
      await affiliateService
        .recordSignup({
          sourceId: resolved.sourceId,
          userId,
          kind: "registration",
          bonusGranted: welcomeBonus,
        })
        .catch((e) => {
          console.warn("[QuickAuth] recordSignup error:", e);
        });
    }

    if (ref) {
      await referralService.attribute(userId, ref).catch((e) => {
        console.warn("[QuickAuth] referral attribute error:", e);
      });
    }

    return c.json({ login, password, balance });
  }

  return fail(c, "Не удалось создать аккаунт, попробуйте ещё раз", 502);
});

export default quickAuth;
