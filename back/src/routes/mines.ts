import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { minesRound, user } from "../db/schema";
import { auth } from "../lib/auth";
import { gameHistoryBuffer } from "../lib/gameHistoryBuffer";
import { userCache } from "../lib/userCache";

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

  let newBalance = 0;
  try {
    newBalance = await userCache.adjustUserBalance(u.id, -amount);
    reservations.set(u.id, { amount, mines, createdAt: Date.now() });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient_balance") return fail(c, "Недостаточно средств", 402);
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
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

  const newBalance = await userCache.adjustUserBalance(u.id, payout);

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    mines: r.mines,
    opened,
    multiplier: m,
    payout,
    outcome: "win",
    createdAt: new Date(),
  };

  void gameHistoryBuffer.pushRound('mines', u.id, roundRecord);

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

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    mines: r.mines,
    opened,
    multiplier: 0,
    payout: 0,
    outcome: "loss",
    createdAt: new Date(),
  };

  void gameHistoryBuffer.pushRound('mines', u.id, roundRecord);

  const usr = await userCache.getUserProfile(u.id);
  return c.json({ balance: usr?.balance ?? 0 });
});

mines.get("/history", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const raw = Number(c.req.query("limit"));
  const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 30));

  const rows = await gameHistoryBuffer.getHistory('mines', u.id, limit);

  return c.json({ items: rows });
});

export default mines;
