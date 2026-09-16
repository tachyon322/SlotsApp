import { eq } from "drizzle-orm";
import { db } from "../db";
import { user as userTable } from "../db/schema";
import { creditDeposit } from "./depositCredit";
import { affiliateService } from "../affiliate/service";

const PREMIUM_LIFETIME = "2099-12-31T23:59:59.000Z";

export type CreditablePayment = {
  id: string;
  userId: string;
  purpose: string;
  method: string;
  amount: number;
};

/**
 * Credit a provider-confirmed payment according to its purpose:
 *   premium      -> lifetime premiumUntil + partner commission
 *   verification -> verifiedForPayment + partner commission
 *   deposit      -> deposit into the balance (with the 100% bonus)
 *
 * Must be called only AFTER the payment row was atomically claimed
 * (credited: false -> true) so the credit can never run twice.
 */
export async function creditConfirmedPayment(row: CreditablePayment, now: Date): Promise<void> {
  if (row.purpose === "premium") {
    await db
      .update(userTable)
      .set({ premiumUntil: new Date(PREMIUM_LIFETIME), updatedAt: new Date() })
      .where(eq(userTable.id, row.userId));
    void affiliateService
      .creditDepositCommission(row.userId, row.amount, row.id, now, "gate")
      .catch((e) => {
        console.error("[paymentCredit] premium commission failed:", e);
      });
  } else if (row.purpose === "verification") {
    await db
      .update(userTable)
      .set({ verifiedForPayment: true, updatedAt: new Date() })
      .where(eq(userTable.id, row.userId));
    void affiliateService
      .creditDepositCommission(row.userId, row.amount, row.id, now, "gate")
      .catch((e) => {
        console.error("[paymentCredit] verification commission failed:", e);
      });
  } else {
    const method = row.method === "card" ? "Банковская карта" : "СБП";
    await creditDeposit(row.userId, row.amount, method, now, row.id);
  }
}
