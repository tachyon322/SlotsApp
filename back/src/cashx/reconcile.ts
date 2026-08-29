import { cashxConfig } from "./config";
import { db } from "../db";
import { affiliateClick } from "../affiliate/schema";
import { count, gte } from "drizzle-orm";

let reconcileTimer: ReturnType<typeof setInterval> | null = null;

export function startReconcile(): void {
  if (!cashxConfig.isEnabled()) return;
  if (reconcileTimer) return;
  const run = async () => {
    try {
      const since = new Date(Date.now() - 60 * 60 * 1000);
      const kazikRows = await db.select({ value: count() }).from(affiliateClick).where(gte(affiliateClick.createdAt, since));
      const kazikClicks = Number(kazikRows[0]?.value ?? 0);
      // Try to fetch CashX tracking_clicks count for kazik project via admin stats (best effort)
      let cashxClicks: number | null = null;
      try {
        const res = await fetch(`${cashxConfig.baseUrl}/api/v1/admin/finance/ledger?limit=1`, {
          headers: { Cookie: "" },
        });
        // Not accurate — we just try to fetch via internal counting endpoint if exists
        void res;
      } catch {}
      // If we can't get CashX count, just log kazik clicks and warn if zero but expected
      if (cashxClicks !== null) {
        const drift = Math.abs(kazikClicks - cashxClicks) / Math.max(1, kazikClicks);
        if (drift > 0.05) {
          console.error(`[cashx-reconcile] drift ${kazikClicks} kazik vs ${cashxClicks} cashx last 1h drift ${(drift * 100).toFixed(1)}%`);
        }
      } else {
        // Fallback: just report kazik clicks; CashX check requires DB access, skip
        if (kazikClicks > 0) {
          console.log(`[cashx-reconcile] kazik clicks last 1h: ${kazikClicks} (cashx check via DB requires CASHX_ADMIN_DATABASE_URL)`);
        }
      }
    } catch (e) {
      console.warn("[cashx-reconcile] failed", e);
    }
  };
  void run();
  reconcileTimer = setInterval(() => void run(), 60 * 60 * 1000);
}

export function stopReconcile(): void {
  clearInterval(reconcileTimer as unknown as number);
  reconcileTimer = null;
}
