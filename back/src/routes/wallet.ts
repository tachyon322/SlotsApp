import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { transaction, promoActivation, slotsRound, crashRound, minesRound } from "../db/schema";
import { auth } from "../lib/auth";
import { userCache } from "../lib/userCache";

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

wallet.post("/deposit", async (c) => {
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

  const method = body.method || "СБП";
  const bonusAmount = amount; // 100% deposit bonus
  const totalAmount = amount + bonusAmount;

  try {
    const newBalance = await userCache.adjustUserBalance(u.id, totalAmount);
    const now = new Date();

    await db.insert(transaction).values([
      {
        id: crypto.randomUUID(),
        userId: u.id,
        type: "deposit",
        amount,
        status: "success",
        method,
        details: "Пополнение баланса",
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        userId: u.id,
        type: "bonus",
        amount: bonusAmount,
        status: "success",
        method: "Бонус 100%",
        details: "Бонус за депозит",
        createdAt: new Date(now.getTime() + 10),
      },
    ]);

    return c.json({
      success: true,
      balance: newBalance,
      amount,
      bonus: bonusAmount,
    });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }
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
  const [slotsList, crashList, minesList] = await Promise.all([
    db.select().from(slotsRound).where(eq(slotsRound.userId, u.id)).orderBy(desc(slotsRound.createdAt)),
    db.select().from(crashRound).where(eq(crashRound.userId, u.id)).orderBy(desc(crashRound.createdAt)),
    db.select().from(minesRound).where(eq(minesRound.userId, u.id)).orderBy(desc(minesRound.createdAt)),
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
