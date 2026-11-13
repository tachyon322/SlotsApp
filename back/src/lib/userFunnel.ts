import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { payment as paymentTable, transaction, user as userTable } from "../db/schema";

/**
 * Воронка «депозит → верификация → премиум → вывод» в том виде, в котором её
 * показывает админка. Расчёт живёт здесь, а не в роутах: страница
 * «Пользователи» и раздел «Поддержка» обязаны показывать ОДИН и тот же этап,
 * иначе оператор принимает решения по разным цифрам.
 */
export type AdminUserFunnel = {
  hasDeposit: boolean;
  hasPaidVerification: boolean;
  verifiedForPayment: boolean;
  premiumActive: boolean;
  hasWithdrawn: boolean;
};

export type AdminPendingWithdrawal = {
  amount: number;
  method: string | null;
  details: string | null;
  createdAt: string;
};

export type AdminFunnelSnapshot = {
  funnel: AdminUserFunnel;
  pendingWithdrawal: AdminPendingWithdrawal | null;
};

export function emptyFunnelSnapshot(): AdminFunnelSnapshot {
  return {
    funnel: {
      hasDeposit: false,
      hasPaidVerification: false,
      verifiedForPayment: false,
      premiumActive: false,
      hasWithdrawn: false,
    },
    pendingWithdrawal: null,
  };
}

/**
 * Батч-выборка воронки для набора пользователей: пять запросов на пачку,
 * независимо от её размера (страница поддержки — 50 диалогов).
 */
export async function loadUserFunnels(
  userIds: string[],
): Promise<Map<string, AdminFunnelSnapshot>> {
  const ids = [...new Set(userIds)];
  const result = new Map<string, AdminFunnelSnapshot>();
  if (ids.length === 0) return result;

  const [deposited, verified, withdrawn, pending, gates] = await Promise.all([
    db
      .select({ userId: transaction.userId })
      .from(transaction)
      .where(
        and(
          eq(transaction.type, "deposit"),
          eq(transaction.status, "success"),
          inArray(transaction.userId, ids),
        ),
      )
      .groupBy(transaction.userId),
    db
      .select({ userId: paymentTable.userId })
      .from(paymentTable)
      .where(
        and(
          eq(paymentTable.purpose, "verification"),
          eq(paymentTable.status, "PAID"),
          eq(paymentTable.credited, true),
          inArray(paymentTable.userId, ids),
        ),
      )
      .groupBy(paymentTable.userId),
    db
      .select({ userId: transaction.userId })
      .from(transaction)
      .where(
        and(
          eq(transaction.type, "withdrawal"),
          eq(transaction.status, "success"),
          inArray(transaction.userId, ids),
        ),
      )
      .groupBy(transaction.userId),
    db
      .select({
        userId: transaction.userId,
        amount: transaction.amount,
        method: transaction.method,
        details: transaction.details,
        createdAt: transaction.createdAt,
      })
      .from(transaction)
      .where(
        and(
          eq(transaction.type, "withdrawal"),
          eq(transaction.status, "pending"),
          inArray(transaction.userId, ids),
        ),
      ),
    db
      .select({
        userId: userTable.id,
        verifiedForPayment: userTable.verifiedForPayment,
        premiumUntil: userTable.premiumUntil,
      })
      .from(userTable)
      .where(inArray(userTable.id, ids)),
  ]);

  const depositSet = new Set(deposited.map((r) => r.userId));
  const verificationSet = new Set(verified.map((r) => r.userId));
  const withdrawnSet = new Set(withdrawn.map((r) => r.userId));
  const gateMap = new Map(gates.map((g) => [g.userId, g]));
  const pendingMap = new Map<string, AdminPendingWithdrawal>();
  for (const w of pending) {
    pendingMap.set(w.userId, {
      amount: w.amount,
      method: w.method,
      details: w.details,
      createdAt: w.createdAt.toISOString(),
    });
  }

  const now = Date.now();
  for (const id of ids) {
    const gate = gateMap.get(id);
    result.set(id, {
      funnel: {
        hasDeposit: depositSet.has(id),
        hasPaidVerification: verificationSet.has(id),
        verifiedForPayment: Boolean(gate?.verifiedForPayment),
        premiumActive: gate?.premiumUntil ? gate.premiumUntil.getTime() > now : false,
        hasWithdrawn: withdrawnSet.has(id),
      },
      pendingWithdrawal: pendingMap.get(id) ?? null,
    });
  }

  return result;
}
