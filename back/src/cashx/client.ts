// HMAC client for the CashX integrations API. This is the only channel
// through which kazik writes partner data: CashX is the source of truth
// (partner balances, commissions, withdrawals live there), kazik only sends
// click/registration/revenue events and reads source lookups.
import { cashxConfig } from "./config";
import { createHmac } from "node:crypto";

export type EventInput = {
  event_id: string;
  type: "registration.created" | "revenue.confirmed" | "revenue.reversed";
  occurred_at: string;
  external_user_id: string;
  click_token?: string;
  source_code?: string;
  external_payment_id?: string;
  amount_kopecks?: number;
  currency?: "RUB";
  kind?: "deposit" | "gate";
};

export type EventSource = {
  code: string;
  type: string;
  is_promo: boolean;
  registration_bonus?: number;
};

export type ProcessResult = {
  status: "accepted" | "duplicate" | "ignored";
  reason?: string;
  source?: EventSource;
};

export type SourceInfo = {
  code: string;
  type: string;
  is_promo: boolean;
  is_active: boolean;
  access_active: boolean;
  registration_bonus?: number;
};

const RETRY_DELAYS_MS = [500, 2000];

function signBody(secret: string, body: string): { ts: string; sig: string } {
  const ts = Math.floor(Date.now() / 1000).toString();
  const canonical = ts + "." + body;
  const sig = createHmac("sha256", secret).update(canonical).digest("hex");
  return { ts, sig };
}

function authHeaders(body: string): Record<string, string> {
  const { ts, sig } = signBody(cashxConfig.secret, body);
  return {
    "Content-Type": "application/json",
    "X-CashX-Key": cashxConfig.keyId,
    "X-CashX-Timestamp": ts,
    "X-CashX-Signature": sig,
  };
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 6000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Retryable only for transport failures and 5xx: CashX guarantees
// idempotency by event_id/payment_id, so a replay after a timeout is safe.
async function shouldRetry(res: Response | null, err: unknown): Promise<boolean> {
  if (err) return true; // network error / timeout
  if (!res) return true;
  if (res.status >= 500) {
    await res.text().catch(() => "");
    return true;
  }
  return false;
}

/**
 * Send one signed event to CashX with transport retries (3 attempts).
 * Retries cover network errors and 5xx only; 4xx means the payload was
 * processed and rejected (e.g. ignored/no_attribution) — no retry.
 */
export async function sendEvent(input: EventInput): Promise<ProcessResult> {
  if (!cashxConfig.isEnabled()) {
    return { status: "ignored", reason: "sync_disabled" };
  }
  const body = JSON.stringify(input);
  const url = `${cashxConfig.baseUrl}/api/v1/integrations/events`;

  let lastError: unknown = null;
  let lastRes: Response | null = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt - 1]));
    try {
      const res = await fetchWithTimeout(url, { method: "POST", headers: authHeaders(body), body });
      lastRes = res;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) {
        console.error("[cashx] sendEvent http", res.status, input.type, input.event_id, data);
        if (await shouldRetry(res, null)) {
          lastError = new Error(`http_${res.status}`);
          continue;
        }
        const msg = typeof data["message"] === "string" ? (data["message"] as string) : `http_${res.status}`;
        return { status: "ignored", reason: msg };
      }
      const status = typeof data["status"] === "string" ? (data["status"] as ProcessResult["status"]) : "accepted";
      const reason = typeof data["reason"] === "string" ? (data["reason"] as string) : undefined;
      const source = isEventSource(data["source"]) ? data["source"] : undefined;
      return { status, reason, source };
    } catch (e) {
      lastError = e;
      lastRes = null;
      if (!(await shouldRetry(null, e))) break;
    }
  }
  console.error("[cashx] sendEvent failed after retries", input.type, input.event_id, lastRes?.status ?? "", lastError);
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function isEventSource(v: unknown): v is EventSource {
  return typeof v === "object" && v !== null && typeof (v as EventSource).code === "string";
}

/**
 * Resolve a source (tracking link / promo code) inside the kazik project
 * scope: GET /api/v1/integrations/source?code=…&click_token=… (HMAC). Returns null when
 * the code/token is unknown; throws on transport errors.
 */
export async function lookupSource(code?: string, clickToken?: string): Promise<SourceInfo | null> {
  if (!cashxConfig.isEnabled()) return null;
  const params = new URLSearchParams();
  const normalized = code?.trim().toUpperCase();
  if (normalized) params.set("code", normalized);
  const token = clickToken?.trim();
  if (token) params.set("click_token", token);
  if (!params.toString()) return null;

  const url = `${cashxConfig.baseUrl}/api/v1/integrations/source?${params.toString()}`;
  const res = await fetchWithTimeout(url, { method: "GET", headers: authHeaders("") });
  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`cashx source lookup ${res.status} ${text}`);
  }
  return (await res.json()) as SourceInfo;
}
