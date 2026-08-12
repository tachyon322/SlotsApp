import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { user as userTable, transaction, promoActivation, payment as paymentTable, slotsRound, crashRound, minesRound, casesRound, blockblastRound, minedropRound } from "../db/schema";
import { auth } from "../lib/auth";
import { redis } from "../lib/redis";
import { userCache } from "../lib/userCache";
import { creditDeposit } from "../lib/depositCredit";
import { createDepositPayment, getPaymentStatus, EXPRESSAPP_TERMINAL_STATUSES, ExpressAppPaymentStatus } from "../lib/expressapp";
import { achievementEngine } from "../lib/achievementEngine";
import { xpForBonusMoney } from "../lib/levels";
import { getMinDeposit } from "../lib/config";
import { affiliateService } from "../affiliate/service";

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
  const rows = await db
    .select({ id: transaction.id })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "failed"),
      ),
    );

  for (const row of rows) {
    await refundWithdrawRequest(userId, row.id);
  }
}

async function refundWithdrawRequest(userId: string, id: string): Promise<boolean> {
  // Claim the row before crediting the balance so concurrent cancellation requests
  // cannot return the same withdrawal twice.
  const claimed = await db
    .update(transaction)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(transaction.id, id),
        eq(transaction.userId, userId),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "failed"),
      ),
    )
    .returning({ amount: transaction.amount, balanceDebited: transaction.balanceDebited });

  if (claimed.length === 0) return false;

  try {
    if (claimed[0].balanceDebited) {
      await userCache.adjustUserBalance(userId, claimed[0].amount);
    }
    await db.delete(transaction).where(and(eq(transaction.id, id), eq(transaction.status, "cancelled")));
    return true;
  } catch (error) {
    await db
      .update(transaction)
      .set({ status: "failed" })
      .where(and(eq(transaction.id, id), eq(transaction.status, "cancelled")))
      .catch(() => {});
    throw error;
  }
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
    balanceDebited: true,
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

export async function hasSuccessfulDeposit(userId: string): Promise<boolean> {
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

export async function hasPaidVerification(userId: string): Promise<boolean> {
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

export async function getUserGateState(userId: string): Promise<{
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
  const stable =
    status === "AWAITING_RECEIPT" ||
    EXPRESSAPP_TERMINAL_STATUSES.has(status as ExpressAppPaymentStatus);
  if (payment.paymentId && !stable) {
    try {
      const remote = await getPaymentStatus(payment.paymentId);
      // PAID is transitioned exclusively by the webhook (which also handles the
      // receipt gate). Surfacing it here would let the client stop polling before
      // the deposit is actually credited.
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
    credited: payment.credited,
  });
});

wallet.post("/payment/:id/receipt", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const paymentId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { url?: string };
  const url = (body.url || "").trim();
  if (!url || url.length > 2048) {
    return fail(c, "Некорректная ссылка на чек", 400);
  }

  const rows = await db
    .select()
    .from(paymentTable)
    .where(and(eq(paymentTable.id, paymentId), eq(paymentTable.userId, u.id)));

  const payment = rows[0];
  if (!payment) return fail(c, "Платёж не найден", 404);
  if (payment.credited || payment.status === "PAID") {
    return fail(c, "Платёж уже подтверждён", 400);
  }
  if (payment.status !== "NEW" && payment.status !== "PENDING" && payment.status !== "AWAITING_RECEIPT") {
    return fail(c, "Чек можно прикрепить только к активному платежу", 400);
  }

  const now = new Date();

  // Store the receipt (idempotent for the same payment).
  await db
    .update(paymentTable)
    .set({ receiptUrl: url, receiptUploadedAt: now, updatedAt: now })
    .where(eq(paymentTable.id, payment.id));

  // If the provider has already confirmed the transfer, credit the balance now.
  const freshRows = await db
    .select()
    .from(paymentTable)
    .where(eq(paymentTable.id, payment.id));
  const fresh = freshRows[0];

  if (fresh && fresh.status === "AWAITING_RECEIPT" && !fresh.credited) {
    const claimed = await db
      .update(paymentTable)
      .set({ credited: true, status: "PAID", updatedAt: now })
      .where(
        and(
          eq(paymentTable.id, payment.id),
          eq(paymentTable.status, "AWAITING_RECEIPT"),
          eq(paymentTable.credited, false),
        ),
      )
      .returning({ id: paymentTable.id });

    if (claimed.length > 0) {
      const method = payment.method === "card" ? "Банковская карта" : "СБП";
      await creditDeposit(u.id, fresh.amount, method, now);
      return c.json({ ok: true, status: "PAID", credited: true });
    }
  }

  return c.json({
    ok: true,
    status: fresh?.status ?? payment.status,
    credited: false,
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

  await clearWithdrawRequests(u.id);
  let reservedBalance = false;
  try {
    const currentBalance = await userCache.adjustUserBalance(u.id, -amount);
    reservedBalance = true;

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

    await db.insert(transaction).values({
      id: crypto.randomUUID(),
      userId: u.id,
      type: "withdrawal",
      amount,
      status: "pending",
      balanceDebited: true,
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
    if (reservedBalance) {
      await userCache.adjustUserBalance(u.id, amount).catch(() => {});
    }
    const msg = (e as Error).message;
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    if (msg === "insufficient_balance") return fail(c, "Недостаточно средств", 402);
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
      await refundWithdrawRequest(u.id, row.id);
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

  await refundWithdrawRequest(u.id, id);
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

  // Affiliate promo codes (stored in DB) take priority over legacy hardcoded ones.
  const affiliatePromo = await affiliateService.resolvePromoCode(rawCode);
  if (affiliatePromo) {
    try {
      const newBalance = await affiliateService.activatePromo(
        u.id,
        affiliatePromo.sourceId,
        rawCode,
        affiliatePromo.amount,
      );
      return c.json({
        success: true,
        balance: newBalance,
        rewardAmount: affiliatePromo.amount,
        message: `Промокод успешно активирован! +${affiliatePromo.amount.toLocaleString("ru-RU")} ₽`,
      });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
      throw e;
    }
  }

  const rewardAmount = PROMO_CODES[rawCode];
  if (rewardAmount == null) {
    return fail(c, "Промокод не найден", 400);
  }

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

const HISTORY_COUNTS_TTL_SECONDS = 5;
const historyCountsKey = (userId: string) => `wallet:history:counts:${userId}`;

type WalletCounts = {
  all: number;
  games: number;
  bonuses: number;
  wins: number;
  deposits: number;
  withdrawals: number;
  losses: number;
};

type GameKind = "slots" | "crash" | "mines" | "cases" | "blockblast" | "minedrop";

type GameUnionRow = {
  id: string;
  bet: number;
  payout: number;
  multiplier: number;
  outcome: string;
  createdAt: Date;
  kind: GameKind;
  mode: string | null;
  mines: number | null;
  crashPoint: number | null;
};

// All six game tables share the columns needed to render the merged wallet feed.
// The nullable columns (mode/mines/crashPoint) exist on a single table each and
// are emitted as NULL on the others, keeping every UNION ALL branch identical.
const GAME_TABLES: { kind: GameKind; table: any }[] = [
  { kind: "slots", table: slotsRound },
  { kind: "crash", table: crashRound },
  { kind: "mines", table: minesRound },
  { kind: "cases", table: casesRound },
  { kind: "blockblast", table: blockblastRound },
  { kind: "minedrop", table: minedropRound },
];

function gameUnionRow(table: any, kind: GameKind, where: SQL | undefined, limit: number) {
  return db
    .select({
      id: table.id,
      bet: table.bet,
      payout: table.payout,
      multiplier: table.multiplier,
      outcome: table.outcome,
      createdAt: table.createdAt,
      kind: sql<GameKind>`${kind}`.as("kind"),
      mode: kind === "slots" ? table.mode.as("mode") : sql<string | null>`NULL::text`.as("mode"),
      mines: kind === "mines" ? table.mines.as("mines") : sql<number | null>`NULL::int`.as("mines"),
      crashPoint: kind === "crash" ? table.crashPoint.as("crashPoint") : sql<number | null>`NULL::float8`.as("crashPoint"),
    })
    .from(table)
    .where(where)
    .orderBy(desc(table.createdAt), desc(table.id))
    .limit(limit);
}

// The merged game feed is a single UNION ALL over the six tables with one global
// keyset pagination + ordering, so a wallet request touches at most 2 connections
// instead of 7 (previously one SELECT per table). Every branch is capped by its
// own ORDER BY + LIMIT so PostgreSQL reads at most `limit` rows per table instead
// of the user's full history; the final global LIMIT still returns the correct top.
function queryGameUnion(where: (table: any) => SQL | undefined, limit: number): Promise<GameUnionRow[]> {
  const branches = GAME_TABLES.map(({ kind, table }) => gameUnionRow(table, kind, where(table), limit));
  const [first, second, third, fourth, fifth, sixth] = branches as [
    any, any, any, any, any, any,
  ];
  const firstTable = GAME_TABLES[0].table;
  const result = first
    .unionAll(second)
    .unionAll(third)
    .unionAll(fourth)
    .unionAll(fifth)
    .unionAll(sixth)
    .orderBy(desc(firstTable.createdAt), desc(firstTable.id))
    .limit(limit);
  return result as Promise<GameUnionRow[]>;
}

function gameTitle(row: GameUnionRow): string {
  switch (row.kind) {
    case "slots":
      return `Слоты (${row.mode === "mega" ? "Mega" : "Classic"})`;
    case "crash":
      return "Crash";
    case "mines":
      return `Mines (${row.mines} мин)`;
    case "cases":
      return "Кейсы";
    case "blockblast":
      return "BlockBlast";
    case "minedrop":
      return "MineDrop";
  }
}

// Counts are two queries: one aggregate over a UNION ALL of the game tables and
// one over transactions. Previously the route issued 15 COUNT queries, which
// saturated the connection pool. Results are cached in Redis (TTL below).
async function computeWalletHistoryCounts(userId: string): Promise<WalletCounts> {
  const [gameAgg, financialRows] = await Promise.all([
    db.execute<{ total: number; wins: number }>(sql`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE payout > bet)::int AS wins
      FROM (
        SELECT bet, payout FROM ${slotsRound} WHERE user_id = ${userId}
        UNION ALL SELECT bet, payout FROM ${crashRound} WHERE user_id = ${userId}
        UNION ALL SELECT bet, payout FROM ${minesRound} WHERE user_id = ${userId}
        UNION ALL SELECT bet, payout FROM ${casesRound} WHERE user_id = ${userId}
        UNION ALL SELECT bet, payout FROM ${blockblastRound} WHERE user_id = ${userId}
        UNION ALL SELECT bet, payout FROM ${minedropRound} WHERE user_id = ${userId}
      ) g
    `),
    db
      .select({
        financial: sql<number>`count(*) FILTER (WHERE ${transaction.type} IN ('deposit', 'bonus'))`,
        bonuses: sql<number>`count(*) FILTER (WHERE ${transaction.type} = 'bonus')`,
        deposits: sql<number>`count(*) FILTER (WHERE ${transaction.type} = 'deposit')`,
      })
      .from(transaction)
      .where(eq(transaction.userId, userId)),
  ]);

  const gameCount = Number(gameAgg.rows[0]?.total || 0);
  const winCount = Number(gameAgg.rows[0]?.wins || 0);
  const financialCount = Number(financialRows[0]?.financial || 0);

  return {
    all: financialCount + gameCount,
    games: gameCount,
    bonuses: Number(financialRows[0]?.bonuses || 0),
    wins: winCount + financialCount,
    deposits: Number(financialRows[0]?.deposits || 0),
    withdrawals: 0,
    losses: gameCount - winCount,
  };
}

async function getWalletHistoryCounts(userId: string): Promise<WalletCounts> {
  const key = historyCountsKey(userId);
  try {
    const cached = await redis.get(key);
    if (cached) return JSON.parse(cached) as WalletCounts;
  } catch {
    // cache read failure -> fall through to a fresh DB computation
  }
  const counts = await computeWalletHistoryCounts(userId);
  try {
    await redis.set(key, JSON.stringify(counts), "EX", HISTORY_COUNTS_TTL_SECONDS);
  } catch {
    // cache write failure is non-fatal
  }
  return counts;
}

wallet.get("/transactions", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const activeTab = c.req.query("tab") || "all";
  const pageSize = 50;
  const cursorRaw = c.req.query("cursor");

  type HistoryCursor = { createdAt: string; id: string };
  let cursor: HistoryCursor | null = null;
  if (cursorRaw) {
    try {
      const parsed = JSON.parse(decodeURIComponent(cursorRaw)) as Partial<HistoryCursor>;
      if (typeof parsed.createdAt === "string" && typeof parsed.id === "string") {
        cursor = { createdAt: parsed.createdAt, id: parsed.id };
      }
    } catch {
      return fail(c, "Некорректный курсор истории", 400);
    }
  }

  // Keyset pagination keeps every query bounded and avoids the growing cost of OFFSET.
  const afterCursor = (createdAt: any, id: any): SQL | undefined => {
    if (!cursor) return undefined;
    const date = new Date(cursor.createdAt);
    if (Number.isNaN(date.getTime())) return undefined;
    return or(
      lt(createdAt, date),
      and(eq(createdAt, date), lt(id, cursor.id)),
    );
  };

  // Tab filtering happens in SQL so pagination stays consistent and records are
  // never dropped after the cursor (previously filtered in JS after fetching).
  const gameWhere = (table: any, outcomeFilter?: SQL): SQL | undefined =>
    and(eq(table.userId, u.id), afterCursor(table.createdAt, table.id), outcomeFilter);
  const txWhere = (types: string[]): SQL | undefined =>
    and(eq(transaction.userId, u.id), inArray(transaction.type, types), afterCursor(transaction.createdAt, transaction.id));

  const txPage = (where: SQL | undefined) =>
    db
      .select()
      .from(transaction)
      .where(where)
      .orderBy(desc(transaction.createdAt), desc(transaction.id))
      .limit(pageSize + 1);

  const winCondition = (table: any) => sql`${table.payout} > ${table.bet}`;
  const lossCondition = (table: any) => sql`${table.payout} <= ${table.bet}`;

  let gameRows: GameUnionRow[] = [];
  let txRows: (typeof transaction.$inferSelect)[] = [];

  if (activeTab === "games") {
    gameRows = await queryGameUnion((t) => gameWhere(t), pageSize + 1);
  } else if (activeTab === "wins") {
    [gameRows, txRows] = await Promise.all([
      queryGameUnion((t) => gameWhere(t, winCondition(t)), pageSize + 1),
      txPage(txWhere(["deposit", "bonus"])),
    ]);
  } else if (activeTab === "losses") {
    gameRows = await queryGameUnion((t) => gameWhere(t, lossCondition(t)), pageSize + 1);
  } else if (activeTab === "deposits") {
    txRows = await txPage(txWhere(["deposit"]));
  } else if (activeTab === "bonuses") {
    txRows = await txPage(txWhere(["bonus"]));
  } else {
    [gameRows, txRows] = await Promise.all([
      queryGameUnion((t) => gameWhere(t), pageSize + 1),
      txPage(txWhere(["deposit", "bonus"])),
    ]);
  }

  const hasMore = gameRows.length + txRows.length > pageSize;
  const pageGames = gameRows.slice(0, pageSize);
  const pageTxs = txRows.slice(0, pageSize);

  const items: WalletHistoryItem[] = [];

  for (const t of pageTxs) {
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

  for (const g of pageGames) {
    const isWin = g.outcome === "win";
    const netChange = g.payout - g.bet;
    items.push({
      id: g.id,
      type: isWin ? "win" : "loss",
      category: "games",
      title: gameTitle(g),
      subtitle: `Ставка ${g.bet.toLocaleString("ru-RU")} ₽ • x${(g.multiplier || g.crashPoint || 0).toFixed(2)}`,
      amount: netChange !== 0 ? netChange : -g.bet,
      status: "success",
      createdAt: g.createdAt.toISOString(),
    });
  }

  // Sort chronologically descending, breaking ties by id so the merged order
  // matches the keyset predicate (created_at DESC, id DESC) exactly.
  items.sort((a, b) => {
    const byTime = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    if (byTime !== 0) return byTime;
    return b.id.localeCompare(a.id);
  });

  // Tab badge counts: served from a short-lived Redis cache so tab switches and
  // "show more" pagination don't re-run the count queries against the DB.
  const counts = await getWalletHistoryCounts(u.id);

  const filteredItems = items.slice(0, pageSize);

  return c.json({
    items: filteredItems,
    counts,
    nextCursor: hasMore && filteredItems.length > 0
      ? encodeURIComponent(JSON.stringify({
          createdAt: filteredItems[filteredItems.length - 1].createdAt,
          id: filteredItems[filteredItems.length - 1].id,
        }))
      : null,
  });
});

export default wallet;
