const rawBase = process.env.KAZIK_CASHX_BASE_URL || process.env.CASHX_API_ORIGIN || "http://cashx-backend:8080";
const rawRedirect = process.env.KAZIK_CASHX_REDIRECT_BASE || process.env.CASHX_REDIRECT_BASE || rawBase.replace(":8080", ":8081");
const syncEnv = process.env.KAZIK_CASHX_SYNC || "false";
const keyId = process.env.KAZIK_CASHX_KEY_ID || "";
const secret = process.env.KAZIK_CASHX_SECRET || "";
const clickSecret = process.env.KAZIK_CASHX_CLICK_TOKEN_SECRET || process.env.CASHX_CLICK_TOKEN_SECRET || "";
const projectSlug = process.env.KAZIK_CASHX_PROJECT_SLUG || "kazik";
const adminEmail = process.env.CASHX_ADMIN_EMAIL || process.env.KAZIK_CASHX_ADMIN_EMAIL || "admin@cashx.local";
const adminPassword = process.env.CASHX_ADMIN_PASSWORD || process.env.KAZIK_CASHX_ADMIN_PASSWORD || "";

const syncEnabled = syncEnv === "true" || syncEnv === "1";

let warned = false;

export const cashxConfig = {
  baseUrl: rawBase.replace(/\/$/, ""),
  redirectBase: rawRedirect.replace(/\/$/, ""),
  projectSlug,
  keyId,
  secret,
  clickTokenSecret: clickSecret,
  syncEnabled,
  adminEmail,
  adminPassword,
  isEnabled(): boolean {
    if (!syncEnabled) return false;
    if (!keyId || !secret) {
      if (!warned) {
        console.warn("[cashx-sync] KAZIK_CASHX_SYNC=true but KAZIK_CASHX_KEY_ID/SECRET empty — sync disabled");
        warned = true;
      }
      return false;
    }
    return true;
  },
};
