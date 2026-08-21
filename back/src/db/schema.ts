import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  doublePrecision,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const user = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    balance: integer("balance").notNull().default(0),
    level: integer("level").notNull().default(1),
    xp: integer("xp").notNull().default(0),
    verifiedForPayment: boolean("verified_for_payment").notNull().default(false),
    premiumUntil: timestamp("premium_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const session = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("sessions_token_unique").on(t.token),
    index("sessions_user_id_idx").on(t.userId),
  ],
);

export const account = pgTable(
  "accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    providerId: text("provider_id").notNull(),
    accountId: text("account_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", {
      withTimezone: true,
    }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", {
      withTimezone: true,
    }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("accounts_user_id_idx").on(t.userId),
    uniqueIndex("accounts_provider_id_account_id_unique").on(
      t.providerId,
      t.accountId,
    ),
  ],
);

export const verification = pgTable(
  "verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("verifications_identifier_idx").on(t.identifier)],
);

export const minesRound = pgTable(
  "mines_rounds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bet: integer("bet").notNull(),
    mines: integer("mines").notNull(),
    opened: integer("opened").notNull().default(0),
    multiplier: doublePrecision("multiplier").notNull().default(0),
    payout: integer("payout").notNull().default(0),
    outcome: text("outcome").notNull(), // 'win' | 'loss'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("mines_rounds_user_id_idx").on(t.userId),
    index("mines_rounds_user_created_id_idx").on(t.userId, t.createdAt, t.id),
    index("mines_rounds_created_at_idx").on(t.createdAt),
  ],
);

export const crashRound = pgTable(
  "crash_rounds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bet: integer("bet").notNull(),
    crashPoint: doublePrecision("crash_point").notNull(),
    multiplier: doublePrecision("multiplier").notNull().default(0),
    payout: integer("payout").notNull().default(0),
    outcome: text("outcome").notNull(), // 'win' | 'loss'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("crash_rounds_user_id_idx").on(t.userId),
    index("crash_rounds_user_created_id_idx").on(t.userId, t.createdAt, t.id),
    index("crash_rounds_created_at_idx").on(t.createdAt),
  ],
);

export const slotsRound = pgTable(
  "slots_rounds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bet: integer("bet").notNull(),
    mode: text("mode").notNull(), // 'classic' | 'mega'
    lines: integer("lines").notNull(),
    lineBet: integer("line_bet").notNull(),
    symbols: text("symbols").notNull(), // JSON string matrix
    winLines: text("win_lines").notNull(), // JSON string array of win lines info
    multiplier: doublePrecision("multiplier").notNull().default(0),
    payout: integer("payout").notNull().default(0),
    outcome: text("outcome").notNull(), // 'win' | 'loss' | 'ldw'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("slots_rounds_user_id_idx").on(t.userId),
    index("slots_rounds_user_created_id_idx").on(t.userId, t.createdAt, t.id),
    index("slots_rounds_created_at_idx").on(t.createdAt),
  ],
);

export const blockblastRound = pgTable(
  "blockblast_rounds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bet: integer("bet").notNull(),
    placements: integer("placements").notNull().default(0),
    multiplier: doublePrecision("multiplier").notNull().default(0),
    payout: integer("payout").notNull().default(0),
    outcome: text("outcome").notNull(), // 'win' | 'loss'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("blockblast_rounds_user_id_idx").on(t.userId),
    index("blockblast_rounds_user_created_id_idx").on(t.userId, t.createdAt, t.id),
    index("blockblast_rounds_created_at_idx").on(t.createdAt),
  ],
);

export const minedropRound = pgTable(
  "minedrop_rounds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bet: integer("bet").notNull(),
    multiplier: doublePrecision("multiplier").notNull().default(0),
    payout: integer("payout").notNull().default(0),
    outcome: text("outcome").notNull(), // 'win' | 'loss'
    details: text("details").notNull(), // JSON: reels per column + destroyed blocks
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("minedrop_rounds_user_id_idx").on(t.userId),
    index("minedrop_rounds_user_created_id_idx").on(t.userId, t.createdAt, t.id),
    index("minedrop_rounds_created_at_idx").on(t.createdAt),
  ],
);

export const transaction = pgTable(
  "transactions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'deposit' | 'withdrawal' | 'bonus' | 'game_win' | 'game_loss'
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("success"), // 'success' | 'pending' | 'failed'
    balanceDebited: boolean("balance_debited").notNull().default(false),
    method: text("method"), // e.g. 'СБП', 'Банковская карта', 'Промокод WELCOME1000'
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("transactions_user_id_idx").on(t.userId),
    index("transactions_user_created_id_idx").on(t.userId, t.createdAt, t.id),
    index("transactions_created_at_idx").on(t.createdAt),
    index("transactions_type_idx").on(t.type),
    // Race-proof guard: at most one pending withdrawal per user. The insert in
    // /withdraw relies on ON CONFLICT DO NOTHING against this index, so two
    // parallel requests can never both debit the balance.
    uniqueIndex("transactions_one_pending_withdrawal_per_user")
      .on(t.userId)
      .where(sql`${t.type} = 'withdrawal' AND ${t.status} = 'pending'`),
  ],
);

export const payment = pgTable(
  "payments",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    paymentId: text("payment_id"),
    amount: integer("amount").notNull(),
    currency: text("currency").notNull().default("rub"),
    method: text("method").notNull(),
    purpose: text("purpose").notNull().default("deposit"),
    status: text("status").notNull().default("NEW"),
    credited: boolean("credited").notNull().default(false),
    link: text("link"),
    receiptUrl: text("receipt_url"),
    receiptUploadedAt: timestamp("receipt_uploaded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("payments_user_id_idx").on(t.userId),
    index("payments_payment_id_idx").on(t.paymentId),
  ],
);

export const promoActivation = pgTable(
  "promo_activations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("promo_activations_user_id_idx").on(t.userId),
    uniqueIndex("promo_activations_user_code_unique").on(t.userId, t.code),
  ],
);

export const userReferralCode = pgTable(
  "user_referral_codes",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("user_referral_codes_code_unique").on(t.code)],
);

export const userReferral = pgTable(
  "user_referrals",
  {
    id: text("id").primaryKey(),
    referrerId: text("referrer_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referredId: text("referred_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rewardAmount: integer("reward_amount").notNull().default(500),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("user_referrals_referred_id_unique").on(t.referredId),
    index("user_referrals_referrer_id_idx").on(t.referrerId),
    index("user_referrals_created_at_idx").on(t.createdAt),
  ],
);

export const wheelSpin = pgTable(
  "wheel_spins",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    prize: integer("prize").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("wheel_spins_user_id_idx").on(t.userId),
    index("wheel_spins_created_at_idx").on(t.createdAt),
  ],
);

export const bonusClaim = pgTable(
  "bonus_claims",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'welcome' | 'install'
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("bonus_claims_user_type_unique").on(t.userId, t.type)],
);

export const achievementClaim = pgTable(
  "achievement_claims",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    achievementId: text("achievement_id").notNull(),
    amount: integer("amount").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("achievement_claims_user_achievement_unique").on(
      t.userId,
      t.achievementId,
    ),
  ],
);

export const challengeClaim = pgTable(
  "challenge_claims",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    challengeId: text("challenge_id").notNull(),
    date: text("date").notNull(),
    amount: integer("amount").notNull(),
    claimedAt: timestamp("claimed_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("challenge_claims_user_challenge_date_unique").on(
      t.userId,
      t.challengeId,
      t.date,
    ),
  ],
);

export const casesRound = pgTable(
  "cases_rounds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    bet: integer("bet").notNull(),
    caseId: text("case_id").notNull(),
    lines: integer("lines").notNull(),
    lineBet: integer("line_bet").notNull(),
    rarity: text("rarity").notNull(),
    multiplier: doublePrecision("multiplier").notNull().default(0),
    payout: integer("payout").notNull().default(0),
    outcome: text("outcome").notNull(), // 'win' | 'loss' | 'neutral'
    details: text("details").notNull(), // JSON details per line
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("cases_rounds_user_id_idx").on(t.userId),
    index("cases_rounds_user_created_id_idx").on(t.userId, t.createdAt, t.id),
    index("cases_rounds_created_at_idx").on(t.createdAt),
  ],
);

export const supportConversation = pgTable(
  "support_conversations",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("support_conversations_user_id_idx").on(t.userId),
    index("support_conversations_updated_at_idx").on(t.updatedAt),
  ],
);

export const supportMessage = pgTable(
  "support_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => supportConversation.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant' | 'operator'
    content: text("content").notNull(),
    messageId: text("message_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("support_messages_conversation_message_unique").on(
      t.conversationId,
      t.messageId,
    ),
    index("support_messages_conversation_created_idx").on(
      t.conversationId,
      t.createdAt,
    ),
  ],
);

export const verificationAttempt = pgTable(
  "verification_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    ageConfirmed: boolean("age_confirmed").notNull().default(false),
    requisites: text("requisites").notNull(),
    method: text("method").notNull(),
    amount: integer("amount").notNull(),
    paymentId: text("payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("verification_attempts_user_id_idx").on(t.userId),
    index("verification_attempts_created_at_idx").on(t.createdAt),
  ],
);

export const schema = {
  user,
  session,
  account,
  verification,
  minesRound,
  crashRound,
  slotsRound,
  casesRound,
  blockblastRound,
  minedropRound,
  wheelSpin,
  transaction,
  promoActivation,
  payment,
  userReferralCode,
  userReferral,
  bonusClaim,
  achievementClaim,
  challengeClaim,
  supportConversation,
  supportMessage,
  verificationAttempt,
};

export type User = typeof user.$inferSelect;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Verification = typeof verification.$inferSelect;
export type MinesRound = typeof minesRound.$inferSelect;
export type CrashRound = typeof crashRound.$inferSelect;
export type SlotsRound = typeof slotsRound.$inferSelect;
export type CasesRound = typeof casesRound.$inferSelect;
export type BlockblastRound = typeof blockblastRound.$inferSelect;
export type MinedropRound = typeof minedropRound.$inferSelect;
export type WheelSpin = typeof wheelSpin.$inferSelect;
export type Transaction = typeof transaction.$inferSelect;
export type PromoActivation = typeof promoActivation.$inferSelect;
export type Payment = typeof payment.$inferSelect;
export type UserReferralCode = typeof userReferralCode.$inferSelect;
export type UserReferral = typeof userReferral.$inferSelect;
export type BonusClaim = typeof bonusClaim.$inferSelect;
export type AchievementClaim = typeof achievementClaim.$inferSelect;
export type ChallengeClaim = typeof challengeClaim.$inferSelect;
export type SupportConversation = typeof supportConversation.$inferSelect;
export type SupportMessage = typeof supportMessage.$inferSelect;
export type VerificationAttempt = typeof verificationAttempt.$inferSelect;
