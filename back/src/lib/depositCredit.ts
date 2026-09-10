import { db } from "../db";
import { transaction } from "../db/schema";
import { userCache } from "./userCache";
import { affiliateService } from "../affiliate/service";

/**
 * Credit a deposit: adjust the balance, record deposit + bonus transactions
 * and report the deposit to CashX so the partner commission is credited
 * there (CashX is the partner source of truth; local affiliate_* is frozen).
 *
 * Called only after the payment has been confirmed by the provider (webhook PAID)
 * AND the receipt has been attached. Guards against duplicate crediting live in
 * the callers, which claim the row via an atomic conditional update.
 */
export async function creditDeposit(
  userId: string,
  amount: number,
  method: string,
  now: Date,
  paymentId: string,
): Promise<void> {
  const bonusAmount = amount;
  const totalAmount = amount + bonusAmount;

  await userCache.adjustUserBalance(userId, totalAmount);

  // Баланс уже зачислен: падение инсерта не должно приводить к 500/повтору
  // вебхука (это дало бы двойное зачисление). Логируем — восстановят по следу.
  try {
    await db.insert(transaction).values([
      {
        id: crypto.randomUUID(),
        userId,
        type: "deposit",
        amount,
        status: "success",
        method,
        details: "Пополнение баланса",
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        userId,
        type: "bonus",
        amount: bonusAmount,
        status: "success",
        method: "Бонус 100%",
        details: "Бонус за депозит",
        createdAt: new Date(now.getTime() + 10),
      },
    ]);
  } catch (e) {
    console.error("[Deposit] deposit/bonus transaction insert failed:", e);
  }

  // Report the deposit to CashX (partner commission is credited there).
  // Fire-and-forget with a catch: an unhandled rejection would crash the
  // process (Bun default) and can never be allowed to take down money flows.
  void affiliateService.creditDepositCommission(userId, amount, paymentId, now, "deposit").catch((e) => {
    console.error('[Deposit] affiliate commission event failed:', e);
  });
}
