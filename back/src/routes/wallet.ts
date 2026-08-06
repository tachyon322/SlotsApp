import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable, transaction, promoActivation, payment as paymentTable, slotsRound, crashRound, minesRound, casesRound, blockblastRound, minedropRound } from "../db/schema";
import { auth } from "../lib/auth";
import { userCache } from "../lib/userCache";
import { createDepositPayment, getPaymentStatus, EXPRESSAPP_TERMINAL_STATUSES, ExpressAppPaymentStatus } from "../lib/expressapp";
import { achievementEngine } from "../lib/achievementEngine";
import { xpForBonusMoney } from "../lib/levels";
import { getMinDeposit } from "../lib/config";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const wallet = new Hono<{ Variables: Variables }>();

function fail(c: Context, message: string, status: ContentfulStatusCode, code?: string) {
  return c.json(code ? { message, code } : { message }, status);
}

const PROMO_CODES: Record<string, number> = {
  WELCOME1000: 1000,
  KAZIK2026: 5000,
  BONUS500: 500,
  SLOTS2026: 2000,
  SWBOT: 1500,
};

type PaymentPurpose = "deposit" | "verification" | "premium";

const GATE_AMOUNT = 2000;
const PREMIUM_LIFETIME = "2099-12-31T23:59:59.000Z";

type WithdrawRejectCode = "need_deposit" | "need_verification" | "need_premium" | "verification_pending";

async function clearWithdrawRequests(userId: string): Promise<void> {
  await db
    .delete(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "failed"),
      ),
    );
}

async function recordWithdrawRejection(
  userId: string,
  amount: number,
  method: string,
  requisites: string,
  code: WithdrawRejectCode,
): Promise<void> {
  await clearWithdrawRequests(userId);
  await db.insert(transaction).values({
    id: crypto.randomUUID(),
    userId,
    type: "withdrawal",
    amount,
    status: "failed",
    method,
    details: JSON.stringify({ code, requisites }),
    createdAt: new Date(),
  });
}

async function isWithdrawGateSatisfied(userId: string, code: WithdrawRejectCode): Promise<boolean> {
  if (code === "need_deposit") return hasSuccessfulDeposit(userId);
  if (code === "need_verification") return hasPaidVerification(userId);
  const gates = await getUserGateState(userId);
  if (code === "need_premium") return gates.premiumActive;
  return gates.verifiedForPayment;
}

async function hasSuccessfulDeposit(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: transaction.id })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "deposit"),
        eq(transaction.status, "success"),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function hasPaidVerification(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: paymentTable.id })
    .from(paymentTable)
    .where(
      and(
        eq(paymentTable.userId, userId),
        eq(paymentTable.purpose, "verification"),
        eq(paymentTable.status, "PAID"),
        eq(paymentTable.credited, true),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function getUserGateState(userId: string): Promise<{
  verifiedForPayment: boolean;
  premiumActive: boolean;
  premiumUntil: string | null;
}> {
  const rows = await db
    .select({
      verifiedForPayment: userTable.verifiedForPayment,
      premiumUntil: userTable.premiumUntil,
    })
    .from(userTable)
    .where(eq(userTable.id, userId));
  const row = rows[0];
  const premiumUntil = row?.premiumUntil ? new Date(row.premiumUntil) : null;
  return {
    verifiedForPayment: Boolean(row?.verifiedForPayment),
    premiumActive: premiumUntil ? premiumUntil.getTime() > Date.now() : false,
    premiumUntil: premiumUntil ? premiumUntil.toISOString() : null,
  };
}

export interface WalletHistoryItem {
  id: string;
  type: 'deposit' | 'withdrawal' | 'bonus' | 'win' | 'loss';
  category: 'games' | 'bonuses' | 'deposits' | 'withdrawals';
  title: string;
  subtitle: string;
  amount: number; // positive for credit (+), negative for debit (-)
  status: 'success' | 'pending' | 'failed';
  createdAt: string;
}

wallet.post("/payment", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    amount?: number;
    method?: string;
    purpose?: string;
  };

  const purpose: PaymentPurpose =
    body.purpose === "verification" || body.purpose === "premium"
      ? body.purpose
      : "deposit";

  let amount = Math.floor(Number(body.amount));
  if (purpose === "verification" || purpose === "premium") {
    amount = GATE_AMOUNT;
  } else {
    const minDeposit = await getMinDeposit();
    if (!Number.isFinite(amount) || amount < minDeposit) {
      return fail(
        c,
        `Минимальная сумма пополнения — ${minDeposit.toLocaleString("ru-RU")} ₽`,
        400,
      );
    }
  }

  if (purpose === "verification" || purpose === "premium") {
    const hasDeposit = await hasSuccessfulDeposit(u.id);
    if (!hasDeposit) {
      return fail(
        c,
        "Вывод доступен только для тех пользователей, совершивших хотя бы один депозит",
        403,
        "need_deposit",
      );
    }
  }
  if (purpose === "premium") {
    const paidVerification = await hasPaidVerification(u.id);
    if (!paidVerification) {
      return fail(
        c,
        "Для покупки Премиума сначала пройдите верификацию реквизитов",
        403,
        "need_verification",
      );
    }
  }

  const method = body.method === "card" ? "card" : "sbp";
  const expressappMethod = method === "card" ? "all" : "nspk";

  const id = crypto.randomUUID();
  const now = new Date();

  try {
    await db.insert(paymentTable).values({
      id,
      userId: u.id,
      amount,
      currency: "rub",
      method,
      purpose,
      status: "NEW",
      credited: false,
      createdAt: now,
      updatedAt: now,
    });

    const result = await createDepositPayment({
      amount,
      currency: "rub",
      method: expressappMethod,
      clientOrderId: id,
    });

    await db
      .update(paymentTable)
      .set({
        paymentId: result.paymentId,
        link: result.link,
        status: "PENDING",
        updatedAt: new Date(),
      })
      .where(eq(paymentTable.id, id));

    return c.json({
      paymentId: id,
      link: result.link,
    });
  } catch (e) {
    await db
      .update(paymentTable)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(paymentTable.id, id))
      .catch(() => {});
    const msg = (e as Error).message;
    return fail(c, msg || "Не удалось создать платёж", 502);
  }
});

wallet.get("/payment/status", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const paymentId = c.req.query("id");
  if (!paymentId) return fail(c, "Не указан идентификатор платежа", 400);

  const rows = await db
    .select()
    .from(paymentTable)
    .where(and(eq(paymentTable.id, paymentId), eq(paymentTable.userId, u.id)));

  const payment = rows[0];
  if (!payment) return fail(c, "Платёж не найден", 404);

  let status = payment.status;
  if (payment.paymentId && !EXPRESSAPP_TERMINAL_STATUSES.has(status as ExpressAppPaymentStatus)) {
    try {
      const remote = await getPaymentStatus(payment.paymentId);
      // PAID is transitioned exclusively by the webhook (which also credits the
      // balance). Surfacing it here would let the client stop polling before the
      // deposit is actually credited.
      if (remote.status !== "PAID") {
        status = remote.status;
        await db
          .update(paymentTable)
          .set({ status: remote.status, updatedAt: new Date() })
          .where(eq(paymentTable.id, payment.id));
      }
    } catch {
      // Keep last known status if the remote is unreachable
    }
  }

  return c.json({
    paymentId: payment.id,
    amount: payment.amount,
    status,
  });
});

wallet.get("/withdraw/eligibility", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const [hasDeposit, paidVerification, gates] = await Promise.all([
    hasSuccessfulDeposit(u.id),
    hasPaidVerification(u.id),
    getUserGateState(u.id),
  ]);

  return c.json({ hasDeposit, hasPaidVerification: paidVerification, ...gates });
});

wallet.post("/withdraw", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    amount?: number;
    method?: 'card' | 'sbp';
    requisites?: string;
  };

  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 10000) {
    return fail(c, "Минимальная сумма вывода — 10,000 ₽", 400);
  }

  const methodLabel = body.method === 'card' ? 'Банковская карта' : 'СБП';
  const requisites = body.requisites || (body.method === 'card' ? '•••• •••• •••• 4321' : '+7 (532) ***-**-26');

  if (!(await hasSuccessfulDeposit(u.id))) {
    await recordWithdrawRejection(u.id, amount, methodLabel, requisites, "need_deposit");
    return fail(
      c,
      "Вывод доступен только для тех пользователей, совершивших хотя бы один депозит",
      403,
      "need_deposit",
    );
  }

  if (!(await hasPaidVerification(u.id))) {
    await recordWithdrawRejection(u.id, amount, methodLabel, requisites, "need_verification");
    return fail(
      c,
      "Для вывода необходимо пройти верификацию реквизитов",
      403,
      "need_verification",
    );
  }

  const gates = await getUserGateState(u.id);
  if (!gates.premiumActive) {
    await recordWithdrawRejection(u.id, amount, methodLabel, requisites, "need_premium");
    return fail(
      c,
      "Для доступа к выводу оформите Премиум",
      403,
      "need_premium",
    );
  }
  if (!gates.verifiedForPayment) {
    await recordWithdrawRejection(u.id, amount, methodLabel, requisites, "verification_pending");
    return fail(
      c,
      "Реквизиты еще проверяются, попробуйте позже",
      403,
      "verification_pending",
    );
  }

  try {
    const profile = await userCache.getUserProfile(u.id);
    const currentBalance = profile?.balance ?? 0;

    await clearWithdrawRequests(u.id);

    await db.insert(transaction).values({
      id: crypto.randomUUID(),
      userId: u.id,
      type: "withdrawal",
      amount,
      status: "pending",
      method: methodLabel,
      details: requisites,
      createdAt: new Date(),
    });

    return c.json({
      success: true,
      balance: currentBalance,
      amount,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }
});

wallet.get("/withdraw/requests", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const rows = await db
    .select()
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, u.id),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "failed"),
      ),
    )
    .orderBy(desc(transaction.createdAt));

  const items: { id: string; amount: number; code: WithdrawRejectCode; createdAt: string }[] = [];
  for (const row of rows) {
    let code: WithdrawRejectCode | null = null;
    try {
      const parsed = JSON.parse(row.details || "{}");
      if (
        parsed &&
        (parsed.code === "need_deposit" ||
          parsed.code === "need_verification" ||
          parsed.code === "need_premium" ||
          parsed.code === "verification_pending")
      ) {
        code = parsed.code;
      }
    } catch {
      // not a structured rejection record
    }
    if (!code) continue;

    if (await isWithdrawGateSatisfied(u.id, code)) {
      await db.delete(transaction).where(eq(transaction.id, row.id));
      continue;
    }

    items.push({
      id: row.id,
      amount: row.amount,
      code,
      createdAt: row.createdAt.toISOString(),
    });
  }

  return c.json({ items });
});

wallet.post("/withdraw/requests/:id/cancel", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const id = c.req.param("id");
  const rows = await db
    .select({ id: transaction.id })
    .from(transaction)
    .where(
      and(
        eq(transaction.id, id),
        eq(transaction.userId, u.id),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "failed"),
      ),
    );

  if (rows.length === 0) return fail(c, "Заявка не найдена", 404);

  await db.delete(transaction).where(eq(transaction.id, id));
  return c.json({ success: true });
});

wallet.post("/promo", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as { code?: string };
  const rawCode = String(body.code || "").trim().toUpperCase();

  if (!rawCode || rawCode.length < 3) {
    return fail(c, "Введите корректный промокод", 400);
  }

  const existing = await db
    .select()
    .from(promoActivation)
    .where(and(eq(promoActivation.userId, u.id), eq(promoActivation.code, rawCode)));

  if (existing.length > 0) {
    return fail(c, "Вы уже активировали этот промокод", 400);
  }

  const rewardAmount = PROMO_CODES[rawCode] || 500; // fallback promo reward

  try {
    const newBalance = await userCache.adjustUserBalance(u.id, rewardAmount);
    const now = new Date();

    await db.insert(promoActivation).values({
      id: crypto.randomUUID(),
      userId: u.id,
      code: rawCode,
      amount: rewardAmount,
      createdAt: now,
    });

    await db.insert(transaction).values({
      id: crypto.randomUUID(),
      userId: u.id,
      type: "bonus",
      amount: rewardAmount,
      status: "success",
      method: "Промокод",
      details: rawCode,
      createdAt: now,
    });

    void achievementEngine.recordEvent(u.id, "promo");
    userCache.addXp(u.id, xpForBonusMoney(rewardAmount)).catch((e) => {
      console.warn("[Wallet] addXp error:", e);
    });

    return c.json({
      success: true,
      balance: newBalance,
      rewardAmount,
      message: `Промокод успешно активирован! +${rewardAmount.toLocaleString("ru-RU")} ₽`,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }
});

wallet.get("/transactions", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const activeTab = c.req.query("tab") || "all";

  // Fetch financial transactions
  const txs = await db
    .select()
    .from(transaction)
    .where(eq(transaction.userId, u.id))
    .orderBy(desc(transaction.createdAt));

  // Fetch game rounds
  const [slotsList, crashList, minesList, casesList, blockblastList, minedropList] = await Promise.all([
    db.select().from(slotsRound).where(eq(slotsRound.userId, u.id)).orderBy(desc(slotsRound.createdAt)),
    db.select().from(crashRound).where(eq(crashRound.userId, u.id)).orderBy(desc(crashRound.createdAt)),
    db.select().from(minesRound).where(eq(minesRound.userId, u.id)).orderBy(desc(minesRound.createdAt)),
    db.select().from(casesRound).where(eq(casesRound.userId, u.id)).orderBy(desc(casesRound.createdAt)),
    db.select().from(blockblastRound).where(eq(blockblastRound.userId, u.id)).orderBy(desc(blockblastRound.createdAt)),
    db.select().from(minedropRound).where(eq(minedropRound.userId, u.id)).orderBy(desc(minedropRound.createdAt)),
  ]);

  const items: WalletHistoryItem[] = [];

  for (const t of txs) {
    if (t.type === "deposit") {
      items.push({
        id: t.id,
        type: "deposit",
        category: "deposits",
        title: "Пополнение баланса",
        subtitle: t.method || "СБП",
        amount: t.amount,
        status: t.status as 'success' | 'pending' | 'failed',
        createdAt: t.createdAt.toISOString(),
      });
    } else if (t.type === "bonus") {
      items.push({
        id: t.id,
        type: "bonus",
        category: "bonuses",
        title: "Зачисление бонуса",
        subtitle: t.details ? `${t.method}: ${t.details}` : t.method || "Бонус",
        amount: t.amount,
        status: t.status as 'success' | 'pending' | 'failed',
        createdAt: t.createdAt.toISOString(),
      });
    }
  }

  for (const s of slotsList) {
    const isWin = s.outcome === "win";
    const netChange = s.payout - s.bet;
    items.push({
      id: s.id,
      type: isWin ? "win" : "loss",
      category: "games",
      title: `Слоты (${s.mode === "mega" ? "Mega" : "Classic"})`,
      subtitle: `Ставка ${s.bet.toLocaleString("ru-RU")} ₽ • x${s.multiplier}`,
      amount: netChange !== 0 ? netChange : -s.bet,
      status: "success",
      createdAt: s.createdAt.toISOString(),
    });
  }

  for (const cr of crashList) {
    const isWin = cr.outcome === "win";
    const netChange = cr.payout - cr.bet;
    items.push({
      id: cr.id,
      type: isWin ? "win" : "loss",
      category: "games",
      title: "Crash",
      subtitle: `Ставка ${cr.bet.toLocaleString("ru-RU")} ₽ • x${cr.multiplier || cr.crashPoint}`,
      amount: netChange !== 0 ? netChange : -cr.bet,
      status: "success",
      createdAt: cr.createdAt.toISOString(),
    });
  }

  for (const m of minesList) {
    const isWin = m.outcome === "win";
    const netChange = m.payout - m.bet;
    items.push({
      id: m.id,
      type: isWin ? "win" : "loss",
      category: "games",
      title: `Mines (${m.mines} мин)`,
      subtitle: `Ставка ${m.bet.toLocaleString("ru-RU")} ₽ • x${m.multiplier}`,
      amount: netChange !== 0 ? netChange : -m.bet,
      status: "success",
      createdAt: m.createdAt.toISOString(),
    });
  }

  for (const c of casesList) {
    const isWin = c.outcome === "win";
    const netChange = c.payout - c.bet;
    items.push({
      id: c.id,
      type: isWin ? "win" : "loss",
      category: "games",
      title: "Кейсы",
      subtitle: `Ставка ${c.bet.toLocaleString("ru-RU")} ₽ • x${c.multiplier}`,
      amount: netChange !== 0 ? netChange : -c.bet,
      status: "success",
      createdAt: c.createdAt.toISOString(),
    });
  }

  for (const b of blockblastList) {
    const isWin = b.outcome === "win";
    const netChange = b.payout - b.bet;
    items.push({
      id: b.id,
      type: isWin ? "win" : "loss",
      category: "games",
      title: "BlockBlast",
      subtitle: `Ставка ${b.bet.toLocaleString("ru-RU")} ₽ • x${b.multiplier}`,
      amount: netChange !== 0 ? netChange : -b.bet,
      status: "success",
      createdAt: b.createdAt.toISOString(),
    });
  }

  for (const md of minedropList) {
    const isWin = md.outcome === "win";
    const netChange = md.payout - md.bet;
    items.push({
      id: md.id,
      type: isWin ? "win" : "loss",
      category: "games",
      title: "MineDrop",
      subtitle: `Ставка ${md.bet.toLocaleString("ru-RU")} ₽ • x${md.multiplier}`,
      amount: netChange !== 0 ? netChange : -md.bet,
      status: "success",
      createdAt: md.createdAt.toISOString(),
    });
  }

  // Sort all items chronologically descending
  items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Calculate tab counts
  const counts = {
    all: items.length,
    games: items.filter((i) => i.category === "games").length,
    bonuses: items.filter((i) => i.category === "bonuses").length,
    wins: items.filter((i) => i.amount > 0 && (i.type === "win" || i.category === "bonuses" || i.category === "deposits")).length,
    deposits: items.filter((i) => i.category === "deposits").length,
    withdrawals: 0,
    losses: items.filter((i) => i.amount < 0).length,
  };

  let filteredItems = items;
  if (activeTab === "games") {
    filteredItems = items.filter((i) => i.category === "games");
  } else if (activeTab === "bonuses") {
    filteredItems = items.filter((i) => i.category === "bonuses");
  } else if (activeTab === "wins") {
    filteredItems = items.filter((i) => i.amount > 0);
  } else if (activeTab === "deposits") {
    filteredItems = items.filter((i) => i.category === "deposits");
  } else if (activeTab === "losses") {
    filteredItems = items.filter((i) => i.amount < 0);
  }

  return c.json({
    items: filteredItems,
    counts,
  });
});

export default wallet;
