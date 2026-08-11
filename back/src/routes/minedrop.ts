import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "../lib/auth";
import { gameHistoryBuffer } from "../lib/gameHistoryBuffer";
import { userCache } from "../lib/userCache";
import { scalePayout } from "../lib/balanceScaler";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

// Теоретический максимум множителя движка MineDrop (5 сундуков × 250, house edge 1.653).
const MINEDROP_MAX_MULTIPLIER = 21;

const minedrop = new Hono<{ Variables: Variables }>();

// Активный раунд игрока в памяти: userId -> { amount, createdAt }.
// Списывается в момент /bet. Закрывается через /finish.
type Reservation = { amount: number; createdAt: number };
const reservations = new Map<string, Reservation>();

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

minedrop.post("/bet", async (c) => {
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

minedrop.post("/finish", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активного раунда", 404);

  const body = (await c.req.json().catch(() => ({}))) as {
    multiplier?: number;
    details?: string;
  };
  const m = Number(body.multiplier);
  if (!Number.isFinite(m) || m < 0) return fail(c, "Некорректный множитель", 400);
  const details = typeof body.details === "string" ? body.details.slice(0, 8000) : "{}";

  // Клиентский множитель не может превышать теоретический максимум движка.
  const clampedM = Math.min(m, MINEDROP_MAX_MULTIPLIER);

  const payout = Math.round(r.amount * clampedM);
  // Регулятор баланса: масштаб выплаты по текущему балансу + потолок за раунд.
  const scaled = await scalePayout(u.id, payout);
  reservations.delete(u.id);

  const newBalance = await userCache.adjustUserBalance(u.id, scaled.payout);

  const effectiveMultiplier = r.amount > 0 ? Number((scaled.payout / r.amount).toFixed(2)) : 0;

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    multiplier: effectiveMultiplier,
    payout: scaled.payout,
    outcome: scaled.payout >= r.amount ? "win" : "loss",
    details,
    createdAt: new Date(),
  };

  void gameHistoryBuffer.pushRound('minedrop', u.id, roundRecord);

  return c.json({ balance: newBalance, payout: scaled.payout, multiplier: effectiveMultiplier });
});

minedrop.get("/history", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const raw = Number(c.req.query("limit"));
  const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 30));

  const rows = await gameHistoryBuffer.getHistory('minedrop', u.id, limit);

  return c.json({ items: rows });
});

export default minedrop;
