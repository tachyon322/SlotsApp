/**
 * Internal contract between the affiliate module and the casino core.
 * The affiliate module never touches core tables directly — all access to
 * users, balances, transactions and config goes through this interface.
 */

export type AffiliateSourceType = "link" | "promo";
export type AffiliateSignupKind = "registration" | "promo";

export interface DepositAggregate {
  userId: string;
  count: number;
  sum: number;
}

export interface DepositRow {
  userId: string;
  amount: number;
  createdAt: Date;
}

export interface CasinoCore {
  getWelcomeBonus(): Promise<number>;
  creditBonus(
    userId: string,
    amount: number,
    method: string,
    details: string,
  ): Promise<number>;
  markWelcomeBonusClaimed(userId: string): Promise<void>;
  recordPromoActivation(userId: string, code: string, amount: number): Promise<void>;
  recordPromoEvent(userId: string): Promise<void>;
  getDepositAggregates(
    userIds: string[],
    from?: Date,
    to?: Date,
  ): Promise<DepositAggregate[]>;
  getDepositRows(
    userIds: string[],
    from?: Date,
    to?: Date,
  ): Promise<DepositRow[]>;
  getGatePaymentAggregates(
    userIds: string[],
    from?: Date,
    to?: Date,
  ): Promise<DepositAggregate[]>;
  getGatePaymentRows(
    userIds: string[],
    from?: Date,
    to?: Date,
  ): Promise<DepositRow[]>;
  getUserNames(userIds: string[]): Promise<Map<string, { name: string; email: string }>>;
}
