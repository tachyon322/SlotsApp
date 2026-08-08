import { and, count, eq, inArray, gte, lte, sum } from "drizzle-orm";
import { db } from "../db";
import { transaction as transactionTable, user as userTable, promoActivation } from "../db/schema";
import { userCache } from "../lib/userCache";
import { achievementEngine } from "../lib/achievementEngine";
import { getWelcomeBonus } from "../lib/config";
import type { CasinoCore } from "./interfaces";

function depositWhere(userIds: string[], from?: Date, to?: Date) {
  const where = [
    inArray(transactionTable.userId, userIds),
    eq(transactionTable.type, "deposit"),
    eq(transactionTable.status, "success"),
  ];
  if (from) where.push(gte(transactionTable.createdAt, from));
  if (to) where.push(lte(transactionTable.createdAt, to));
  return and(...where);
}

export const casinoCore: CasinoCore = {
  async getWelcomeBonus() {
    return getWelcomeBonus();
  },

  async creditBonus(userId, amount, method, details) {
    return achievementEngine.grantMoneyBonus(userId, amount, method, details);
  },

  async markWelcomeBonusClaimed(userId) {
    await achievementEngine.markBonusClaimed(userId, "welcome");
  },

  async recordPromoActivation(userId, code, amount) {
    await db.insert(promoActivation).values({
      id: crypto.randomUUID(),
      userId,
      code,
      amount,
      createdAt: new Date(),
    });
  },

  async recordPromoEvent(userId) {
    await achievementEngine.recordEvent(userId, "promo");
  },

  async getDepositAggregates(userIds, from, to) {
    if (userIds.length === 0) return [];
    const where = depositWhere(userIds, from, to);
    const rows = await db
      .select({
        userId: transactionTable.userId,
        count: count(),
        sum: sum(transactionTable.amount),
      })
      .from(transactionTable)
      .where(where)
      .groupBy(transactionTable.userId);
    return rows.map((r) => ({
      userId: r.userId,
      count: Number(r.count) || 0,
      sum: Math.floor(Number(r.sum) || 0),
    }));
  },

  async getDepositRows(userIds, from, to) {
    if (userIds.length === 0) return [];
    const where = depositWhere(userIds, from, to);
    const rows = await db
      .select({
        userId: transactionTable.userId,
        amount: transactionTable.amount,
        createdAt: transactionTable.createdAt,
      })
      .from(transactionTable)
      .where(where);
    return rows.map((r) => ({
      userId: r.userId,
      amount: Math.floor(Number(r.amount) || 0),
      createdAt: r.createdAt,
    }));
  },

  async getUserNames(userIds) {
    if (userIds.length === 0) return new Map();
    const rows = await db
      .select({ id: userTable.id, name: userTable.name, email: userTable.email })
      .from(userTable)
      .where(inArray(userTable.id, userIds));
    const map = new Map<string, { name: string; email: string }>();
    for (const r of rows) map.set(r.id, { name: r.name, email: r.email });
    return map;
  },
};
