import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { db } from "../db";
import { transaction } from "../db/schema";
import { auth } from "../lib/auth";
import { gameHistoryBuffer } from "../lib/gameHistoryBuffer";
import { userCache } from "../lib/userCache";
import { scalePayout } from "../lib/balanceScaler";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

// Экономика BlockBlast (зеркалит front/lib/blockblast/engine.ts).
const TARGET_PLACEMENTS = 15;   // кнопка выхода открывается после 15 размещений
const STEP_MULT = 0.1;          // +0.1 к множителю за размещение
const MAX_MULT = 2.0;           // потолок множителя кэшаута
const LINE_BONUS_RATIO = 0.1;   // бонус за сгоревшую линию = 10% ставки
const MAX_LINES_PER_ROUND = 30; // потолок бонусных линий за раунд
const MAX_BET = 100_000;
const MAX_PAYOUT = 100_000;     // потолок выплаты за кэшаут
const END_RETURN_RATIO = 0.6;   // потолок возврата при /end

const blockblast = new Hono<{ Variables: Variables }>();

// Активный раунд игрока в памяти: userId -> { amount, createdAt }.
// Списывается в момент /bet. Бонусы за линии зачисляются сразу через /line.
// Закрывается через /cashout (win) или /end (возврат части ставки).
type Reservation = { amount: number; createdAt: number; lines: number };
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
  if (amount > MAX_BET) return fail(c, "Слишком большая сумма", 400);

  let newBalance = 0;
  try {
    newBalance = await userCache.adjustUserBalance(u.id, -amount);
    reservations.set(u.id, { amount, createdAt: Date.now(), lines: 0 });
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

  if (r.lines + lines > MAX_LINES_PER_ROUND) return fail(c, "Слишком много линий за раунд", 400);
  r.lines += lines;

  const added = Math.round(r.amount * LINE_BONUS_RATIO) * lines;
  // Регулятор баланса: масштаб бонуса по текущему балансу.
  const scaled = await scalePayout(u.id, added);
  const newBalance = await userCache.adjustUserBalance(u.id, scaled.payout);

  // Бонус за линии зачисляется в баланс, поэтому он обязан попасть и в
  // историю транзакций — иначе кошелёк и сверки расходятся с реальным балансом.
  if (scaled.payout > 0) {
    await db
      .insert(transaction)
      .values({
        id: crypto.randomUUID(),
        userId: u.id,
        type: "bonus",
        amount: scaled.payout,
        status: "success",
        method: "Бонус за линии BlockBlast",
        details: `Бонус за ${lines} лин. (ставка ${r.amount.toLocaleString("ru-RU")} ₽)`,
        createdAt: new Date(),
      })
      .catch((e) => {
        console.error("[BlockBlast] line bonus transaction insert failed:", e);
      });
  }

  return c.json({ balance: newBalance, added: scaled.payout });
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
  const placements = Math.max(0, Math.floor(Number(body.placements) || 0));
  if (placements < TARGET_PLACEMENTS) return fail(c, "Кассаут доступен после 15 размещений", 400);
  // Множитель вычисляет сервер из числа размещений; клиентский multiplier игнорируется.
  const m = Math.min(MAX_MULT, placements * STEP_MULT);
  const payout = Math.min(Math.round(r.amount * m), MAX_PAYOUT);
  // Регулятор баланса: масштаб выплаты по текущему балансу + потолок за раунд.
  const scaled = await scalePayout(u.id, payout, { cap: MAX_PAYOUT });
  reservations.delete(u.id);

  const newBalance = await userCache.adjustUserBalance(u.id, scaled.payout);

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    placements,
    multiplier: m,
    payout: scaled.payout,
    outcome: "win",
    createdAt: new Date(),
  };

  void gameHistoryBuffer.pushRound('blockblast', u.id, roundRecord);

  return c.json({ balance: newBalance, payout: scaled.payout, multiplier: m });
});

blockblast.post("/end", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const r = reservations.get(u.id);
  if (!r) return fail(c, "Нет активного раунда", 404);

  const body = (await c.req.json().catch(() => ({}))) as { placements?: number };
  const placements = Math.max(0, Math.floor(Number(body.placements) || 0));

  // Возврат части ставки до 15 размещений: n фигур -> (n/15) × 0.9 ставки, потолок 0.6.
  const multiplier = Math.min(END_RETURN_RATIO, (placements / TARGET_PLACEMENTS) * 0.9);
  const payout = Math.round(r.amount * multiplier);
  // Регулятор баланса: масштаб возврата по текущему балансу + потолок за раунд.
  const scaled = await scalePayout(u.id, payout, { cap: MAX_PAYOUT });
  reservations.delete(u.id);

  let newBalance = 0;
  try {
    newBalance = await userCache.adjustUserBalance(u.id, scaled.payout);
  } catch {
    newBalance = 0;
  }

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: r.amount,
    placements,
    multiplier,
    payout: scaled.payout,
    outcome: "loss",
    createdAt: new Date(),
  };

  void gameHistoryBuffer.pushRound('blockblast', u.id, roundRecord);

  return c.json({ balance: newBalance, payout: scaled.payout, multiplier });
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
