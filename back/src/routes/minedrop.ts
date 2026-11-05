import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "../lib/auth";
import { gameHistoryBuffer } from "../lib/gameHistoryBuffer";
import { userCache } from "../lib/userCache";
import { scalePayout } from "../lib/balanceScaler";
import { ENGINE_VERSION, randomSeed, simulateRound } from "../lib/pickaxeEngine";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

// MineDrop («падающая кирка»): исход раунда целиком считается на сервере.
// Сервер выбирает seed, прогоняет детерминированный движок, сразу зачисляет
// выплату и отдаёт seed клиенту — клиент по тому же seed проигрывает анимацию.

const minedrop = new Hono<{ Variables: Variables }>();

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

  try {
    await userCache.adjustUserBalance(u.id, -amount);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient_balance") return fail(c, "Недостаточно средств", 402);
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }

  const seed = randomSeed();
  const round = simulateRound(seed);

  const rawPayout = Math.floor(amount * round.multiplier);
  // Регулятор баланса: масштаб выплаты по текущему балансу + потолок за раунд.
  const scaled = await scalePayout(u.id, rawPayout);
  const balance =
    scaled.payout > 0
      ? await userCache.adjustUserBalance(u.id, scaled.payout)
      : ((await userCache.getUserProfile(u.id))?.balance ?? 0);

  const effectiveMultiplier = amount > 0 ? Number((scaled.payout / amount).toFixed(2)) : 0;

  const details = JSON.stringify({
    v: ENGINE_VERSION,
    seed,
    tool: round.tool.id,
    blocks: round.blocksBroken,
    depth: round.depth,
    rawMultiplier: round.multiplier,
  });

  void gameHistoryBuffer.pushRound("minedrop", u.id, {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: amount,
    multiplier: effectiveMultiplier,
    payout: scaled.payout,
    outcome: scaled.payout >= amount ? "win" : "loss",
    details,
    createdAt: new Date(),
  });

  return c.json({
    balance,
    seed,
    version: ENGINE_VERSION,
    tool: round.tool.id,
    payout: scaled.payout,
    multiplier: effectiveMultiplier,
    rawMultiplier: round.multiplier,
  });
});

minedrop.get("/history", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const raw = Number(c.req.query("limit"));
  const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 30));

  const rows = await gameHistoryBuffer.getHistory("minedrop", u.id, limit);

  return c.json({ items: rows });
});

export default minedrop;
