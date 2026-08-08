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

export const affiliateGroup = pgTable(
  "affiliate_groups",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    comment: text("comment"),
    commissionPercent: doublePrecision("commission_percent").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("affiliate_groups_created_at_idx").on(t.createdAt)],
);

export const affiliateRedirect = pgTable(
  "affiliate_redirects",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("affiliate_redirects_created_at_idx").on(t.createdAt)],
);

export const affiliateRedirectUrl = pgTable(
  "affiliate_redirect_urls",
  {
    id: text("id").primaryKey(),
    redirectId: text("redirect_id")
      .notNull()
      .references(() => affiliateRedirect.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    weight: integer("weight").notNull().default(1),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("affiliate_redirect_urls_redirect_id_idx").on(t.redirectId)],
);

export const affiliatePartner = pgTable(
  "affiliate_partners",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    emailVerified: boolean("email_verified").notNull().default(false),
    image: text("image"),
    authToken: text("auth_token"),
    isOwner: boolean("is_owner").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("affiliate_partners_email_unique").on(t.email),
    index("affiliate_partners_created_at_idx").on(t.createdAt),
  ],
);

export const affiliatePartnerSession = pgTable(
  "affiliate_partner_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => affiliatePartner.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("affiliate_partner_sessions_token_unique").on(t.token),
    index("affiliate_partner_sessions_user_id_idx").on(t.userId),
  ],
);

export const affiliatePartnerAccount = pgTable(
  "affiliate_partner_accounts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => affiliatePartner.id, { onDelete: "cascade" }),
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
    index("affiliate_partner_accounts_user_id_idx").on(t.userId),
    uniqueIndex("affiliate_partner_accounts_provider_id_account_id_unique").on(
      t.providerId,
      t.accountId,
    ),
  ],
);

export const affiliatePartnerVerification = pgTable(
  "affiliate_partner_verifications",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("affiliate_partner_verifications_identifier_idx").on(t.identifier),
  ],
);

export const affiliateAuthSchema = {
  user: affiliatePartner,
  session: affiliatePartnerSession,
  account: affiliatePartnerAccount,
  verification: affiliatePartnerVerification,
};

export const affiliateDomain = pgTable(
  "affiliate_domains",
  {
    id: text("id").primaryKey(),
    url: text("url").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    comment: text("comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("affiliate_domains_url_unique").on(t.url),
    index("affiliate_domains_created_at_idx").on(t.createdAt),
  ],
);

export const affiliateSource = pgTable(
  "affiliate_sources",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(), // 'link' | 'promo'
    registrationBonus: integer("registration_bonus"), // nullable -> override standard welcome bonus
    groupId: text("group_id").references(() => affiliateGroup.id, {
      onDelete: "set null",
    }),
    partnerId: text("partner_id")
      .notNull()
      .references(() => affiliatePartner.id, { onDelete: "cascade" }),
    redirectId: text("redirect_id").references(() => affiliateRedirect.id, {
      onDelete: "set null",
    }),
    domain: text("domain"), // nullable -> use panel's own origin
    comment: text("comment"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("affiliate_sources_code_unique").on(t.code),
    index("affiliate_sources_group_id_idx").on(t.groupId),
    index("affiliate_sources_partner_id_idx").on(t.partnerId),
    index("affiliate_sources_redirect_id_idx").on(t.redirectId),
    index("affiliate_sources_created_at_idx").on(t.createdAt),
  ],
);

export const affiliateClick = pgTable(
  "affiliate_clicks",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => affiliateSource.id, { onDelete: "cascade" }),
    ip: text("ip"),
    userAgent: text("user_agent"),
    referrer: text("referrer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("affiliate_clicks_source_id_idx").on(t.sourceId),
    index("affiliate_clicks_created_at_idx").on(t.createdAt),
    index("affiliate_clicks_source_created_idx").on(t.sourceId, t.createdAt),
  ],
);

export const affiliateSignup = pgTable(
  "affiliate_signups",
  {
    id: text("id").primaryKey(),
    sourceId: text("source_id")
      .notNull()
      .references(() => affiliateSource.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(), // 'registration' | 'promo'
    bonusGranted: integer("bonus_granted").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [
    uniqueIndex("affiliate_signups_source_user_kind_unique").on(
      t.sourceId,
      t.userId,
      t.kind,
    ),
    index("affiliate_signups_source_id_idx").on(t.sourceId),
    index("affiliate_signups_user_id_idx").on(t.userId),
    index("affiliate_signups_created_at_idx").on(t.createdAt),
  ],
);

export type AffiliateGroup = typeof affiliateGroup.$inferSelect;
export type AffiliatePartner = typeof affiliatePartner.$inferSelect;
export type AffiliatePartnerSession = typeof affiliatePartnerSession.$inferSelect;
export type AffiliatePartnerAccount = typeof affiliatePartnerAccount.$inferSelect;
export type AffiliatePartnerVerification = typeof affiliatePartnerVerification.$inferSelect;
export type AffiliateDomain = typeof affiliateDomain.$inferSelect;
export type AffiliateRedirect = typeof affiliateRedirect.$inferSelect;
export type AffiliateRedirectUrl = typeof affiliateRedirectUrl.$inferSelect;
export type AffiliateSource = typeof affiliateSource.$inferSelect;
export type AffiliateClick = typeof affiliateClick.$inferSelect;
export type AffiliateSignup = typeof affiliateSignup.$inferSelect;
