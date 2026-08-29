import { cashxConfig } from "./config";
import { sendEvent, mirrorPartner as clientMirrorPartner, mirrorSource as clientMirrorSource, mirrorWithdrawal as clientMirrorWithdrawal, fetchAdmin } from "./client";
import type { EventInput } from "./client";

type AffiliatePartner = { id: string; email: string; name: string; commissionPercent: number; isActive: boolean };
type AffiliateSource = { id: string; code: string; name: string; comment?: string | null; groupId?: string | null; partnerId: string };

export async function syncClick(sourceId: string, meta: { ip?: string; userAgent?: string; referrer?: string }, code: string): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  try {
    const url = `${cashxConfig.redirectBase}/c/${encodeURIComponent(code.toUpperCase())}`;
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "X-Forwarded-For": meta.ip ?? "",
        "User-Agent": meta.userAgent ?? "kazik-sync",
        Referer: meta.referrer ?? "",
      },
      redirect: "manual",
      signal: controller.signal,
    }).catch(() => null);
    clearTimeout(t);
    if (res) {
      const loc = res.headers.get("location") ?? res.headers.get("Location") ?? "";
      if (loc.includes("click_token")) {
        // debug — token captured implicitly via redirect
      }
    }
    void sourceId;
  } catch (e) {
    console.error("[cashx-sync] syncClick failed", e);
  }
}

export async function syncAttribution(userId: string, ref?: string, clickToken?: string): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  try {
    const token = clickToken?.trim() ?? "";
    const payload: EventInput = {
      event_id: `kazik-signup-${userId}`,
      type: "registration.created",
      occurred_at: new Date().toISOString(),
      external_user_id: userId,
      click_token: token || undefined,
    };
    const result = await sendEvent(payload);
    if (result.status === "ignored" && result.reason === "invalid_click_token") {
      console.warn("[cashx-sync] attribution ignored invalid_click_token for user", userId, "ref", ref);
    }
  } catch (e) {
    console.error("[cashx-sync] syncAttribution failed", e);
  }
}

export async function syncCommission(userId: string, paymentId: string, amountKopecks: number): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  try {
    const payload: EventInput = {
      event_id: `kazik-payment-${paymentId}`,
      type: "revenue.confirmed",
      occurred_at: new Date().toISOString(),
      external_user_id: userId,
      external_payment_id: paymentId,
      amount_kopecks: Math.floor(amountKopecks),
      currency: "RUB",
    };
    await sendEvent(payload);
  } catch (e) {
    console.error("[cashx-sync] syncCommission failed", e);
  }
}

export async function syncReversed(paymentId: string, userId: string): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  try {
    const payload: EventInput = {
      event_id: `kazik-reverse-${paymentId}`,
      type: "revenue.reversed",
      occurred_at: new Date().toISOString(),
      external_user_id: userId,
      external_payment_id: paymentId,
    };
    await sendEvent(payload);
  } catch (e) {
    console.error("[cashx-sync] syncReversed failed", e);
  }
}

export async function syncPartner(partner: AffiliatePartner): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  try {
    await clientMirrorPartner({ id: partner.id, email: partner.email, name: partner.name, commissionPercent: partner.commissionPercent, isActive: partner.isActive });
  } catch (e) {
    console.error("[cashx-sync] syncPartner failed", e);
  }
}

export async function syncSource(source: AffiliateSource): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  try {
    await clientMirrorSource({ id: source.id, code: source.code, name: source.name, comment: source.comment, groupId: source.groupId });
  } catch (e) {
    console.error("[cashx-sync] syncSource failed", e);
  }
}

export async function deleteSource(_id: string): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  console.log("[cashx-sync] deleteSource skipped — no CashX equivalent");
}

export async function syncGroup(_group: { id: string; name: string; comment?: string | null }): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  console.log("[cashx-sync] syncGroup skipped — groups are per-partner in CashX, handled lazily via sources");
}

export async function deleteGroup(_id: string): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  console.log("[cashx-sync] deleteGroup skipped");
}

export async function syncWithdrawal(withdrawal: { id: string; partnerId: string; amount: number; method: string; requisites: string; bank?: string | null; fee: number; rate?: number | null; usdtAmount?: number | null; status: string }): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  try {
    await clientMirrorWithdrawal(withdrawal);
  } catch (e) {
    console.error("[cashx-sync] syncWithdrawal failed", e);
  }
}

export async function decideWithdrawal(withdrawalId: string, decision: "approved" | "rejected", comment?: string): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  try {
    const path = `/api/v1/admin/withdrawals/${withdrawalId}/decide`;
    await fetchAdmin(path, { method: "POST", body: JSON.stringify({ decision, comment }) }).catch(async () => {
      const list = await fetchAdmin<unknown>(`/api/v1/admin/withdrawals?limit=100`).catch(() => null) as unknown as Record<string, unknown> | null;
      const items = Array.isArray((list as Record<string, unknown>)?.["items"]) ? ((list as Record<string, unknown>)["items"] as unknown[]) : [];
      const found = items.find((it) => {
        if (typeof it !== "object" || it === null) return false;
        const rec = it as Record<string, unknown>;
        return rec["legacy_kazik_withdrawal_id"] === withdrawalId && typeof rec["id"] === "string";
      }) as Record<string, unknown> | undefined;
      const cid = found?.["id"] as string | undefined;
      if (cid) {
        await fetchAdmin(`/api/v1/admin/withdrawals/${cid}/decide`, { method: "POST", body: JSON.stringify({ decision, comment }) });
      } else {
        console.warn("[cashx-sync] decideWithdrawal no cashx id for", withdrawalId);
      }
    });
  } catch (e) {
    console.error("[cashx-sync] decideWithdrawal failed", e);
  }
}
