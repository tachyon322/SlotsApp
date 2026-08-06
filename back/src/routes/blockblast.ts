import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "../lib/auth";
import { gameHistoryBuffer } from "../lib/gameHistoryBuffer";
import { userCache } from "../lib/userCache";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

// Доля ставки, которую приносит одна сгоревшая линия (строка или колонка).
const LINE_BONUS_RATIO = 0.16;

const blockblast = new Hono<{ Variables: Variables }>();

// Активный раунд игрока в памяти: userId -> { amount, createdAt }.
// Списывается в момент /bet. Бонусы за линии зачисляются сразу через /line.
// Закрывается через /cashout (win) или /end (возврат части ставки).
type Reservation = { amount: number; createdAt: number };
const reservations = new Map<string, Reservation>();

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

blockblast.post("/bet", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as { amount?: number };
  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount <= 0) return fail(c, "Некорректная сумма", 400);
  if (amount > 1_000_000) return fail(c, "Слишком большая сумма", 400);

  let newBalance = 0;
  try {
    newBalance = await userCache.adjustUserBalance(u.id, -amount);
    reservations.set(u.id, { amount, createdAt: Date.now() });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient_balance") return fail(c, "Недостаточно средств", 402);
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }

  return c.json({ balance: newBalance });
});

blockblast.post("/line", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активного раунда", 404);

  const body = (await c.req.json().catch(() => ({}))) as { lines?: number };
  const lines = Math.floor(Number(body.lines) || 0);
  if (!Number.isFinite(lines) || lines < 1 || lines > 2) {
    return fail(c, "Некорректное число линий", 400);
  }

  const added = Math.round(r.amount * LINE_BONUS_RATIO) * lines;
  const newBalance = await userCache.adjustUserBalance(u.id, added);

  return c.json({ balance: newBalance, added });
});

blockblast.post("/cashout", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активного раунда", 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    multiplier?: number;
    placements?: number;
  };
  const m = Number(body.multiplier);
  if (!Number.isFinite(m) || m < 1) return fail(c, "Некорректный множитель", 400);
  const placements = Math.max(0, Math.floor(Number(body.placements) || 0));
  if (placements < 10) return fail(c, "Кассаут доступен после 10 размещений", 400);

  const payout = Math.round(r.amount * m);
  reservations.delete(u.id);

  const newBalance = await userCache.adjustUserBalance(u.id, payout);

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    placements,
    multiplier: m,
    payout,
    outcome: "win",
    createdAt: new Date(),
  };

  void gameHistoryBuffer.pushRound('blockblast', u.id, roundRecord);

  return c.json({ balance: newBalance, payout, multiplier: m });
});

blockblast.post("/end", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активного раунда", 404);

  const body = (await c.req.json().catch(() => ({}))) as { placements?: number };
  const placements = Math.max(0, Math.floor(Number(body.placements) || 0));

  // Возврат части ставки до 10 размещений: n фигур -> n/10 ставки.
  const multiplier = Math.min(0.99, (placements / 10) * 1.6);
  const payout = Math.round(r.amount * multiplier);
  reservations.delete(u.id);

  let newBalance = 0;
  try {
    newBalance = await userCache.adjustUserBalance(u.id, payout);
  } catch {
    newBalance = 0;
  }

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    placements,
    multiplier,
    payout,
    outcome: "loss",
    createdAt: new Date(),
  };

  void gameHistoryBuffer.pushRound('blockblast', u.id, roundRecord);

  return c.json({ balance: newBalance, payout, multiplier });
});

blockblast.get("/history", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const raw = Number(c.req.query("limit"));
  const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 30));

  const rows = await gameHistoryBuffer.getHistory('blockblast', u.id, limit);

  return c.json({ items: rows });
});

export default blockblast;
