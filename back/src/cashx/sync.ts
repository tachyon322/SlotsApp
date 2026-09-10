// CashX event sync: the ONLY partner-data writes kazik performs. Commissions
// and balances are computed and stored exclusively in CashX; the local
// affiliate_* tables are a frozen archive (see the cutover plan
// cashx-cutover-kazik-affiliate-2026-09-02.md).
import { sendEvent, type EventInput, type ProcessResult } from "./client";

/**
 * Attribute a registered player to a partner. Sends registration.created
 * with the click_token from the CashX redirect (?click_token) and/or the
 * source code (?ref / promo code) — CashX attributes by token first and
 * falls back to the code, so promo registrations work without a click.
 */
export async function syncAttribution(userId: string, ref?: string, clickToken?: string): Promise<ProcessResult> {
  const token = clickToken?.trim() ?? "";
  const code = ref?.trim() ?? "";
  if (!token && !code) return { status: "ignored", reason: "no_ref" };
  const payload: EventInput = {
    event_id: `kazik-signup-${userId}`,
    type: "registration.created",
    occurred_at: new Date().toISOString(),
    external_user_id: userId,
    click_token: token || undefined,
    source_code: code || undefined,
  };
  const result = await sendEvent(payload);
  if (result.status === "ignored" && result.reason && result.reason !== "invalid_click_token") {
    console.warn("[cashx] attribution ignored:", result.reason, "user", userId, "ref", code);
  }
  return result;
}

/**
 * Report a confirmed deposit so CashX credits the partner's commission at
 * the partner's rate. Idempotent by external_payment_id.
 */
export async function syncCommission(
  userId: string,
  paymentId: string,
  amountKopecks: number,
  occurredAt: Date,
  kind: "deposit" | "gate" = "deposit",
): Promise<ProcessResult> {
  const payload: EventInput = {
    event_id: `kazik-payment-${paymentId}`,
    type: "revenue.confirmed",
    occurred_at: occurredAt.toISOString(),
    external_user_id: userId,
    external_payment_id: `kazik-pay-${paymentId}`,
    amount_kopecks: Math.floor(amountKopecks),
    currency: "RUB",
    kind,
  };
  return sendEvent(payload);
}

/**
 * Report a reversed/refunded payment so CashX reverses the commission.
 */
export async function syncReversed(paymentId: string, userId: string): Promise<ProcessResult> {
  const payload: EventInput = {
    event_id: `kazik-reverse-${paymentId}`,
    type: "revenue.reversed",
    occurred_at: new Date().toISOString(),
    external_user_id: userId,
    external_payment_id: `kazik-pay-${paymentId}`,
  };
  return sendEvent(payload);
}
