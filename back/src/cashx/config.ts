// CashX integration config: kazik is a client of the reusable CashX
// partner platform (source of truth for partners/offers/money). All kazik
// writes go through the HMAC-signed integrations API; redirects are served
// by the CashX redirect service.
const rawBase = process.env.KAZIK_CASHX_BASE_URL || process.env.CASHX_API_ORIGIN || "https://cashxpay.cc";
const rawRedirect = process.env.KAZIK_CASHX_REDIRECT_BASE || process.env.CASHX_REDIRECT_BASE || rawBase;
const syncEnv = process.env.KAZIK_CASHX_SYNC || "false";
const keyId = process.env.KAZIK_CASHX_KEY_ID || "";
const secret = process.env.KAZIK_CASHX_SECRET || "";

const syncEnabled = syncEnv === "true" || syncEnv === "1";

let warned = false;

export const cashxConfig = {
  baseUrl: rawBase.replace(/\/$/, ""),
  redirectBase: rawRedirect.replace(/\/$/, ""),
  keyId,
  secret,
  syncEnabled,
  isEnabled(): boolean {
    if (!syncEnabled) return false;
    if (!keyId || !secret) {
      if (!warned) {
        console.warn("[cashx] KAZIK_CASHX_SYNC=true but KAZIK_CASHX_KEY_ID/SECRET empty — events disabled");
        warned = true;
      }
      return false;
    }
    return true;
  },
};
