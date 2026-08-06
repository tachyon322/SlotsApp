import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, count, gte, eq } from "drizzle-orm";
import { db } from "../db";
import { wheelSpin, transaction } from "../db/schema";
import { auth } from "../lib/auth";
import { userCache } from "../lib/userCache";
import { achievementEngine } from "../lib/achievementEngine";
import { xpForBonusMoney } from "../lib/levels";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const wheel = new Hono<{ Variables: Variables }>();

const DAILY_LIMIT = 3;

// Призы и веса (в сумме ~100): мелкие выпадают заметно чаще.
const PRIZES = [10, 20, 25, 50, 100, 200, 500, 1000, 2500, 5000];
const WEIGHTS = [46, 25, 12, 7, 4.5, 2.5, 1.5, 0.9, 0.4, 0.2];

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function pickPrize(): { prize: number; sectorIndex: number } {
  const total = WEIGHTS.reduce((a, b) => a + b, 0);
  let roll = Math.random() * total;
  for (let i = 0; i < PRIZES.length; i++) {
    roll -= WEIGHTS[i];
    if (roll <= 0) return { prize: PRIZES[i], sectorIndex: i };
  }
  return { prize: PRIZES[PRIZES.length - 1], sectorIndex: PRIZES.length - 1 };
}

async function countTodaySpins(userId: string): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(wheelSpin)
    .where(and(eq(wheelSpin.userId, userId), gte(wheelSpin.createdAt, startOfToday())));
  return rows[0]?.value ?? 0;
}

wheel.get("/status", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const todaySpins = await countTodaySpins(u.id);
  const profile = await userCache.getUserProfile(u.id);

  return c.json({
    balance: profile?.balance ?? 0,
    spinsLeft: Math.max(0, DAILY_LIMIT - todaySpins),
    dailySpins: DAILY_LIMIT,
  });
});

wheel.post("/spin", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const todaySpins = await countTodaySpins(u.id);
  if (todaySpins >= DAILY_LIMIT) {
    return fail(c, "Лимит круток на сегодня исчерпан", 400);
  }

  const { prize, sectorIndex } = pickPrize();

  let newBalance: number;
  try {
    newBalance = await userCache.adjustUserBalance(u.id, prize);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }

  const now = new Date();

  await db.insert(wheelSpin).values({
    id: crypto.randomUUID(),
    userId: u.id,
    prize,
    createdAt: now,
  });

  await db.insert(transaction).values({
    id: crypto.randomUUID(),
    userId: u.id,
    type: "bonus",
    amount: prize,
    status: "success",
    method: "Колесо Фортуны",
    details: `${prize.toLocaleString("ru-RU")} ₽`,
    createdAt: now,
  });

  void achievementEngine.recordEvent(u.id, "wheel");
  userCache.addXp(u.id, xpForBonusMoney(prize)).catch((e) => {
    console.warn("[Wheel] addXp error:", e);
  });

  return c.json({
    balance: newBalance,
    prize,
    spinsLeft: Math.max(0, DAILY_LIMIT - todaySpins - 1),
    sectorIndex,
  });
});

export default wheel;
