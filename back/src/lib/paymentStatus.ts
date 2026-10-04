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

// Once a payment reaches one of these states it must not regress. For deposits,
// PAID now means "provider confirmed AND credited", AWAITING_RECEIPT means
// "provider confirmed, waiting for the receipt to be attached". Gate payments
// (requisites verification / premium) are credited immediately on PAID — the
// provider-confirmed transfer is itself the proof, a receipt is never attached
// to them, and waiting for one left them stuck in AWAITING_RECEIPT forever
// (uncounted in admin stats, never reported to CashX → partner commission lost).
export const PAYMENT_STABLE_STATUSES = new Set(["AWAITING_RECEIPT", "PAID"]);

/** Итоговые статусы: дальше спрашивать платёжный сервис нечего. */
export const PAYMENT_TERMINAL_STATUSES = new Set(["PAID", "FAILED", "CANCELED", "EXPIRED"]);

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
    // Gate payments (verification / premium) never get a receipt — credit them
    // straight away. Deposits still require the receipt to be attached first.
    const isGatePayment = row.purpose === "verification" || row.purpose === "premium";
    if (row.receiptUrl || isGatePayment) {
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
    } else {
      // Atomic claim so only the first PAID update transitions the payment.
      // Guard on credited (not status) so a provider-confirmed payment always
      // lands in AWAITING_RECEIPT even if the status endpoint has already
      // written an intermediate state like CONFIRMED_BY_USER.
      const claimed = await db
        .update(paymentTable)
        .set({ status: "AWAITING_RECEIPT", updatedAt: now })
        .where(and(eq(paymentTable.id, row.id), eq(paymentTable.credited, false)))
        .returning({ id: paymentTable.id });
      if (claimed.length > 0) {
        console.log("[Payments] payment waiting for receipt", row.id, row.purpose);
      }
    }
  } else if (status !== row.status && !PAYMENT_STABLE_STATUSES.has(row.status)) {
    await db
      .update(paymentTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(paymentTable.id, row.id));
  }
}
