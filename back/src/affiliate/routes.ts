import { Hono, type Context } from "hono";
import { getCookie } from "hono/cookie";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "../lib/auth";
import { getWelcomeBonus } from "../lib/config";
import { affiliateService, type AuthPartner } from "./service";
import { cashxConfig } from "../cashx/config";
import { syncAttribution } from "../cashx/sync";

// After the CashX cutover this router only keeps the two public endpoints the
// casino frontend still needs (registration bonus resolution and player
// attribution) plus the /r redirect passthrough. The partner cabinet, stats,
// sources, partners and withdrawals live in CashX (/cabinet, /admin) —
// partners log in at the CashX web app.

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
  partner: AuthPartner;
};

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

const affiliate = new Hono<{ Variables: Variables }>();

/**
 * Public: registration bonus for a ?ref code and/or click_token. Resolves the source in CashX
 * (sources are created/managed there now); falls back to the frozen local
 * archive when CashX is unreachable. Falls back to the standard welcome
 * bonus when the code has no custom bonus.
 */
affiliate.get("/registration-bonus", async (c) => {
  const cookieRef = getCookie(c, "aff_ref");
  const cookieClickToken = getCookie(c, "click_token");
  const ref = String(c.req.query("ref") || cookieRef || "").trim();
  const clickToken = String(c.req.query("click_token") || c.req.query("clickToken") || cookieClickToken || "").trim();
  const resolved = (ref || clickToken) ? await affiliateService.resolveRegistrationSource(ref, clickToken) : null;
  const bonus = resolved
    ? (resolved.bonus ?? (await getWelcomeBonus()))
    : await getWelcomeBonus();
  return c.json({ bonus });
});

/**
 * Player attribution: forwards the registration to CashX with the click
 * token (from the CashX redirect) and/or the source code (promo codes work
 * without a click). CashX owns the attribution.
 */
affiliate.post("/attrib", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  const body = (await c.req.json().catch(() => ({}))) as { ref?: string; click_token?: string; clickToken?: string };
  const cookieRef = getCookie(c, "aff_ref");
  const cookieClickToken = getCookie(c, "click_token");
  const ref = String(body.ref || cookieRef || "").trim();
  const clickToken = String(body.click_token || body.clickToken || cookieClickToken || c.req.header("x-click-token") || c.req.header("x_click_token") || "").trim();
  if (!cashxConfig.isEnabled()) return c.json({ attributed: false, reason: "cashx_disabled" });
  try {
    const result = await syncAttribution(u.id, ref, clickToken);
    return c.json({ attributed: result.status === "accepted" || result.status === "duplicate", reason: result.reason });
  } catch (e) {
    console.error("[cashx] attrib failed", e);
    return c.json({ attributed: false, reason: "cashx_unreachable" }, 502);
  }
});

const redirect = new Hono();

/**
 * /r/:code — old partner links. Clicks are recorded by CashX (single source
 * of truth), so we just forward to the CashX redirect service: it records
 * the click, picks the weighted destination and returns a signed
 * click_token. Kept for API clients hitting the backend directly; the
 * Next.js /r/[code] route forwards users itself and sets the aff_ref cookie.
 */
redirect.get("/:code", async (c) => {
  const code = String(c.req.param("code") || "").trim().toUpperCase();
  if (!code) return c.redirect(c.req.header("origin") || "/", 302);
  if (!cashxConfig.isEnabled()) return c.json({ message: "cashx disabled" }, 503);
  return c.redirect(`${cashxConfig.redirectBase}/c/${encodeURIComponent(code)}`, 302);
});

export { affiliate as affiliateRoutes, redirect as redirectRoutes };
