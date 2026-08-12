import { db } from "../db";
import { transaction } from "../db/schema";
import { userCache } from "./userCache";
import { affiliateCounters } from "./affiliateCounters";
import { affiliateService } from "../affiliate/service";

/**
 * Credit a deposit: adjust the balance, record deposit + bonus transactions and
 * attribute the deposit to affiliate counters / partner commission.
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
): Promise<void> {
  const bonusAmount = amount;
  const totalAmount = amount + bonusAmount;

  await userCache.adjustUserBalance(userId, totalAmount);

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

  // Attribute the deposit to the user's affiliate source (if any) in Redis.
  void affiliateCounters.recordDeposit(userId, amount, now);
  // Credit the partner's balance with the commission on this deposit.
  void affiliateService.creditDepositCommission(userId, amount, now);
}
