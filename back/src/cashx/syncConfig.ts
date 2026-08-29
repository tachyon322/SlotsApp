import { cashxConfig } from "./config";
import { fetchAdmin } from "./client";
import { getMinWithdraw, getSbpFeeFlat, getSbpFeePercent, getUsdtRate } from "../lib/config";

let timer: ReturnType<typeof setInterval> | null = null;

export function startCashxConfigSync(): void {
  if (!cashxConfig.isEnabled()) return;
  if (timer) return;
  const run = async () => {
    try {
      const [usdtRate, sbpFlat, sbpPercent, minWithdraw] = await Promise.all([
        getUsdtRate(),
        getSbpFeeFlat(),
        getSbpFeePercent(),
        getMinWithdraw(),
      ]);
      // CashX expects: usdt_rate numeric, sbp_fee_flat_kopecks bigint, sbp_fee_percent_bps int, min_withdraw_kopecks bigint
      const payload = {
        usdt_rate: usdtRate,
        sbp_fee_flat_kopecks: sbpFlat,
        sbp_fee_percent_bps: Math.floor(sbpPercent * 100),
        min_withdraw_kopecks: minWithdraw,
      };
      // Try to get current rules
      const current = await fetchAdmin<Record<string, unknown>>("/api/v1/admin/finance/rules").catch(() => null);
      const same =
        current &&
        Number(current["usdt_rate"]) === payload.usdt_rate &&
        Number(current["sbp_fee_flat_kopecks"]) === payload.sbp_fee_flat_kopecks &&
        Number(current["sbp_fee_percent_bps"]) === payload.sbp_fee_percent_bps &&
        Number(current["min_withdraw_kopecks"]) === payload.min_withdraw_kopecks;
      if (same) return;
      await fetchAdmin("/api/v1/admin/finance/rules", { method: "PUT", body: JSON.stringify(payload) });
      console.log("[cashx-sync] payout_rules synced", payload);
    } catch (e) {
      console.warn("[cashx-sync] payout_rules sync failed", e);
    }
  };
  void run();
  timer = setInterval(() => void run(), 5 * 60 * 1000);
}

export function stopCashxConfigSync(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
