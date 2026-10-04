import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, desc, eq, inArray, lt, or, sql, sum, type SQL } from "drizzle-orm";
import { db } from "../db";
import { user as userTable, transaction, promoActivation, payment as paymentTable, slotsRound, crashRound, minesRound, casesRound, blockblastRound, minedropRound, verificationAttempt, refundRequest } from "../db/schema";
import { auth } from "../lib/auth";
import { redis } from "../lib/redis";
import { userCache } from "../lib/userCache";
import { creditConfirmedPayment } from "../lib/paymentCredit";
import { createGatewayPayment, getGatewayPaymentStatus } from "../lib/paymentGateway";
import { applyGatewayPaymentUpdate, PAYMENT_TERMINAL_STATUSES } from "../lib/paymentStatus";
import { s3Client, getS3Bucket, getS3PublicUrl } from "../lib/s3";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { achievementEngine } from "../lib/achievementEngine";
import { xpForBonusMoney } from "../lib/levels";
import { getMaxDeposit, getMinDeposit } from "../lib/config";
import { affiliateService } from "../affiliate/service";
import {
  parseWithdrawalDetails,
  refundPendingWithdrawal,
  withdrawalDeadline,
  type WithdrawRejectCode,
} from "../lib/withdrawals";
import { allowedOrigins } from "../lib/origins";
import { clientIp } from "../lib/rateLimitMiddleware";

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

const STALE_WITHDRAW_INTENT_TIMEOUT_MS = 10 * 60 * 1000;
const SWEEP_INTERVAL_MS = 30 * 1000;

const REFUND_MIN_AMOUNT = 1000;
const REFUND_PROCESSING_DAYS = 30;
const REFUND_RESULT_VISIBILITY_MS = REFUND_PROCESSING_DAYS * 24 * 60 * 60 * 1000;

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

  await recoverWithdrawalRefunds();
  return claimed.length;
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

const RECEIPT_AUTO_APPROVE_TIMEOUT_MS = 9 * 60 * 1000;

// A payment only reaches AWAITING_RECEIPT once the provider has confirmed the
// transfer (the webhook sets it), i.e. the money has actually arrived. If the
// user never attaches a receipt, credit it and flip to PAID after 9 minutes so
// paid users are not stuck forever (also drains the existing backlog). The
// atomic claim on credited=false keeps the credit single-shot across instances.
export async function sweepReceiptTimeouts(): Promise<number> {
  const staleBefore = new Date(Date.now() - RECEIPT_AUTO_APPROVE_TIMEOUT_MS);
  const candidates = await db
    .select()
    .from(paymentTable)
    .where(
      and(
        eq(paymentTable.status, "AWAITING_RECEIPT"),
        eq(paymentTable.credited, false),
        lt(paymentTable.updatedAt, staleBefore),
      ),
    )
    .limit(200);

  let credited = 0;
  for (const row of candidates) {
    const now = new Date();
    const claimed = await db
      .update(paymentTable)
      .set({ credited: true, status: "PAID", updatedAt: now })
      .where(
        and(
          eq(paymentTable.id, row.id),
          eq(paymentTable.status, "AWAITING_RECEIPT"),
          eq(paymentTable.credited, false),
        ),
      )
      .returning({ id: paymentTable.id });
    if (claimed.length === 0) continue;

    try {
      await creditConfirmedPayment(
        { id: row.id, userId: row.userId, purpose: row.purpose, method: row.method, amount: row.amount },
        now,
      );
      credited++;
      console.log("[Wallet] receipt timeout: auto-credited", row.id, row.purpose);
    } catch (e) {
      console.error("[Wallet] receipt timeout credit failed, reverting claim:", row.id, e);
      // Back to AWAITING_RECEIPT with a fresh timestamp: retried next sweep.
      await db
        .update(paymentTable)
        .set({ credited: false, status: "AWAITING_RECEIPT", updatedAt: new Date() })
        .where(and(eq(paymentTable.id, row.id), eq(paymentTable.credited, true)))
        .catch(() => {});
    }
  }

  return credited;
}

export function startReceiptTimeoutSweeper(): Timer {
  void sweepReceiptTimeouts().catch((e) => {
    console.error("[Wallet] initial receipt timeout sweep failed:", e);
  });
  return setInterval(() => {
    void sweepReceiptTimeouts().catch((e) => {
      console.error("[Wallet] receipt timeout sweep failed:", e);
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
  const paidVerification = await hasPaidVerification(userId);
  const isVerified = gates.verifiedForPayment || paidVerification;
  const hasAnyAttempt = await hasAnyVerificationAttempt(userId);
  for (const row of rows) {
    const code = parseWithdrawalDetails(row.details).code;
    if ((code === "need_verification" || code === "verification_pending") && !isVerified && (hasAnyAttempt || paidVerification)) {
      continue;
    }
    if (code === "need_premium" && !gates.premiumActive) {
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
    return failedAt ? hasPaidVerificationAfter(userId, failedAt) : hasPaidVerification(userId);
  }
  if (code === "need_premium") {
    const gates = await getUserGateState(userId);
    return gates.premiumActive;
  }
  if (code === "need_referrals") {
    // Шаг удалён: старые заявки с этим кодом закрываем — новые не создаются.
    return true;
  }
  return false;
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

type RefundRequestRow = typeof refundRequest.$inferSelect;

function serializeRefund(row: RefundRequestRow) {
  return {
    id: row.id,
    amount: row.amount,
    reason: row.reason,
    requisites: row.requisites,
    method: row.method,
    status: row.status,
    adminComment: row.adminComment,
    createdAt: row.createdAt.toISOString(),
    processedAt: row.processedAt ? row.processedAt.toISOString() : null,
    processingUntil:
      row.status === "pending"
        ? new Date(row.createdAt.getTime() + REFUND_RESULT_VISIBILITY_MS).toISOString()
        : null,
  };
}

// Заявка остаётся видимой пользователю 30 дней после обработки — чтобы он
// успел увидеть решение и комментарий администратора.
function isRefundVisible(row: RefundRequestRow): boolean {
  if (row.status === "pending") return true;
  const resolvedAt = row.processedAt ?? row.updatedAt;
  return Date.now() - resolvedAt.getTime() < REFUND_RESULT_VISIBILITY_MS;
}

async function getRefundContext(userId: string): Promise<{
  depositsTotal: number;
  available: number;
  lastRequest: RefundRequestRow | null;
}> {
  const [depositsRow, reservedRow, lastRows] = await Promise.all([
    db
      .select({ total: sum(transaction.amount) })
      .from(transaction)
      .where(
        and(
          eq(transaction.userId, userId),
          eq(transaction.type, "deposit"),
          eq(transaction.status, "success"),
        ),
      ),
    db
      .select({ total: sum(refundRequest.amount) })
      .from(refundRequest)
      .where(
        and(
          eq(refundRequest.userId, userId),
          inArray(refundRequest.status, ["pending", "approved"]),
        ),
      ),
    db
      .select()
      .from(refundRequest)
      .where(eq(refundRequest.userId, userId))
      .orderBy(desc(refundRequest.createdAt))
      .limit(1),
  ]);

  const depositsTotal = Number(depositsRow[0]?.total ?? 0);
  const reserved = Number(reservedRow[0]?.total ?? 0);

  return {
    depositsTotal,
    available: Math.max(0, depositsTotal - reserved),
    lastRequest: lastRows[0] ?? null,
  };
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

// Заявки на вывод больше не закрываются автоматически: их обрабатывает
// оператор вручную в админке (раздел «Выводы»). Здесь остаётся только
// восстановление зависших возвратов (refund_pending -> failed + кредит).
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

export interface WalletHistoryItem {
  id: string;
  type: 'deposit' | 'withdrawal' | 'bonus' | 'win' | 'loss';
  category: 'games' | 'bonuses' | 'deposits' | 'withdrawals';
  title: string;
  subtitle: string;
  amount: number; // positive for credit (+), negative for debit (-)
  status: 'success' | 'pending' | 'failed';
  createdAt: string;
  processingUntil?: string | null;
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
    const [minDeposit, maxDeposit] = await Promise.all([getMinDeposit(), getMaxDeposit()]);
    if (!Number.isFinite(amount) || amount < minDeposit) {
      return fail(
        c,
        `Минимальная сумма пополнения — ${minDeposit.toLocaleString("ru-RU")} ₽`,
        400,
      );
    }
    if (amount > maxDeposit) {
      return fail(
        c,
        `Максимальная сумма пополнения — ${maxDeposit.toLocaleString("ru-RU")} ₽`,
        400,
      );
    }
  }

  if (purpose === "verification" || purpose === "premium") {
    const hasDeposit = await hasSuccessfulDeposit(u.id);
    if (!hasDeposit) {
      return fail(
        c,
        "Сначала необходимо совершить хотя бы один депозит",
        403,
        "need_deposit",
      );
    }
  }
  if (purpose === "premium") {
    const paidVerification = await hasPaidVerification(u.id);
    const gates = await getUserGateState(u.id);
    if (!paidVerification && !gates.verifiedForPayment) {
      return fail(
        c,
        "Для покупки Премиума сначала пройдите верификацию реквизитов",
        403,
        "need_verification",
      );
    }
  }

  const method = purpose === "deposit" ? "sbp" : (body.method === "card" ? "card" : "sbp");
  // Куда вернуть покупателя с нашей страницы на стороне шлюза.
  const returnOrigin = process.env.PAYMENT_RETURN_ORIGIN || allowedOrigins()[0] || "";

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

    // Оплату принимает шлюз (razdevator/neuromatic) на своей стороне: способ
    // оплаты покупатель выбирает на странице провайдера, поэтому «СБП» и
    // «карта» ведут на одну ссылку. Результат придёт колбэком на /webhook.
    const result = await createGatewayPayment({
      externalId: id,
      externalUserId: u.id,
      purpose,
      method,
      amountRub: amount,
      buyerIp: clientIp(c),
      returnUrl: returnOrigin || null,
    });

    await db
      .update(paymentTable)
      .set({
        paymentId: result.id,
        link: result.paymentUrl,
        status: "PENDING",
        updatedAt: new Date(),
      })
      .where(eq(paymentTable.id, id));

    return c.json({
      paymentId: id,
      link: result.paymentUrl,
    });
  } catch (e) {
    await db
      .update(paymentTable)
      .set({ status: "FAILED", updatedAt: new Date() })
      .where(eq(paymentTable.id, id))
      .catch(() => {});
    const err = e as Error & { code?: string };
    const rawMsg = err.message || '';
    const code =
      err.code ||
      (typeof rawMsg === 'string' && /^[A-Z_]+$/.test(rawMsg.trim()) ? rawMsg.trim() : undefined);
    const msg = rawMsg || 'Не удалось создать платёж';
    console.error('[Wallet] createDepositPayment failed', {
      id,
      amount,
      method,
      purpose,
      code,
      msg,
    });
    return fail(c, msg || 'Не удалось создать платёж', 502, code);
  }
});

wallet.get("/payment/status", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const rawId = (c.req.query("id") || "").trim();
  if (!rawId) return fail(c, "Не указан идентификатор платежа", 400);

  const statusClauses = [eq(paymentTable.id, rawId), eq(paymentTable.paymentId, rawId)];
  if (rawId.length > 36) statusClauses.push(eq(paymentTable.id, rawId.slice(0, 36)));
  const rows = await db
    .select()
    .from(paymentTable)
    .where(and(eq(paymentTable.userId, u.id), or(...statusClauses)));

  const payment = rows[0];
  if (!payment) return fail(c, "Платёж не найден", 404);

  let fresh = payment;
  const stable =
    payment.status === "AWAITING_RECEIPT" || PAYMENT_TERMINAL_STATUSES.has(payment.status);
  if (payment.paymentId && !stable) {
    try {
      const remote = await getGatewayPaymentStatus(payment.paymentId);
      // Шлюз подтвердил оплату — значит колбэк потерялся и зачисляем здесь же
      // (та же идемпотентная логика, что и в вебхуке, включая гейт чеков).
      // Промежуточные статусы просто сохраняем.
      await applyGatewayPaymentUpdate({
        clientOrderId: payment.id,
        providerPaymentId: payment.paymentId,
        status: remote.status,
        amount: remote.amountRub,
      });
    } catch {
      // Keep last known status if the gateway is unreachable
    }
    const refreshed = await db
      .select()
      .from(paymentTable)
      .where(eq(paymentTable.id, payment.id));
    if (refreshed[0]) fresh = refreshed[0];
  }

  return c.json({
    paymentId: fresh.id,
    amount: fresh.amount,
    status: fresh.status,
    credited: fresh.credited,
  });
});

wallet.post("/payment/:id/receipt/presign", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const rawId = c.req.param("id").trim();
  const body = (await c.req.json().catch(() => ({}))) as {
    filename?: string;
    contentType?: string;
    size?: number;
  };

  const contentType = (body.contentType || "").trim().toLowerCase();
  const size = Math.floor(Number(body.size) || 0);
  const filename = (body.filename || "").trim();

  const allowedTypes = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain",
  ]);
  if (!allowedTypes.has(contentType)) {
    return fail(c, "Поддерживаются изображения PNG, JPG, WEBP и документы PDF, DOC, XLS", 400);
  }
  const MAX_SIZE = 5 * 1024 * 1024;
  if (!Number.isFinite(size) || size <= 0 || size > MAX_SIZE) {
    return fail(c, "Размер файла должен быть до 5 МБ", 400);
  }

  const presignClauses = [eq(paymentTable.id, rawId), eq(paymentTable.paymentId, rawId)];
  if (rawId.length > 36) presignClauses.push(eq(paymentTable.id, rawId.slice(0, 36)));
  const rows = await db
    .select()
    .from(paymentTable)
    .where(and(eq(paymentTable.userId, u.id), or(...presignClauses)));
  const payment = rows[0];
  if (!payment) return fail(c, "Платёж не найден", 404);
  if (payment.credited || payment.status === "PAID") {
    return fail(c, "Платёж уже подтверждён", 400);
  }
  if (PAYMENT_TERMINAL_STATUSES.has(payment.status)) {
    return fail(c, "Чек можно прикрепить только к активному платежу", 400);
  }

  // Build S3 key: receipts/{userId}/{paymentId}/{uuid}.{ext}
  const extMap: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
    "application/pdf": "pdf",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-excel": "xls",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt",
  };
  const extRaw = filename.includes(".") ? filename.split(".").pop()?.toLowerCase() : "";
  const ext = extMap[contentType] || (extRaw && /^[a-z0-9]{1,5}$/.test(extRaw) ? extRaw : "bin");
  const key = `receipts/${u.id}/${payment.id}/${crypto.randomUUID()}.${ext}`;

  try {
    const command = new PutObjectCommand({
      Bucket: getS3Bucket(),
      Key: key,
      ContentType: contentType,
    });
    const url = await getSignedUrl(s3Client, command, { expiresIn: 600 });
    const publicUrl = getS3PublicUrl(key);
    console.log("[Wallet] receipt presign:", JSON.stringify({ requestedId: rawId, canonicalId: payment.id, userId: u.id, key, contentType, size }));
    return c.json({ url, key, publicUrl, expiresIn: 600 });
  } catch (e) {
    console.error("[Wallet] receipt presign failed:", e);
    return fail(c, "Не удалось создать ссылку для загрузки", 500);
  }
});

wallet.post("/payment/:id/receipt", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const rawId = c.req.param("id").trim();
  const body = (await c.req.json().catch(() => ({}))) as { url?: string };
  const url = (body.url || "").trim();
  console.log(
    "[Wallet] receipt attach request:",
    JSON.stringify({ requestedId: rawId, userId: u.id, hasUrl: Boolean(url), urlLength: url.length }),
  );
  if (!url || url.length > 2048) {
    return fail(c, "Некорректная ссылка на чек", 400);
  }

  const attachClauses = [eq(paymentTable.id, rawId), eq(paymentTable.paymentId, rawId)];
  if (rawId.length > 36) attachClauses.push(eq(paymentTable.id, rawId.slice(0, 36)));
  const rows = await db
    .select()
    .from(paymentTable)
    .where(and(eq(paymentTable.userId, u.id), or(...attachClauses)));

  const payment = rows[0];
  if (!payment) {
    console.log("[Wallet] receipt attach: payment not found", rawId);
    return fail(c, "Платёж не найден", 404);
  }
  if (payment.credited || payment.status === "PAID") {
    console.log("[Wallet] receipt attach rejected: already credited", rawId, "canonical", payment.id);
    return fail(c, "Платёж уже подтверждён", 400);
  }
  if (PAYMENT_TERMINAL_STATUSES.has(payment.status)) {
    console.log("[Wallet] receipt attach rejected: terminal status", rawId, payment.status, "canonical", payment.id);
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
      await creditConfirmedPayment(
        { id: fresh.id, userId: fresh.userId, purpose: fresh.purpose, method: fresh.method, amount: fresh.amount },
        now,
      );
      console.log("[Wallet] receipt attach: credited", rawId, "canonical", payment.id, fresh.purpose);
      return c.json({ ok: true, status: "PAID", credited: true });
    }
  }

  console.log("[Wallet] receipt attach: stored, awaiting credit", rawId, "canonical", payment.id, fresh?.status ?? payment.status);
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

  const isVerified = gates.verifiedForPayment || paidVerification;
  return c.json({
    hasDeposit,
    hasPaidVerification: isVerified,
    verifiedForPayment: isVerified,
    premiumActive: gates.premiumActive,
    premiumUntil: gates.premiumUntil,
  });
});

wallet.get("/withdraw/active", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  await recoverWithdrawalRefunds(u.id);

  const [rows, gates, paidVerification] = await Promise.all([
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
    hasPaidVerification(u.id),
  ]);

  const row = rows[0];
  const isVerified = gates.verifiedForPayment || paidVerification;

  return c.json({
    request: row
      ? {
          id: row.id,
          amount: row.amount,
          method: row.method,
          details: row.details,
          createdAt: row.createdAt.toISOString(),
          processingUntil: withdrawalDeadline(row.createdAt).toISOString(),
        }
      : null,
    verifiedForPayment: isVerified,
    hasPaidVerification: isVerified,
    premiumActive: gates.premiumActive,
    premiumUntil: gates.premiumUntil,
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

  await recoverWithdrawalRefunds(u.id);

  // Step 1: Deposit (must have at least one successful deposit)
  if (!(await hasSuccessfulDeposit(u.id))) {
    return fail(
      c,
      "Вывод доступен только для тех пользователей, совершивших хотя бы один депозит",
      403,
      "need_deposit",
    );
  }

  // Step 2: Verification of requisites (auto-confirmed upon payment)
  const gates = await getUserGateState(u.id);
  const paidVerification = await hasPaidVerification(u.id);
  const isVerified = gates.verifiedForPayment || paidVerification;
  if (!isVerified) {
    return fail(
      c,
      "Для вывода средств необходимо пройти верификацию реквизитов",
      403,
      "need_verification",
    );
  }

  // Step 3: Premium subscription (cannot withdraw without premium)
  if (!gates.premiumActive) {
    return fail(
      c,
      "Для вывода средств необходима Премиум подписка. Без неё вывод средств недоступен",
      403,
      "need_premium",
    );
  }

  // Refund/cancel rejected attempts after gates are met
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
  const processingUntil = withdrawalDeadline(createdAt);
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

  await recoverWithdrawalRefunds(u.id);

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
  const paidVerification = await hasPaidVerification(u.id);
  const isVerified = gatesState.verifiedForPayment || paidVerification;
  const hasAnyAttempt = await hasAnyVerificationAttempt(u.id);
  for (const row of rows) {
    const parsed = parseWithdrawalDetails(row.details);
    const code = parsed.code ?? null;
    if (!code) continue;

    let verificationFailed = false;
    if (code === "need_verification" || code === "verification_pending") {
      if (!isVerified && (hasAnyAttempt || paidVerification)) {
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
    .select({ id: transaction.id, status: transaction.status, balanceDebited: transaction.balanceDebited, amount: transaction.amount })
    .from(transaction)
    .where(
      and(
        eq(transaction.id, id),
        eq(transaction.userId, u.id),
        eq(transaction.type, "withdrawal"),
      ),
    );

  if (rows.length === 0) return fail(c, "Заявка не найдена", 404);

  const row = rows[0] as typeof rows[0] & { status: string; balanceDebited: boolean; amount: number };
  // Уже отменена / завершена — считаем успехом для идемпотентности UI
  if (row.status === "cancelled" || row.status === "success") {
    return c.json({ success: true });
  }

  if (row.status === "pending" || row.status === "refund_pending") {
    // Отмена заявки с возвратом списанного (общая логика с админским отклонением).
    const result = await refundPendingWithdrawal(u.id, id);
    if (result === "not_found" || result === "invalid_status") {
      return fail(c, "Заявка не найдена", 404);
    }
    return c.json({ success: true });
  }

  if (row.status === "failed") {
    await refundWithdrawRequest(u.id, id);
    return c.json({ success: true });
  }

  return fail(c, "Заявка не найдена", 404);
});

wallet.get("/refund/status", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const ctx = await getRefundContext(u.id);

  return c.json({
    eligible: ctx.depositsTotal > 0 && ctx.available > 0,
    depositsTotal: ctx.depositsTotal,
    available: ctx.available,
    request:
      ctx.lastRequest && isRefundVisible(ctx.lastRequest)
        ? serializeRefund(ctx.lastRequest)
        : null,
  });
});

wallet.post("/refund", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    amount?: unknown;
    reason?: unknown;
    requisites?: unknown;
    method?: unknown;
  };

  const amount = Math.floor(Number(body.amount));
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  const requisites = typeof body.requisites === "string" ? body.requisites.trim() : "";
  const method = body.method === "card" ? "Банковская карта" : body.method === "sbp" ? "СБП" : null;

  if (!Number.isFinite(amount) || amount < REFUND_MIN_AMOUNT) {
    return fail(c, `Минимальная сумма возврата — ${REFUND_MIN_AMOUNT.toLocaleString("ru-RU")} ₽`, 400, "amount_too_small");
  }
  if (reason.length < 5 || reason.length > 1000) {
    return fail(c, "Опишите причину возврата (от 5 до 1000 символов)", 400, "invalid_reason");
  }
  if (requisites.length < 5 || requisites.length > 300) {
    return fail(c, "Укажите реквизиты для возврата", 400, "invalid_requisites");
  }

  const ctx = await getRefundContext(u.id);
  if (ctx.depositsTotal <= 0) {
    return fail(c, "Возврат доступен только пользователям с депозитом", 403, "need_deposit");
  }
  if (amount > ctx.available) {
    return fail(c, `Максимальная сумма возврата — ${ctx.available.toLocaleString("ru-RU")} ₽`, 400, "amount_exceeds_deposits");
  }

  const now = new Date();
  // Частичный уникальный индекс refund_requests_one_pending_per_user делает
  // вставку race-proof: параллельная заявка получает 0 строк и не создаётся.
  const inserted = await db
    .insert(refundRequest)
    .values({
      id: crypto.randomUUID(),
      userId: u.id,
      amount,
      reason,
      requisites,
      method,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing()
    .returning();

  if (inserted.length === 0) {
    return fail(c, "У вас уже есть заявка на возврат в обработке", 409, "refund_pending");
  }

  const request = serializeRefund(inserted[0]);
  console.log("[Wallet] refund request created:", JSON.stringify({ userId: u.id, id: request.id, amount }));
  return c.json({ ok: true, request });
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
        processingUntil: active ? withdrawalDeadline(t.createdAt).toISOString() : null,
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
