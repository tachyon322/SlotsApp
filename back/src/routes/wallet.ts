import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, desc, eq, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db";
import { user as userTable, transaction, promoActivation, payment as paymentTable, slotsRound, crashRound, minesRound, casesRound, blockblastRound, minedropRound, verificationAttempt } from "../db/schema";
import { auth } from "../lib/auth";
import { redis } from "../lib/redis";
import { userCache } from "../lib/userCache";
// import { creditDeposit } from "../lib/depositCredit"; // ОТКЛЮЧЕНО: приём чеков выключен
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

const STALE_WITHDRAW_INTENT_TIMEOUT_MS = 10 * 60 * 1000;
const WITHDRAWAL_PROCESSING_TIMEOUT_MS = 10 * 1000;
const SWEEP_INTERVAL_MS = 30 * 1000;

function parseWithdrawalDetails(details: string | null): {
  code?: WithdrawRejectCode;
  requisites?: string;
} {
  if (!details) return {};

  try {
    const parsed = JSON.parse(details) as { code?: unknown; requisites?: unknown };
    if (
      parsed.code === "need_deposit" ||
      parsed.code === "need_verification" ||
      parsed.code === "need_premium" ||
      parsed.code === "verification_pending"
    ) {
      return {
        code: parsed.code,
        requisites: typeof parsed.requisites === "string" ? parsed.requisites : undefined,
      };
    }
  } catch {
    // Active requests keep plain requisites in details.
  }

  return { requisites: details };
}

// Intent-first rows are inserted BEFORE the debit. If the process dies between
// the two, the row stays pending with balanceDebited=false forever and blocks
// the user with 409. The sweep moves stale intents to failed; the debit marker
// (written atomically with the balance change) decides whether money must come
// back, so a swept row can never silently lose a debit or refund one that never
// happened. Claim (pending -> failed) happens BEFORE the refund so an in-flight
// /withdraw that just flagged the row can never be double-refunded.
export async function sweepStaleWithdrawIntents(): Promise<number> {
  const staleBefore = new Date(Date.now() - STALE_WITHDRAW_INTENT_TIMEOUT_MS);

  const claimed = await db
    .update(transaction)
    .set({ status: "failed" })
    .where(
      and(
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "pending"),
        eq(transaction.balanceDebited, false),
        lt(transaction.createdAt, staleBefore),
      ),
    )
    .returning({ id: transaction.id, userId: transaction.userId, amount: transaction.amount });

  for (const row of claimed) {
    try {
      const refunded = await userCache.refundIfDebited(row.userId, row.amount, row.id);
      if (refunded) {
        console.warn(
          `[Wallet] Stale withdraw intent swept WITH refund: ${row.id} (user ${row.userId}, ${row.amount} ₽)`,
        );
      } else {
        console.warn(`[Wallet] Stale withdraw intent swept, no debit: ${row.id} (user ${row.userId})`);
      }
    } catch (err) {
      // Marker untouched (atomic script failed before mutating): the row is
      // terminal but the next /withdraw of this user retries the refund via
      // clearWithdrawRequests -> refundWithdrawRequest. Visible in logs.
      console.error(`[Wallet] Stale withdraw intent sweep refund failed for ${row.id}:`, err);
    }
  }

  return claimed.length + (await settleExpiredWithdrawals());
}

export function startWithdrawIntentSweeper(): Timer {
  void sweepStaleWithdrawIntents().catch((e) => {
    console.error("[Wallet] initial withdraw intent sweep failed:", e);
  });
  return setInterval(() => {
    void sweepStaleWithdrawIntents().catch((e) => {
      console.error("[Wallet] withdraw intent sweep failed:", e);
    });
  }, SWEEP_INTERVAL_MS);
}

async function clearWithdrawRequests(userId: string): Promise<void> {
  const rows = await db
    .select({ id: transaction.id, details: transaction.details, createdAt: transaction.createdAt })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "failed"),
      ),
    );

  const gates = await getUserGateState(userId);
  const hasAnyAttempt = await hasAnyVerificationAttempt(userId);
  const hasAnyPaid = await hasPaidVerification(userId);
  for (const row of rows) {
    const code = parseWithdrawalDetails(row.details).code;
    // Легкий план: не авто-закрывать заявку с verificationFailed (данные неточны) —
    // она закрывается только по клику «Подробнее» -> cancel
    if ((code === "need_verification" || code === "verification_pending") && !gates.verifiedForPayment && (hasAnyAttempt || hasAnyPaid)) {
      continue;
    }
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
      // Row is kept for the audit trail; balanceDebited flips to false so the
      // refund is visible in history instead of vanishing without a trace.
      await db
        .update(transaction)
        .set({ balanceDebited: false })
        .where(and(eq(transaction.id, id), eq(transaction.status, "cancelled")))
        .catch(() => {});
    } else {
      // Crash-window intent: debit happened but the flag never landed (or a
      // sweep refund failed). The marker is the only proof — consume it
      // atomically with the refund, so this retry can neither double-refund
      // nor miss the debit.
      await userCache.refundIfDebited(userId, claimed[0].amount, id);
    }
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

async function isWithdrawGateSatisfied(
  userId: string,
  code: WithdrawRejectCode,
  failedAt?: Date,
): Promise<boolean> {
  if (code === "need_deposit") return hasSuccessfulDeposit(userId);
  if (code === "need_verification" || code === "verification_pending") {
    const gates = await getUserGateState(userId);
    if (gates.verifiedForPayment) return true;
    return failedAt ? hasPaidVerificationAfter(userId, failedAt) : false;
  }
  const gates = await getUserGateState(userId);
  return gates.premiumActive;
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

async function hasPaidVerificationAfter(userId: string, after: Date): Promise<boolean> {
  const rows = await db
    .select({ id: paymentTable.id })
    .from(paymentTable)
    .where(
      and(
        eq(paymentTable.userId, userId),
        eq(paymentTable.purpose, "verification"),
        eq(paymentTable.status, "PAID"),
        eq(paymentTable.credited, true),
        // updatedAt is the time the provider confirmed the real SBP payment.
        sql`${paymentTable.updatedAt} > ${after}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function hasVerificationAttemptAfter(userId: string, after: Date): Promise<boolean> {
  const rows = await db
    .select({ id: verificationAttempt.id })
    .from(verificationAttempt)
    .where(
      and(
        eq(verificationAttempt.userId, userId),
        sql`${verificationAttempt.createdAt} > ${after}`,
      ),
    )
    .limit(1);
  return rows.length > 0;
}

async function hasAnyVerificationAttempt(userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: verificationAttempt.id })
    .from(verificationAttempt)
    .where(eq(verificationAttempt.userId, userId))
    .limit(1);
  return rows.length > 0;
}

async function latestVerificationFailure(userId: string): Promise<Date | null> {
  const rows = await db
    .select({ createdAt: transaction.createdAt, details: transaction.details })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "failed"),
      ),
    )
    .orderBy(desc(transaction.createdAt))
    .limit(50);

  for (const row of rows) {
    const code = parseWithdrawalDetails(row.details).code;
    if (code === "need_verification" || code === "verification_pending") {
      return row.createdAt;
    }
  }

  return null;
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

async function recoverWithdrawalRefunds(userId?: string): Promise<void> {
  const rows = await db
    .select({ id: transaction.id, userId: transaction.userId, amount: transaction.amount })
    .from(transaction)
    .where(
      and(
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "refund_pending"),
        userId ? eq(transaction.userId, userId) : undefined,
      ),
    );

  for (const row of rows) {
    try {
      const refunded = await userCache.refundIfDebited(row.userId, row.amount, row.id);
      if (!refunded) {
        console.warn(`[Wallet] Refund marker missing for expired withdrawal ${row.id}`);
      }
      await db
        .update(transaction)
        .set({ status: "failed", balanceDebited: false })
        .where(and(eq(transaction.id, row.id), eq(transaction.status, "refund_pending")));
    } catch (error) {
      console.error(`[Wallet] Expired withdrawal refund failed for ${row.id}:`, error);
    }
  }
}

async function settleExpiredWithdrawals(userId?: string): Promise<number> {
  await recoverWithdrawalRefunds(userId);

  const now = new Date();
  const rows = await db
    .select({
      id: transaction.id,
      userId: transaction.userId,
      amount: transaction.amount,
      details: transaction.details,
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "pending"),
        eq(transaction.balanceDebited, true),
        lt(transaction.createdAt, new Date(now.getTime() - WITHDRAWAL_PROCESSING_TIMEOUT_MS)),
        userId ? eq(transaction.userId, userId) : undefined,
      ),
    )
    .orderBy(transaction.createdAt)
    .limit(200);

  let settled = 0;

  for (const row of rows) {
    const gates = await getUserGateState(row.userId);

    if (gates.verifiedForPayment) {
      const completed = await db
        .update(transaction)
        .set({ status: "success" })
        .where(
          and(
            eq(transaction.id, row.id),
            eq(transaction.status, "pending"),
            eq(transaction.balanceDebited, true),
          ),
        )
        .returning({ id: transaction.id });
      settled += completed.length;
      continue;
    }

    const failed = await db
      .update(transaction)
      .set({
        status: "refund_pending",
        details: JSON.stringify({
          code: "need_verification",
          requisites: parseWithdrawalDetails(row.details).requisites ?? row.details,
          message: "Верификация реквизитов не подтверждена",
        }),
      })
      .where(
        and(
          eq(transaction.id, row.id),
          eq(transaction.status, "pending"),
          eq(transaction.balanceDebited, true),
        ),
      )
      .returning({ id: transaction.id });

    if (failed.length > 0) {
      await recoverWithdrawalRefunds(row.userId);
      settled += 1;
    }
  }

  return settled;
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

// ==== ОТКЛЮЧЕНО: приём чеков выключен ====
/*
wallet.post("/payment/:id/receipt", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const paymentId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as { url?: string };
  const url = (body.url || "").trim();
  console.log(
    "[Wallet] receipt attach request:",
    JSON.stringify({ paymentId, userId: u.id, hasUrl: Boolean(url), urlLength: url.length }),
  );
  if (!url || url.length > 2048) {
    return fail(c, "Некорректная ссылка на чек", 400);
  }

  const rows = await db
    .select()
    .from(paymentTable)
    .where(and(eq(paymentTable.id, paymentId), eq(paymentTable.userId, u.id)));

  const payment = rows[0];
  if (!payment) {
    console.log("[Wallet] receipt attach: payment not found", paymentId);
    return fail(c, "Платёж не найден", 404);
  }
  if (payment.credited || payment.status === "PAID") {
    console.log("[Wallet] receipt attach rejected: already credited", paymentId);
    return fail(c, "Платёж уже подтверждён", 400);
  }
  if (EXPRESSAPP_TERMINAL_STATUSES.has(payment.status as ExpressAppPaymentStatus)) {
    console.log("[Wallet] receipt attach rejected: terminal status", paymentId, payment.status);
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
      console.log("[Wallet] receipt attach: credited", paymentId);
      return c.json({ ok: true, status: "PAID", credited: true });
    }
  }

  console.log("[Wallet] receipt attach: stored, awaiting credit", paymentId, fresh?.status ?? payment.status);
  return c.json({
    ok: true,
    status: fresh?.status ?? payment.status,
    credited: false,
  });
});
*/

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

wallet.get("/withdraw/active", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  await settleExpiredWithdrawals(u.id);

  const [rows, gates] = await Promise.all([
    db
      .select()
      .from(transaction)
      .where(
        and(
          eq(transaction.userId, u.id),
          eq(transaction.type, "withdrawal"),
          eq(transaction.status, "pending"),
        ),
      )
      .orderBy(desc(transaction.createdAt))
      .limit(1),
    getUserGateState(u.id),
  ]);

  const row = rows[0];

  return c.json({
    request: row
      ? {
          id: row.id,
          amount: row.amount,
          method: row.method,
          details: row.details,
          createdAt: row.createdAt.toISOString(),
          processingUntil: new Date(
            row.createdAt.getTime() + WITHDRAWAL_PROCESSING_TIMEOUT_MS,
          ).toISOString(),
        }
      : null,
    ...gates,
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

  await settleExpiredWithdrawals(u.id);

  // New funnel: deposit -> withdraw (pending 5min) -> verification.
  // Only deposit is checked synchronously. Verification is handled via delayed settlement.
  if (!(await hasSuccessfulDeposit(u.id))) {
    return fail(
      c,
      "Вывод доступен только для тех пользователей, совершивших хотя бы один депозит",
      403,
      "need_deposit",
    );
  }

  const gates = await getUserGateState(u.id);
  const previousVerificationFailure = await latestVerificationFailure(u.id);
  if (
    !gates.verifiedForPayment &&
    previousVerificationFailure &&
    !(await hasPaidVerificationAfter(u.id, previousVerificationFailure))
  ) {
    return fail(
      c,
      "Верификация реквизитов не подтверждена. Для повторной попытки пройдите верификацию заново",
      403,
      "need_verification",
    );
  }

  // Refund/cancel rejected attempts after the required new verification has
  // been paid. The failed row remains visible until that point.
  await clearWithdrawRequests(u.id);

  // Fast path: avoid insert/cleanup churn in the common case. The real guard
  // against parallel /withdraw calls is the unique partial index
  // transactions_one_pending_withdrawal_per_user (see below) — the loser of a
  // race simply gets zero rows from the insert and never debits.
  const existing = await db
    .select({ id: transaction.id })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, u.id),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "pending"),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return fail(c, "У вас уже есть активная заявка на вывод", 409, "withdrawal_pending");
  }

  // Intent-first: the pending row is created BEFORE the debit, so a crash
  // between the two can never leave money debited without a visible trace.
  // The unique partial index makes this insert race-proof: a concurrent
  // request conflicts, gets zero rows, and never debits the balance.
  const createdAt = new Date();
  const processingUntil = new Date(createdAt.getTime() + WITHDRAWAL_PROCESSING_TIMEOUT_MS);
  const intent = await db
    .insert(transaction)
    .values({
      id: crypto.randomUUID(),
      userId: u.id,
      type: "withdrawal",
      amount,
      status: "pending",
      balanceDebited: false,
      method: methodLabel,
      details: requisites,
      createdAt,
    })
    .onConflictDoNothing()
    .returning({ id: transaction.id });

  if (intent.length === 0) {
    return fail(c, "У вас уже есть активная заявка на вывод", 409, "withdrawal_pending");
  }

  let debited = false;
  try {
    // The debit writes a Redis marker atomically with the balance change, so
    // even a crash right after it leaves proof of the mutation. The recovery
    // sweep below uses that marker to refund instead of guessing — without it
    // a swept row would either silently lose the debit or refund money that
    // was never taken.
    const currentBalance = await userCache.debitForWithdraw(u.id, -amount, intent[0].id);
    debited = true;

    const flagged = await db
      .update(transaction)
      .set({ balanceDebited: true })
      .where(and(eq(transaction.id, intent[0].id), eq(transaction.status, "pending")))
      .returning({ id: transaction.id });

    if (flagged.length === 0) {
      // The recovery sweep claimed this intent while the debit was in flight —
      // the request is dead, so return the money. refundIfDebited is atomic
      // (GETDEL + credit): exactly one of us/sweep performs the refund.
      await userCache.refundIfDebited(u.id, amount, intent[0].id).catch((err) => {
        console.error("[Wallet] withdraw refund after swept intent failed:", err);
      });
      return fail(c, "Заявка устарела, попробуйте ещё раз", 409, "withdrawal_expired");
    }

    return c.json({
      success: true,
      balance: currentBalance,
      amount,
      processingUntil: processingUntil.toISOString(),
    });
  } catch (e) {
    if (debited) {
      // Money IS debited: keep the row as the audit trail and retry the flag.
      // A failed update here must not hide the debit from reconciles.
      const flagged = await db
        .update(transaction)
        .set({ balanceDebited: true })
        .where(and(eq(transaction.id, intent[0].id), eq(transaction.status, "pending")))
        .returning({ id: transaction.id })
        .catch((err) => {
          console.error("[Wallet] withdraw debited but could not mark balanceDebited:", err);
          return [];
        });

      if (flagged.length === 0) {
        // Swept while the debit was in flight: refund exactly once via the
        // atomic marker consume so the money doesn't stay debited on a dead
        // request.
        await userCache.refundIfDebited(u.id, amount, intent[0].id).catch((err) => {
          console.error("[Wallet] withdraw refund after swept intent failed:", err);
        });
        return fail(c, "Заявка устарела, попробуйте ещё раз", 409, "withdrawal_expired");
      }

      // The flag retry succeeded: debit and row are both recorded — the
      // request actually completed, so answer success instead of a 500 that
      // would make the client retry into a 409.
      const profile = await userCache.getUserProfile(u.id);
      return c.json({
        success: true,
        balance: profile?.balance ?? 0,
        amount,
        processingUntil: processingUntil.toISOString(),
      });
    } else {
      // The debit call threw, but the eval may have executed server-side and
      // lost its response — the marker is the only proof of whether money
      // actually left the balance. Consume it atomically before touching the
      // row: a real debit is refunded now, an absent marker means no debit
      // ever happened. If Redis can't answer, keep the row so the recovery
      // sweep settles it via the marker instead of deleting the only pointer
      // to the debit.
      const refunded = await userCache.refundIfDebited(u.id, amount, intent[0].id).catch(() => null);
      if (refunded === null && (e as Error).message !== "user_not_found") {
        return fail(c, "Повторите попытку позже", 503);
      }
      // Marker consumed (debit refunded), marker absent (debit never happened)
      // or the user is gone (no debit possible): remove the intent so the user
      // can retry.
      await db
        .delete(transaction)
        .where(and(eq(transaction.id, intent[0].id), eq(transaction.status, "pending")))
        .catch((err) => {
          // If this fails the pending row stays and blocks the user with 409 —
          // it must be visible in the logs for support to clean up.
          console.error("[Wallet] withdraw intent cleanup failed:", err);
        });
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

  await settleExpiredWithdrawals(u.id);

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

  const items: {
    id: string;
    amount: number;
    code: WithdrawRejectCode;
    createdAt: string;
    method: string | null;
    requisites: string | null;
    verificationFailed: boolean;
  }[] = [];
  const gatesState = await getUserGateState(u.id);
  const hasAnyAttempt = await hasAnyVerificationAttempt(u.id);
  const hasAnyPaid = await hasPaidVerification(u.id);
  for (const row of rows) {
    const parsed = parseWithdrawalDetails(row.details);
    const code = parsed.code ?? null;
    if (!code) continue;

    // Легкий план: если верификация была (attempt или paid) но флаг не поставлен — показываем «Подробнее»
    // вместо авто-возврата. Транзакция закрывается только после закрытия модалки Подробнее.
    // Для лёгкого плана считаем любую попытку верификации (hasAnyAttempt / hasAnyPaid) признаком
    // неточных данных, чтобы следующий failed тоже показывал Подробнее, а не «Пройти верификацию».
    let verificationFailed = false;
    if (code === "need_verification" || code === "verification_pending") {
      if (!gatesState.verifiedForPayment && (hasAnyAttempt || hasAnyPaid)) {
        verificationFailed = true;
        items.push({
          id: row.id,
          amount: row.amount,
          code,
          createdAt: row.createdAt.toISOString(),
          method: row.method,
          requisites: parsed.requisites ?? row.details,
          verificationFailed,
        });
        continue;
      }
    }

    if (await isWithdrawGateSatisfied(u.id, code, row.createdAt)) {
      await refundWithdrawRequest(u.id, row.id);
      continue;
    }

    items.push({
      id: row.id,
      amount: row.amount,
      code,
      createdAt: row.createdAt.toISOString(),
      method: row.method,
      requisites: parsed.requisites ?? row.details,
      verificationFailed,
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

wallet.post("/verification/attempt", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    firstName?: string;
    lastName?: string;
    ageConfirmed?: boolean;
    requisites?: string;
    method?: string;
    amount?: number;
  };

  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  const ageConfirmed = Boolean(body.ageConfirmed);
  const requisites = String(body.requisites || "").trim();
  const method = body.method === "card" ? "card" : "sbp";
  const amount = Math.floor(Number(body.amount) || 0);

  if (!firstName || firstName.length < 2 || firstName.length > 50) {
    return fail(c, "Укажите корректное имя получателя", 400);
  }
  if (!lastName || lastName.length < 2 || lastName.length > 50) {
    return fail(c, "Укажите корректную фамилию получателя", 400);
  }
  if (!ageConfirmed) {
    return fail(c, "Подтвердите, что получателю больше 18 лет", 400);
  }
  if (!requisites || requisites.length < 5) {
    return fail(c, "Укажите реквизиты", 400);
  }

  const id = crypto.randomUUID();
  const now = new Date();
  await db.insert(verificationAttempt).values({
    id,
    userId: u.id,
    firstName,
    lastName,
    ageConfirmed,
    requisites,
    method,
    amount,
    createdAt: now,
  });

  return c.json({ success: true, id });
});

wallet.get("/verification/attempts", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  const rows = await db
    .select()
    .from(verificationAttempt)
    .where(eq(verificationAttempt.userId, u.id))
    .orderBy(desc(verificationAttempt.createdAt))
    .limit(20);
  return c.json({
    items: rows.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      ageConfirmed: r.ageConfirmed,
      requisites: r.requisites,
      method: r.method,
      amount: r.amount,
      createdAt: r.createdAt.toISOString(),
    })),
  });
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
        withdrawals: sql<number>`count(*) FILTER (WHERE ${transaction.type} = 'withdrawal')`,
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
    withdrawals: Number(financialRows[0]?.withdrawals || 0),
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
  } else if (activeTab === "withdrawals") {
    txRows = await txPage(txWhere(["withdrawal"]));
  } else {
    [gameRows, txRows] = await Promise.all([
      queryGameUnion((t) => gameWhere(t), pageSize + 1),
      txPage(txWhere(["deposit", "bonus", "withdrawal"])),
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
    } else if (t.type === "withdrawal") {
      const active = t.status === "pending";
      const debited = active || t.status === "success";
      items.push({
        id: t.id,
        type: "withdrawal",
        category: "withdrawals",
        title: active ? "Заявка на вывод" : "Вывод средств",
        subtitle: [t.method, active ? "В обработке" : null].filter(Boolean).join(" · ") || "Вывод",
        amount: debited ? -t.amount : 0,
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
