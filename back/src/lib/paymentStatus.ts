/**
 * Единая обработка апдейта платежа от платёжного шлюза. Вызывают и вебхук
 * (/webhook), и опрос статуса (GET /api/wallet/payment/status) — если колбэк
 * потерялся, оплата всё равно будет зачислена. Зачисление делается один раз:
 * победитель атомарного claim'а по флагу credited.
 */
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { payment as paymentTable } from "../db/schema";
import { creditConfirmedPayment } from "./paymentCredit";

// Once a payment reaches one of these states it must not regress. PAID means
// "provider confirmed AND credited" — a receipt is no longer a condition for
// credit: the provider-confirmed transfer is itself the proof, so every payment
// (deposit / verification / premium) is credited as soon as the gateway reports
// PAID. AWAITING_RECEIPT is kept only as a legacy status for rows created while
// receipts were mandatory; they are all provider-confirmed, are never produced
// anymore and are drained by the receipt sweeper in routes/wallet.ts.
export const PAYMENT_STABLE_STATUSES = new Set(["AWAITING_RECEIPT", "PAID"]);

/** Итоговые статусы: дальше спрашивать платёжный сервис нечего. */
export const PAYMENT_TERMINAL_STATUSES = new Set(["PAID", "FAILED", "CANCELED", "EXPIRED"]);

/**
 * Платёж не состоялся: чек к нему уже не прикрепить. `CANCELLED` (двойная L)
 * встречается у вручную отозванной верификации в админке (admin.ts) — держим
 * его здесь вместе с тем же статусом из шлюза.
 */
export const PAYMENT_FAILED_STATUSES = new Set(["FAILED", "CANCELED", "CANCELLED", "EXPIRED"]);

/** Статусы шлюза → статусы платежа kazik. */
export function mapGatewayStatus(status: string): string {
  switch (status) {
    case "PAID":
    case "PENDING":
    case "FAILED":
      return status;
    case "SUCCESS":
      return "PAID";
    case "CANCELED":
    case "CANCELLED":
      return "CANCELED";
    default:
      return "PENDING";
  }
}

export interface GatewayPaymentUpdate {
  /** Локальный id платежа (client_order_id в колбэке). */
  clientOrderId?: string | null;
  /** id счёта на стороне шлюза (payment_id в колбэке). */
  providerPaymentId?: string | null;
  status: string;
  amount?: string | number | null;
}

/**
 * Применяет статус от шлюза к платежу. Зачисляем по локальной сумме платежа:
 * счёт создавали мы, а расхождение с суммой из колбэка — только повод для лога.
 */
export async function applyGatewayPaymentUpdate(
  update: GatewayPaymentUpdate,
): Promise<void> {
  const { clientOrderId, providerPaymentId } = update;
  if (!clientOrderId && !providerPaymentId) return;

  const rows = await db
    .select()
    .from(paymentTable)
    .where(
      clientOrderId
        ? eq(paymentTable.id, clientOrderId)
        : eq(paymentTable.paymentId, providerPaymentId || ""),
    );

  const row = rows[0];
  if (!row) {
    console.log("[Payments] payment not found for", clientOrderId || providerPaymentId);
    return;
  }

  const status = mapGatewayStatus(update.status);
  const remoteAmount = Math.floor(Number(update.amount));
  if (Number.isFinite(remoteAmount) && remoteAmount > 0 && remoteAmount !== row.amount) {
    console.warn(
      "[Payments] сумма от шлюза не совпадает с локальной:",
      JSON.stringify({ id: row.id, local: row.amount, remote: remoteAmount }),
    );
  }

  console.log(
    "[Payments] update:",
    JSON.stringify({
      id: row.id,
      purpose: row.purpose,
      status: row.status,
      credited: row.credited,
      hasReceipt: Boolean(row.receiptUrl),
      incoming: status,
    }),
  );

  if (status === "PAID" && !row.credited) {
    const now = new Date();
    // Receipts are optional: a provider-confirmed transfer is proof enough, so
    // credit the payment right away for every purpose. A receipt may still be
    // attached later (stored for admin/support), but nothing waits for it.
    const claimed = await db
      .update(paymentTable)
      .set({ credited: true, status: "PAID", updatedAt: now })
      .where(and(eq(paymentTable.id, row.id), eq(paymentTable.credited, false)))
      .returning({ id: paymentTable.id });

    if (claimed.length > 0) {
      try {
        await creditConfirmedPayment(
          {
            id: row.id,
            userId: row.userId,
            purpose: row.purpose,
            method: row.method,
            amount: row.amount,
          },
          now,
        );
        console.log("[Payments] payment credited", row.id, row.purpose);
      } catch (e) {
        if (row.purpose === "deposit") {
          console.error(
            "[Payments] deposit credit failed, reverting claim:",
            row.id,
            (e as Error).message,
          );
          await db
            .update(paymentTable)
            .set({ credited: false, status: "PENDING", updatedAt: new Date() })
            .where(and(eq(paymentTable.id, row.id), eq(paymentTable.credited, true)))
            .catch(() => {});
        }
        throw e;
      }
    }
  } else if (status !== row.status && !PAYMENT_STABLE_STATUSES.has(row.status)) {
    await db
      .update(paymentTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(paymentTable.id, row.id));
  }
}
