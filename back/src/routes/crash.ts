import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { user } from "../db/schema";
import { auth } from "../lib/auth";

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

  let newBalance: number | null = null;
  try {
    newBalance = await db.transaction(async (tx) => {
      const rows = await tx.select().from(user).where(eq(user.id, u.id));
      const usr = rows[0];
      if (!usr) throw new Error("not_found");
      if (usr.balance < amount) throw new Error("insufficient");
      // предыдущая незакрытая ставка — теряется (баланс уже списан тогда)
      reservations.delete(u.id);
      const updated = usr.balance - amount;
      await tx
        .update(user)
        .set({ balance: updated, updatedAt: new Date() })
        .where(eq(user.id, u.id));
      reservations.set(u.id, { amount, roundId, createdAt: Date.now() });
      return updated;
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient") return fail(c, "Недостаточно средств", 402);
    if (msg === "not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }

  return c.json({ balance: newBalance, roundId });
});

crash.post("/cashout", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активной ставки", 404);

  const body = (await c.req.json().catch(() => ({}))) as { multiplier?: number };
  const m = Number(body.multiplier);
  if (!Number.isFinite(m) || m < 1) return fail(c, "Некорректный множитель", 400);

  const payout = Math.round(r.amount * m);
  reservations.delete(u.id);

  const rows = await db.select().from(user).where(eq(user.id, u.id));
  const usr = rows[0];
  if (!usr) return fail(c, "Пользователь не найден", 404);

  const newBalance = usr.balance + payout;
  await db
    .update(user)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(eq(user.id, u.id));

  return c.json({ balance: newBalance, payout, multiplier: m });
});

crash.post("/cancel", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активной ставки", 404);

  reservations.delete(u.id);

  const rows = await db.select().from(user).where(eq(user.id, u.id));
  const usr = rows[0];
  if (!usr) return fail(c, "Пользователь не найден", 404);

  const newBalance = usr.balance + r.amount;
  await db
    .update(user)
    .set({ balance: newBalance, updatedAt: new Date() })
    .where(eq(user.id, u.id));

  return c.json({ balance: newBalance });
});

crash.post("/lose", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  reservations.delete(u.id);
  const rows = await db.select().from(user).where(eq(user.id, u.id));
  return c.json({ balance: rows[0]?.balance ?? 0 });
});

export default crash;