import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "../lib/auth";
import { gameHistoryBuffer } from "../lib/gameHistoryBuffer";
import { userCache } from "../lib/userCache";
import { MAX_PAYOUT_PER_ROUND } from "../lib/balanceScaler";
import { bandForClass, findRoundInBand, pickRoundClass } from "../lib/minedropEconomy";
import { ENGINE_VERSION } from "../lib/pickaxeEngine";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

// MineDrop («падающая кирка»): исход раунда целиком считается на сервере.
// Сервер выбирает класс раунда по балансу (динамический винрейт), подбирает
// seed, чей раунд попадает в полосу выплат, сразу зачисляет выплату и отдаёт
// seed клиенту — клиент по тому же seed проигрывает анимацию.

// Потолок ставки: даже минимальный джекпот (3× ставки) не должен превышать
// потолок выплаты за раунд (100 000 ₽).
const MAX_BET = 30_000;

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
  if (amount > MAX_BET) return fail(c, "Слишком большая сумма", 400);

  // Баланс после списания ставки задаёт винрейт раунда.
  let balanceAfterBet: number;
  try {
    balanceAfterBet = await userCache.adjustUserBalance(u.id, -amount);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient_balance") return fail(c, "Недостаточно средств", 402);
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }

  const cls = pickRoundClass(balanceAfterBet);
  const band = bandForClass(cls, amount, MAX_PAYOUT_PER_ROUND);
  const { seed, round, attempts, inBand } = findRoundInBand(band);

  // Выплата = стоимость разбитой руды × коэффициент движка; класс раунда
  // гарантирует, что выигрыш строго больше ставки, а возврат — меньше.
  let payout = Math.round(amount * round.multiplier);
  payout = cls === "loss" ? Math.min(payout, amount - 1) : Math.max(payout, amount + 1);
  payout = Math.max(0, Math.min(payout, MAX_PAYOUT_PER_ROUND));

  const balance =
    payout > 0 ? await userCache.adjustUserBalance(u.id, payout) : balanceAfterBet;

  const effectiveMultiplier = amount > 0 ? Number((payout / amount).toFixed(2)) : 0;

  const details = JSON.stringify({
    v: ENGINE_VERSION,
    seed,
    tool: round.tool.id,
    blocks: round.blocksBroken,
    depth: round.depth,
    class: cls,
    band: [band[0], band[1]],
    attempts,
    inBand,
    rawMultiplier: round.multiplier,
  });

  void gameHistoryBuffer.pushRound("minedrop", u.id, {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: amount,
    multiplier: effectiveMultiplier,
    payout,
    outcome: payout >= amount ? "win" : "loss",
    details,
    createdAt: new Date(),
  });

  return c.json({
    balance,
    seed,
    version: ENGINE_VERSION,
    tool: round.tool.id,
    payout,
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
