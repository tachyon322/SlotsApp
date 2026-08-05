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
    method: text("method"), // e.g. 'СБП', 'Банковская карта', 'Промокод WELCOME1000'
    details: text("details"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("transactions_user_id_idx").on(t.userId),
    index("transactions_created_at_idx").on(t.createdAt),
    index("transactions_type_idx").on(t.type),
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
    index("cases_rounds_created_at_idx").on(t.createdAt),
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


