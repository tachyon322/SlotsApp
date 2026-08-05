import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { transaction, promoActivation, payment as paymentTable, slotsRound, crashRound, minesRound, casesRound, blockblastRound, minedropRound } from "../db/schema";
import { auth } from "../lib/auth";
import { userCache } from "../lib/userCache";
import { createDepositPayment, getPaymentStatus, EXPRESSAPP_TERMINAL_STATUSES, ExpressAppPaymentStatus } from "../lib/expressapp";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const wallet = new Hono<{ Variables: Variables }>();

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

const PROMO_CODES: Record<string, number> = {
  WELCOME1000: 1000,
  KAZIK2026: 5000,
  BONUS500: 500,
  SLOTS2026: 2000,
  SWBOT: 1500,
};

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
  };

  const amount = Math.floor(Number(body.amount));
  if (!Number.isFinite(amount) || amount < 2000) {
    return fail(c, "Минимальная сумма пополнения — 2,000 ₽", 400);
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
      status = remote.status;
      await db
        .update(paymentTable)
        .set({ status: remote.status, updatedAt: new Date() })
        .where(eq(paymentTable.id, payment.id));
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

  try {
    const profile = await userCache.getUserProfile(u.id);
    const currentBalance = profile?.balance ?? 0;

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
    } else if (t.type === "withdrawal") {
      items.push({
        id: t.id,
        type: "withdrawal",
        category: "withdrawals",
        title: "Выплата средств",
        subtitle: `${t.method || "Вывод"}${t.details ? ` • ${t.details}` : ''}`,
        amount: -t.amount,
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
    withdrawals: items.filter((i) => i.category === "withdrawals").length,
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
  } else if (activeTab === "withdrawals") {
    filteredItems = items.filter((i) => i.category === "withdrawals");
  } else if (activeTab === "losses") {
    filteredItems = items.filter((i) => i.amount < 0);
  }

  return c.json({
    items: filteredItems,
    counts,
  });
});

export default wallet;
