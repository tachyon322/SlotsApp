import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable, transaction, payment as paymentTable } from "../db/schema";
import { auth } from "../lib/auth";
import { userCache } from "../lib/userCache";
import { redis } from "../lib/redis";
import { affiliateService } from "../affiliate/service";
import { hasSuccessfulDeposit, hasPaidVerification, getUserGateState } from "./wallet";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const devtools = new Hono<{ Variables: Variables }>();

const PREMIUM_LIFETIME = "2099-12-31T23:59:59.000Z";
const DEPOSIT_AMOUNT_DEFAULT = 20000;
const GATE_AMOUNT = 2000;

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

devtools.get("/redis/check", async (c) => {
  const startedAt = Date.now();
  const steps: { name: string; ok: boolean; ms: number; detail?: string }[] = [];
  let error: string | null = null;

  const run = async (
    name: string,
    fn: () => Promise<unknown>,
    detail?: (result: unknown) => string,
  ) => {
    const t = Date.now();
    try {
      const result = await fn();
      steps.push({
        name,
        ok: true,
        ms: Date.now() - t,
        detail: detail ? detail(result) : undefined,
      });
    } catch (err) {
      steps.push({ name, ok: false, ms: Date.now() - t, detail: (err as Error).message });
    }
  };

  const key = `devtool:redis:${crypto.randomUUID()}`;

  await run("PING", () => redis.ping(), (r) => String(r));
  await run("SET", () => redis.set(key, "ok"), () => key);
  await run("GET", () => redis.get(key), (r) => String(r ?? "null"));
  await run(
    "INFO",
    () => redis.info("server"),
    (r) => {
      const match = /redis_version:([^\r\n]+)/.exec(String(r));
      return (match?.[1] ?? "unknown").trim();
    },
  );
  await run("TTL", () => redis.pexpire(key, 10000).then(() => redis.pttl(key)), (r) => `${r}ms`);
  await run("DEL", () => redis.del(key), () => key);

  const ok = steps.every((s) => s.ok);
  if (!ok) {
    const failed = steps.find((s) => !s.ok);
    error = failed?.detail ?? "Redis check failed";
  }

  return c.json({
    ok,
    steps,
    totalMs: Date.now() - startedAt,
    error,
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  });
});

devtools.get("/funnel/status", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const [profile, gates, withdrawals] = await Promise.all([
    userCache.getUserProfile(u.id),
    getUserGateState(u.id),
    db
      .select()
      .from(transaction)
      .where(and(eq(transaction.userId, u.id), eq(transaction.type, "withdrawal")))
      .orderBy(desc(transaction.createdAt))
      .limit(20),
  ]);

  return c.json({
    user: {
      id: u.id,
      name: profile?.name ?? u.name,
      email: profile?.email ?? u.email,
      balance: profile?.balance ?? 0,
    },
    gates: {
      hasDeposit: await hasSuccessfulDeposit(u.id),
      hasPaidVerification: await hasPaidVerification(u.id),
      verifiedForPayment: gates.verifiedForPayment,
      premiumActive: gates.premiumActive,
      premiumUntil: gates.premiumUntil,
    },
    withdrawals: withdrawals.map((w) => ({
      id: w.id,
      amount: w.amount,
      status: w.status,
      method: w.method,
      details: w.details,
      createdAt: w.createdAt.toISOString(),
    })),
  });
});

devtools.post("/funnel/deposit", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as { amount?: unknown };
  const requested = Math.floor(Number(body.amount));
  const amount = Number.isFinite(requested) && requested > 0 ? requested : DEPOSIT_AMOUNT_DEFAULT;
  const bonusAmount = amount;
  const totalAmount = amount + bonusAmount;

  const id = crypto.randomUUID();
  const now = new Date();

  const newBalance = await userCache.adjustUserBalance(u.id, totalAmount);

  await db.insert(paymentTable).values({
    id,
    userId: u.id,
    paymentId: `devtool-${id}`,
    amount,
    currency: "rub",
    method: "sbp",
    purpose: "deposit",
    status: "PAID",
    credited: true,
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(transaction).values([
    {
      id: crypto.randomUUID(),
      userId: u.id,
      type: "deposit",
      amount,
      status: "success",
      method: "СБП",
      details: "Пополнение баланса",
      createdAt: now,
    },
    {
      id: crypto.randomUUID(),
      userId: u.id,
      type: "bonus",
      amount: bonusAmount,
      status: "success",
      method: "Бонус 100%",
      details: "Бонус за депозит",
      createdAt: new Date(now.getTime() + 10),
    },
  ]);

  // Credit the partner's balance with the commission on this deposit.
  void affiliateService.creditDepositCommission(u.id, amount, now);

  return c.json({
    success: true,
    amount,
    bonusAmount,
    balance: newBalance,
    paymentId: id,
  });
});

devtools.post("/funnel/verify", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(paymentTable).values({
    id,
    userId: u.id,
    paymentId: `devtool-${id}`,
    amount: GATE_AMOUNT,
    currency: "rub",
    method: "sbp",
    purpose: "verification",
    status: "PAID",
    credited: true,
    createdAt: now,
    updatedAt: now,
  });

  return c.json({ success: true, paymentId: id });
});

devtools.post("/funnel/premium", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const id = crypto.randomUUID();
  const now = new Date();

  await db.insert(paymentTable).values({
    id,
    userId: u.id,
    paymentId: `devtool-${id}`,
    amount: GATE_AMOUNT,
    currency: "rub",
    method: "sbp",
    purpose: "premium",
    status: "PAID",
    credited: true,
    createdAt: now,
    updatedAt: now,
  });

  await db
    .update(userTable)
    .set({ premiumUntil: new Date(PREMIUM_LIFETIME), updatedAt: now })
    .where(eq(userTable.id, u.id));

  return c.json({ success: true, paymentId: id });
});

devtools.post("/funnel/verified-payment", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as { verified?: unknown };
  const verified = body.verified === undefined ? true : Boolean(body.verified);

  await db
    .update(userTable)
    .set({ verifiedForPayment: verified, updatedAt: new Date() })
    .where(eq(userTable.id, u.id));

  return c.json({ success: true, verifiedForPayment: verified });
});

devtools.post("/funnel/reset", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const now = new Date();

  await db
    .delete(transaction)
    .where(and(eq(transaction.userId, u.id), eq(transaction.type, "withdrawal")));
  await db
    .delete(transaction)
    .where(and(eq(transaction.userId, u.id), eq(transaction.type, "deposit")));
  await db.delete(paymentTable).where(eq(paymentTable.userId, u.id));
  await db
    .update(userTable)
    .set({ premiumUntil: null, verifiedForPayment: false, updatedAt: now })
    .where(eq(userTable.id, u.id));

  return c.json({ success: true });
});

export default devtools;
