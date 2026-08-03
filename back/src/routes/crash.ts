import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { crashRound, user } from "../db/schema";
import { auth } from "../lib/auth";
import { gameHistoryBuffer } from "../lib/gameHistoryBuffer";
import { userCache } from "../lib/userCache";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const crash = new Hono<{ Variables: Variables }>();

// Активная ставка игрока в памяти: userId -> { amount, roundId, createdAt }.
// Списывается в момент /bet. Закрывается через /cashout (выигрыш),
// /cancel (возврат до старта раунда) или /lose (потеря).
// Перезапись /bet без закрытия = предыдущая ставка трактуется как проигранная.
type Reservation = { amount: number; roundId: string; createdAt: number };
const reservations = new Map<string, Reservation>();

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

crash.post("/bet", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as { amount?: number; roundId?: string };
  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return fail(c, "Некорректная сумма", 400);
  if (amount > 1_000_000) return fail(c, "Слишком большая сумма", 400);

  const roundId = typeof body.roundId === "string" && body.roundId ? body.roundId : crypto.randomUUID();

  let newBalance = 0;
  try {
    newBalance = await userCache.adjustUserBalance(u.id, -amount);
    reservations.set(u.id, { amount, roundId, createdAt: Date.now() });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient_balance") return fail(c, "Недостаточно средств", 402);
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }

  return c.json({ balance: newBalance, roundId });
});

crash.post("/cashout", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активной ставки", 404);

  const body = (await c.req.json().catch(() => ({}))) as { multiplier?: number; crashPoint?: number };
  const m = Number(body.multiplier);
  if (!Number.isFinite(m) || m < 1) return fail(c, "Некорректный множитель", 400);
  const cp = Number(body.crashPoint);
  if (!Number.isFinite(cp) || cp < 1) return fail(c, "Некорректная точка краша", 400);

  const payout = Math.round(r.amount * m);
  reservations.delete(u.id);

  const newBalance = await userCache.adjustUserBalance(u.id, payout);

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    crashPoint: cp,
    multiplier: m,
    payout,
    outcome: "win",
    createdAt: new Date(),
  };

  void gameHistoryBuffer.pushRound('crash', u.id, roundRecord);

  return c.json({ balance: newBalance, payout, multiplier: m });
});

crash.post("/cancel", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активной ставки", 404);

  reservations.delete(u.id);

  const newBalance = await userCache.adjustUserBalance(u.id, r.amount);
  return c.json({ balance: newBalance });
});

crash.post("/lose", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активной ставки", 404);

  const body = (await c.req.json().catch(() => ({}))) as { crashPoint?: number };
  const cp = Number(body.crashPoint);
  if (!Number.isFinite(cp) || cp < 1) return fail(c, "Некорректная точка краша", 400);

  reservations.delete(u.id);

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    crashPoint: cp,
    multiplier: 0,
    payout: 0,
    outcome: "loss",
    createdAt: new Date(),
  };

  void gameHistoryBuffer.pushRound('crash', u.id, roundRecord);

  const usr = await userCache.getUserProfile(u.id);
  return c.json({ balance: usr?.balance ?? 0 });
});

crash.get("/history", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const raw = Number(c.req.query("limit"));
  const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 30));

  const rows = await gameHistoryBuffer.getHistory('crash', u.id, limit);

  return c.json({ items: rows });
});

export default crash;