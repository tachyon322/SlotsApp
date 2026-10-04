import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { transaction } from "../db/schema";
import { userCache } from "./userCache";

export const WITHDRAWAL_PROCESSING_BUSINESS_DAYS = 30;

/**
 * Дедлайн заявки на вывод: createdAt + 30 рабочих дней (пн–пт, без учёта
 * праздников). Время суток сохраняется.
 */
export function addBusinessDays(from: Date, days: number): Date {
  const result = new Date(from.getTime());
  let remaining = Math.max(0, Math.floor(days));
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const weekday = result.getDay();
    if (weekday !== 0 && weekday !== 6) remaining -= 1;
  }
  return result;
}

export function withdrawalDeadline(createdAt: Date): Date {
  return addBusinessDays(createdAt, WITHDRAWAL_PROCESSING_BUSINESS_DAYS);
}

// need_referrals остаётся в типе только для распознавания и закрытия заявок,
// созданных до удаления реферального шага: новые заявки этот код не получают.
export type WithdrawRejectCode =
  | "need_deposit"
  | "need_verification"
  | "need_premium"
  | "need_referrals"
  | "verification_pending";

export function parseWithdrawalDetails(details: string | null): {
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
      parsed.code === "need_referrals" ||
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

/**
 * Закрытие заявки оператором: pending + balanceDebited=true -> success.
 * Guard на статус делает вызов идемпотентным (повтор вернёт false).
 */
export async function markWithdrawalPaid(id: string): Promise<boolean> {
  const claimed = await db
    .update(transaction)
    .set({ status: "success" })
    .where(
      and(
        eq(transaction.id, id),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "pending"),
        eq(transaction.balanceDebited, true),
      ),
    )
    .returning({ id: transaction.id });
  return claimed.length > 0;
}

export type RefundPendingResult = "ok" | "not_found" | "already" | "invalid_status";

/**
 * Отмена заявки с возвратом денег. Используется пользовательской отменой
 * (POST /withdraw/requests/:id/cancel) и отклонением оператора.
 * Claim (pending/refund_pending -> cancelled) идёт до возврата, поэтому
 * конкурентные вызовы не могут вернуть одни и те же деньги дважды.
 */
export async function refundPendingWithdrawal(
  userId: string,
  id: string,
): Promise<RefundPendingResult> {
  const rows = await db
    .select({ status: transaction.status })
    .from(transaction)
    .where(
      and(
        eq(transaction.id, id),
        eq(transaction.userId, userId),
        eq(transaction.type, "withdrawal"),
      ),
    )
    .limit(1);

  const originalStatus = rows[0]?.status;
  if (!originalStatus) return "not_found";
  if (originalStatus === "cancelled" || originalStatus === "success") return "already";
  if (originalStatus !== "pending" && originalStatus !== "refund_pending") {
    return "invalid_status";
  }

  const claimed = await db
    .update(transaction)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(transaction.id, id),
        eq(transaction.userId, userId),
        inArray(transaction.status, ["pending", "refund_pending"]),
      ),
    )
    .returning({ balanceDebited: transaction.balanceDebited, amount: transaction.amount });

  if (claimed.length === 0) return "already";

  try {
    if (claimed[0].balanceDebited) {
      // pending всегда с маркером — пробуем атомарный refundIfDebited, иначе fallback adjust
      const refunded = await userCache.refundIfDebited(userId, claimed[0].amount, id).catch(() => false);
      if (!refunded) {
        // маркер уже съеден (settle успел), но balanceDebited true — компенсируем напрямую
        await userCache.adjustUserBalance(userId, claimed[0].amount).catch(() => {});
        await db
          .update(transaction)
          .set({ balanceDebited: false })
          .where(eq(transaction.id, id))
          .catch(() => {});
      }
    } else {
      // intent без дебета — просто чистим маркер если есть
      await userCache.refundIfDebited(userId, claimed[0].amount, id).catch(() => {});
    }
  } catch (e) {
    // не смогли вернуть — откатываем статус, чтобы не потерять деньги
    await db.update(transaction).set({ status: originalStatus }).where(eq(transaction.id, id)).catch(() => {});
    throw e;
  }

  return "ok";
}
