import { cashxConfig } from "./config";
import { createHmac } from "node:crypto";

export type EventInput = {
  event_id: string;
  type: "registration.created" | "revenue.confirmed" | "revenue.reversed";
  occurred_at: string;
  external_user_id: string;
  click_token?: string;
  external_payment_id?: string;
  amount_kopecks?: number;
  currency?: "RUB";
};

export type ProcessResult = {
  status: "accepted" | "duplicate" | "ignored";
  reason?: string;
};

let adminCookie: string | null = null;
let adminCookieExp = 0;

async function getAdminCookie(): Promise<string | null> {
  const now = Date.now();
  if (adminCookie && now < adminCookieExp) return adminCookie;
  const url = `${cashxConfig.baseUrl}/api/v1/auth/signin/credential`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ credential: cashxConfig.adminEmail, password: cashxConfig.adminPassword }),
    });
    if (!res.ok) {
      console.warn("[cashx-sync] admin login failed", res.status, await res.text().catch(() => ""));
      return null;
    }
    const setCookie = res.headers.get("set-cookie") ?? res.headers.get("Set-Cookie") ?? "";
    const match = setCookie.match(/cashx_session=[^;]+/);
    if (match) {
      adminCookie = match[0];
      adminCookieExp = now + 55 * 60 * 1000;
      return adminCookie;
    }
    const hdrs = res.headers as unknown as { getSetCookie?: () => string[] };
    if (typeof hdrs.getSetCookie === "function") {
      const arr = hdrs.getSetCookie();
      for (const c of arr) if (c.includes("cashx_session")) { adminCookie = c.split(";")[0]; adminCookieExp = now + 55 * 60 * 1000; return adminCookie; }
    }
    return null;
  } catch (e) {
    console.warn("[cashx-sync] admin login error", e);
    return null;
  }
}

function signBody(secret: string, body: string): { ts: string; sig: string } {
  const ts = Math.floor(Date.now() / 1000).toString();
  const canonical = ts + "." + body;
  const sig = createHmac("sha256", secret).update(canonical).digest("hex");
  return { ts, sig };
}

export async function sendEvent(input: EventInput): Promise<ProcessResult> {
  if (!cashxConfig.isEnabled()) {
    return { status: "ignored", reason: "sync_disabled" };
  }
  const body = JSON.stringify(input);
  const { ts, sig } = signBody(cashxConfig.secret, body);
  const url = `${cashxConfig.baseUrl}/api/v1/integrations/events`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CashX-Key": cashxConfig.keyId,
        "X-CashX-Timestamp": ts,
        "X-CashX-Signature": sig,
      },
      body,
      signal: controller.signal,
    });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      console.error("[cashx-sync] sendEvent http", res.status, data);
      const msg = typeof data["message"] === "string" ? (data["message"] as string) : `http_${res.status}`;
      return { status: "ignored", reason: msg };
    }
    const status = typeof data["status"] === "string" ? (data["status"] as ProcessResult["status"]) : "accepted";
    const reason = typeof data["reason"] === "string" ? (data["reason"] as string) : undefined;
    return { status, reason };
  } catch (e) {
    console.error("[cashx-sync] sendEvent failed", e);
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

export async function fetchAdmin<T>(path: string, init?: RequestInit): Promise<T> {
  const cookie = await getAdminCookie();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(init?.headers as Record<string, string>),
  };
  if (cookie) headers["Cookie"] = cookie;
  const url = `${cashxConfig.baseUrl}${path}`;
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`cashx admin ${path} ${res.status} ${text}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

let cachedOfferId: string | null = null;
let cachedProjectId: string | null = null;

type ProjectsList = { items?: unknown[]; data?: unknown[]; projects?: unknown[] };
type OffersList = { items?: unknown[]; data?: unknown[]; offers?: unknown[] };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}
function getString(v: unknown, key: string): string | undefined {
  if (!isRecord(v)) return undefined;
  const val = v[key];
  return typeof val === "string" ? val : undefined;
}
function getArray(v: unknown, keys: string[]): unknown[] | undefined {
  if (!isRecord(v)) return undefined;
  for (const k of keys) {
    const arr = v[k];
    if (Array.isArray(arr)) return arr;
  }
  return undefined;
}

export async function getKazikOfferId(): Promise<string> {
  if (cachedOfferId) return cachedOfferId;
  try {
    const proj = await fetchAdmin<unknown>(`/api/v1/admin/projects?limit=100`);
    const list = getArray(proj, ["items", "data", "projects"]);
    const found = list?.find((p) => getString(p, "slug") === cashxConfig.projectSlug || getString(p, "slug") === "kazik");
    if (found) cachedProjectId = getString(found, "id") ?? null;
    else {
      const single = await fetchAdmin<unknown>(`/api/v1/admin/projects?slug=${cashxConfig.projectSlug}`).catch(() => null);
      if (single && isRecord(single)) cachedProjectId = getString(single, "id") ?? getString((single as Record<string, unknown>)["project"], "id") ?? null;
    }
    if (!cachedProjectId) {
      const offers = await fetchAdmin<unknown>(`/api/v1/admin/offers?limit=100`);
      const oList = getArray(offers, ["items", "data", "offers"]);
      const active = oList?.find((o) => getString(o, "status") === "active" && getString(o, "project_id") === cachedProjectId);
      if (active && getString(active, "id")) { cachedOfferId = getString(active, "id")!; return cachedOfferId; }
      throw new Error("project not found");
    }
    const offers = await fetchAdmin<unknown>(`/api/v1/admin/offers?project_id=${cachedProjectId}&limit=100`).catch(async () => {
      return await fetchAdmin<unknown>(`/api/v1/admin/offers?limit=100`);
    });
    const oList = getArray(offers, ["items", "data", "offers"]);
    const active = oList?.find((o) => getString(o, "status") === "active");
    if (active && getString(active, "id")) {
      cachedOfferId = getString(active, "id")!;
      return cachedOfferId;
    }
    const pub = await fetch(`${cashxConfig.baseUrl}/api/v1/offers?project=${cashxConfig.projectSlug}`).then(r => r.json()).catch(() => null) as unknown;
    if (isRecord(pub) && getString(pub, "id")) { cachedOfferId = getString(pub, "id")!; return cachedOfferId; }
    throw new Error("active offer not found for kazik");
  } catch (e) {
    console.error("[cashx-sync] getKazikOfferId failed", e);
    throw e;
  }
}

export async function mirrorPartner(partner: { id: string; email: string; name: string; commissionPercent: number; isActive?: boolean }): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  const bps = Math.max(0, Math.min(10000, Math.floor(partner.commissionPercent * 100)));
  try {
    const cookie = await getAdminCookie();
    if (!cookie) {
      console.warn("[cashx-sync] mirrorPartner no admin cookie");
      return;
    }
    const res = await fetch(`${cashxConfig.baseUrl}/api/v1/admin/partners`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ email: partner.email.toLowerCase(), name: partner.name, password: "TempPass123!" }),
    });
    if (res.ok) {
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      const pid = (getString(data, "id") ?? getString(data["partner"], "id")) as string | undefined;
      if (pid && bps !== 4000) {
        await fetch(`${cashxConfig.baseUrl}/api/v1/admin/partners/${pid}/rate`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Cookie: cookie },
          body: JSON.stringify({ rate_bps: bps }),
        }).catch(() => {});
      }
      return;
    }
    if (res.status === 409 || res.status === 400) {
      const text = await res.text().catch(() => "");
      if (text.includes("email") || text.includes("taken") || text.includes("exists")) {
        const list = await fetchAdmin<unknown>(`/api/v1/admin/partners?search=${encodeURIComponent(partner.email)}`).catch(() => null);
        const items = getArray(list, ["items", "data"]);
        const found = items?.find((p) => {
          const email = getString(p, "email");
          return email?.toLowerCase() === partner.email.toLowerCase();
        });
        const foundId = found ? getString(found, "id") : undefined;
        if (foundId) {
          await fetch(`${cashxConfig.baseUrl}/api/v1/admin/partners/${foundId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({ name: partner.name }),
          }).catch(() => {});
          await fetch(`${cashxConfig.baseUrl}/api/v1/admin/partners/${foundId}/rate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Cookie: cookie },
            body: JSON.stringify({ rate_bps: bps }),
          }).catch(() => {});
        }
        return;
      }
    }
    console.warn("[cashx-sync] mirrorPartner failed", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.error("[cashx-sync] mirrorPartner error", e);
  }
}

export async function mirrorSource(source: { id: string; code: string; name: string; comment?: string | null; groupId?: string | null }): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  try {
    const offerId = await getKazikOfferId().catch(() => null);
    if (!offerId) {
      console.warn("[cashx-sync] mirrorSource no offerId");
      return;
    }
    const cookie = await getAdminCookie();
    if (!cookie) return;
    const mirrorRes = await fetch(`${cashxConfig.baseUrl}/api/v1/admin/tracking_links/mirror`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ legacy_kazik_source_id: source.id, code: source.code.toUpperCase(), name: source.name, comment: source.comment, group_id: source.groupId }),
    });
    if (mirrorRes.ok || mirrorRes.status === 409 || mirrorRes.status === 404) {
      if (mirrorRes.status === 404) {
        console.log("[cashx-sync] mirrorSource no admin endpoint, skipping — no CashX equivalent for source creation via admin");
      }
      return;
    }
    console.log("[cashx-sync] mirrorSource fallback skipped", mirrorRes.status);
  } catch (e) {
    console.error("[cashx-sync] mirrorSource error", e);
  }
}

export async function mirrorWithdrawal(withdrawal: { id: string; partnerId: string; amount: number; method: string; requisites: string; bank?: string | null; fee: number; rate?: number | null; usdtAmount?: number | null; status: string }): Promise<void> {
  if (!cashxConfig.isEnabled()) return;
  try {
    const cookie = await getAdminCookie();
    if (!cookie) return;
    const res = await fetch(`${cashxConfig.baseUrl}/api/v1/admin/withdrawals/mirror`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({
        legacy_kazik_withdrawal_id: withdrawal.id,
        legacy_kazik_partner_id: withdrawal.partnerId,
        amount_kopecks: withdrawal.amount,
        method: withdrawal.method,
        requisites: withdrawal.requisites,
        bank: withdrawal.bank,
        fee_kopecks: withdrawal.fee,
        rate: withdrawal.rate,
        usdt_amount: withdrawal.usdtAmount,
        status: withdrawal.status,
      }),
    });
    if (!res.ok && res.status !== 409) {
      console.warn("[cashx-sync] mirrorWithdrawal failed", res.status, await res.text().catch(() => ""));
    }
  } catch (e) {
    console.error("[cashx-sync] mirrorWithdrawal error", e);
  }
}
