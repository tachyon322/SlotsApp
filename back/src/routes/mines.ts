import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { minesRound, user } from "../db/schema";
import { auth } from "../lib/auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const ALLOWED_MINES = [3, 5, 7, 10];

const mines = new Hono<{ Variables: Variables }>();

// Активный раунд игрока в памяти: userId -> { amount, mines, createdAt }.
// Списывается в момент /bet. Закрывается через /cashout (выигрыш)
// или /lose (потеря). Перезапись /bet без закрытия = предыдущая ставка проиграна.
type Reservation = { amount: number; mines: number; createdAt: number };
const reservations = new Map<string, Reservation>();

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

mines.post("/bet", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as { amount?: number; mines?: number };
  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return fail(c, "Некорректная сумма", 400);
  if (amount > 1_000_000) return fail(c, "Слишком большая сумма", 400);

  const mines = Math.floor(Number(body.mines));
  if (!ALLOWED_MINES.includes(mines)) return fail(c, "Некорректное число мин", 400);

  let newBalance: number | null = null;
  try {
    newBalance = await db.transaction(async (tx) => {
      const rows = await tx.select().from(user).where(eq(user.id, u.id));
      const usr = rows[0];
      if (!usr) throw new Error("not_found");
      if (usr.balance < amount) throw new Error("insufficient");
      // предыдущий незакрытый раунд — теряется (баланс уже списан тогда)
      reservations.delete(u.id);
      const updated = usr.balance - amount;
      await tx
        .update(user)
        .set({ balance: updated, updatedAt: new Date() })
        .where(eq(user.id, u.id));
      reservations.set(u.id, { amount, mines, createdAt: Date.now() });
      return updated;
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient") return fail(c, "Недостаточно средств", 402);
    if (msg === "not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }

  return c.json({ balance: newBalance });
});

mines.post("/cashout", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активного раунда", 404);

  const body = (await c.req.json().catch(() => ({}))) as { multiplier?: number; opened?: number };
  const m = Number(body.multiplier);
  if (!Number.isFinite(m) || m < 1) return fail(c, "Некорректный множитель", 400);
  const opened = Math.max(0, Math.floor(Number(body.opened) || 0));

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

  await db.insert(minesRound).values({
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    mines: r.mines,
    opened,
    multiplier: m,
    payout,
    outcome: "win",
    createdAt: new Date(),
  });

  return c.json({ balance: newBalance, payout, multiplier: m });
});

mines.post("/lose", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активного раунда", 404);

  const body = (await c.req.json().catch(() => ({}))) as { opened?: number };
  const opened = Math.max(0, Math.floor(Number(body.opened) || 0));

  reservations.delete(u.id);

  await db.insert(minesRound).values({
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    mines: r.mines,
    opened,
    multiplier: 0,
    payout: 0,
    outcome: "loss",
    createdAt: new Date(),
  });

  const rows = await db.select().from(user).where(eq(user.id, u.id));
  return c.json({ balance: rows[0]?.balance ?? 0 });
});

mines.get("/history", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const raw = Number(c.req.query("limit"));
  const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 30));

  const rows = await db
    .select()
    .from(minesRound)
    .where(eq(minesRound.userId, u.id))
    .orderBy(desc(minesRound.createdAt))
    .limit(limit);

  return c.json({ items: rows });
});

export default mines;
