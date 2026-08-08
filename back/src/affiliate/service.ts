import { and, count, desc, eq, gte, isNotNull, lte, inArray, like, ne, or, countDistinct } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { db } from "../db";
import {
  affiliateSource,
  affiliateGroup,
  affiliateDomain,
  affiliatePartner,
  affiliatePartnerAccount,
  affiliateRedirect,
  affiliateRedirectUrl,
  affiliateClick,
  affiliateSignup,
  type AffiliateSource,
  type AffiliateSource as SourceRow,
  type AffiliateGroup,
  type AffiliatePartner,
  type AffiliateDomain,
  type AffiliateRedirect,
  type AffiliateRedirectUrl,
} from "./schema";
import type { CasinoCore, AffiliateSourceType, AffiliateSignupKind } from "./interfaces";
import { casinoCore as defaultCore } from "./casinoCore";
import { partnerAuth } from "./partnerAuth";
import { affiliateCounters } from "../lib/affiliateCounters";
import { hashPassword as hashPartnerPassword } from "@better-auth/utils/password";

const PROMO_FALLBACK_BONUS = 500;
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const DEFAULT_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

export interface SourceInput {
  name?: string;
  type?: AffiliateSourceType;
  code?: string;
  registrationBonus?: number | null;
  groupId?: string | null;
  redirectId?: string | null;
  domain?: string | null;
  comment?: string | null;
  isActive?: boolean;
}

export interface SourceStatsAggregate {
  clicks: number;
  uniqueClicks: number;
  signups: number;
  promos: number;
  depositors: number;
  depositsCount: number;
  depositsSum: number;
  income: number;
  crPayment: number | null;
  cr: number | null;
}

export interface SourceWithMeta extends SourceRow {
  groupName: string | null;
  redirectName: string | null;
  commissionPercent: number;
}

export interface AuthPartner {
  id: string;
  name: string;
  email: string;
  isOwner: boolean;
  isActive: boolean;
  comment: string | null;
  createdAt: string;
}

export interface LeaderboardEntry extends AuthPartner {
  clicks: number;
  signups: number;
  promos: number;
  depositors: number;
  depositsSum: number;
  income: number;
  cr: number | null;
}

export interface ReferralItem {
  userId: string;
  name: string;
  email: string | null;
  kind: AffiliateSignupKind;
  createdAt: string;
  sourceId: string;
  sourceName: string;
  depositsCount: number;
  depositsSum: number;
  income: number;
}

function toAuthPartner(p: AffiliatePartner): AuthPartner {
  return {
    id: p.id,
    name: p.name,
    email: p.email,
    isOwner: p.isOwner,
    isActive: p.isActive,
    comment: p.comment,
    createdAt: p.createdAt.toISOString(),
  };
}

function randomToken(): string {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function normalizeEmail(raw: string): string {
  return String(raw || "").trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

interface Range {
  from?: Date;
  to?: Date;
}

function iso(d: Date): string {
  return d.toISOString();
}

function startOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(0, 0, 0, 0);
  return out;
}

function endOfDay(d: Date): Date {
  const out = new Date(d);
  out.setHours(23, 59, 59, 999);
  return out;
}

function daysAgo(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return startOfDay(d);
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function randomCode(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function normalizeCode(raw: string): string {
  return String(raw || "").trim().toUpperCase().replace(/\s+/g, "");
}

function isValidCode(code: string): boolean {
  return /^[A-Z0-9_]{3,32}$/.test(code);
}

function parseRange(fromRaw?: string, toRaw?: string): Range {
  const range: Range = {};
  if (fromRaw) {
    const d = new Date(fromRaw);
    if (!Number.isNaN(d.getTime())) range.from = startOfDay(d);
  }
  if (toRaw) {
    const d = new Date(toRaw);
    if (!Number.isNaN(d.getTime())) range.to = endOfDay(d);
  }
  return range;
}

function weightedPick(urls: AffiliateRedirectUrl[]): string | null {
  const active = urls.filter((u) => u.isActive && u.url && u.url.trim());
  if (active.length === 0) return null;
  const total = active.reduce((acc, u) => acc + Math.max(1, u.weight), 0);
  let r = Math.floor(Math.random() * total);
  for (const u of active) {
    r -= Math.max(1, u.weight);
    if (r < 0) return u.url.trim();
  }
  return active[0].url.trim();
}

class AffiliateService {
  constructor(private core: CasinoCore = defaultCore) {}

  // ---------------------------------------------------------------- sources

  private async ensureUniqueCode(preferred?: string): Promise<string> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = preferred && attempt === 0
        ? normalizeCode(preferred)
        : `AFF${randomCode(6)}`;
      if (preferred && attempt === 0 && !isValidCode(candidate)) {
        // fall through to random generation
      } else if (candidate) {
        const rows = await db
          .select({ id: affiliateSource.id })
          .from(affiliateSource)
          .where(eq(affiliateSource.code, candidate))
          .limit(1);
        if (rows.length === 0) return candidate;
      }
    }
    return `AFF${randomCode(8)}`;
  }

  async createSource(input: SourceInput, partnerId?: string): Promise<SourceWithMeta> {
    const type: AffiliateSourceType = input.type === "promo" ? "promo" : "link";
    const code = await this.ensureUniqueCode(input.code || "");
    const now = new Date();

    let bonus: number | null = null;
    if (input.registrationBonus !== undefined && input.registrationBonus !== null) {
      const v = Math.floor(Number(input.registrationBonus));
      if (!Number.isFinite(v) || v < 0) throw new Error("invalid_bonus");
      bonus = v;
    }

    const id = crypto.randomUUID();
    const domain = await this.resolveSourceDomain(input.domain, input.type);
    const rows = await db
      .insert(affiliateSource)
      .values({
        id,
        code,
        name: String(input.name || "").trim() || code,
        type,
        registrationBonus: bonus,
        groupId: input.groupId || null,
        partnerId: partnerId || (await this.ownerId()),
        redirectId: input.redirectId || null,
        domain,
        comment: input.comment || null,
        isActive: input.isActive !== false,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return this.attachMeta(rows[0]);
  }

  async updateSource(id: string, input: SourceInput, partnerId?: string): Promise<SourceWithMeta> {
    const existing = await this.getSourceRow(id, partnerId);
    if (!existing) throw new Error("source_not_found");

    const patch: Partial<SourceRow> = { updatedAt: new Date() };

    if (input.name !== undefined) patch.name = String(input.name).trim() || existing.code;
    if (input.type === "link" || input.type === "promo") patch.type = input.type;
    if (input.groupId !== undefined) patch.groupId = input.groupId || null;
    if (input.redirectId !== undefined) patch.redirectId = input.redirectId || null;
    if (input.domain !== undefined) patch.domain = await this.resolveSourceDomain(input.domain, input.type);
    if (input.comment !== undefined) patch.comment = input.comment || null;
    if (input.isActive !== undefined) patch.isActive = input.isActive;

    if (input.registrationBonus !== undefined) {
      if (input.registrationBonus === null) {
        patch.registrationBonus = null;
      } else {
        const v = Math.floor(Number(input.registrationBonus));
        if (!Number.isFinite(v) || v < 0) throw new Error("invalid_bonus");
        patch.registrationBonus = v;
      }
    }

    if (input.code !== undefined && input.code !== existing.code) {
      const code = normalizeCode(input.code);
      if (!isValidCode(code)) throw new Error("invalid_code");
      const clash = await db
        .select({ id: affiliateSource.id })
        .from(affiliateSource)
        .where(and(eq(affiliateSource.code, code), ne(affiliateSource.id, id)))
        .limit(1);
      if (clash.length > 0) throw new Error("code_taken");
      patch.code = code;
    }

    const rows = await db
      .update(affiliateSource)
      .set(patch)
      .where(eq(affiliateSource.id, id))
      .returning();
    return this.attachMeta(rows[0]);
  }

  async deleteSource(id: string, partnerId?: string): Promise<void> {
    const where = partnerId
      ? and(eq(affiliateSource.id, id), eq(affiliateSource.partnerId, partnerId))
      : eq(affiliateSource.id, id);
    await db.delete(affiliateSource).where(where);
  }

  private async getSourceRow(id: string, partnerId?: string): Promise<SourceRow | undefined> {
    const where = partnerId
      ? and(eq(affiliateSource.id, id), eq(affiliateSource.partnerId, partnerId))
      : eq(affiliateSource.id, id);
    const rows = await db.select().from(affiliateSource).where(where).limit(1);
    return rows[0];
  }

  private async attachMeta(row: SourceRow): Promise<SourceWithMeta> {
    const [group, redirect] = await Promise.all([
      row.groupId
        ? db.select({ name: affiliateGroup.name, commissionPercent: affiliateGroup.commissionPercent }).from(affiliateGroup).where(eq(affiliateGroup.id, row.groupId)).limit(1)
        : Promise.resolve([]),
      row.redirectId
        ? db.select({ name: affiliateRedirect.name }).from(affiliateRedirect).where(eq(affiliateRedirect.id, row.redirectId)).limit(1)
        : Promise.resolve([]),
    ]);
    return {
      ...row,
      groupName: group[0]?.name ?? null,
      redirectName: redirect[0]?.name ?? null,
      commissionPercent: group[0]?.commissionPercent ?? 0,
    };
  }

  async listSources(
    opts: {
      limit?: number;
      offset?: number;
      search?: string;
      groupId?: string;
      type?: AffiliateSourceType;
      from?: string;
      to?: string;
    } = {},
    partnerId?: string,
  ): Promise<{ total: number; items: Array<SourceWithMeta & SourceStatsAggregate> }> {
    const limit = Math.min(Math.max(1, Math.floor(Number(opts.limit) || 50)), 200);
    const offset = Math.max(0, Math.floor(Number(opts.offset) || 0));

    const where = [];
    if (partnerId) where.push(eq(affiliateSource.partnerId, partnerId));
    if (opts.search) {
      const q = `%${opts.search.trim()}%`;
      where.push(or(like(affiliateSource.name, q), like(affiliateSource.code, q)));
    }
    if (opts.groupId) where.push(eq(affiliateSource.groupId, opts.groupId));
    if (opts.type === "link" || opts.type === "promo") where.push(eq(affiliateSource.type, opts.type));

    const base = where.length > 0 ? and(...where) : undefined;

    const [totalRow, rows] = await Promise.all([
      db.select({ value: count() }).from(affiliateSource).where(base),
      db.select().from(affiliateSource).where(base).orderBy(desc(affiliateSource.createdAt)).limit(limit).offset(offset),
    ]);

    const items = await Promise.all(rows.map((r) => this.attachMeta(r)));
    const agg = await this.aggregateForSources(items, parseRange(opts.from, opts.to));
    return {
      total: Number(totalRow[0]?.value ?? 0),
      items: items.map((s) => ({ ...s, ...(agg.get(s.id) ?? emptyAggregate()) })),
    };
  }

  // ------------------------------------------------------------- partners

  private async hasCredential(userId: string): Promise<boolean> {
    const rows = await db
      .select({ id: affiliatePartnerAccount.id })
      .from(affiliatePartnerAccount)
      .where(and(eq(affiliatePartnerAccount.userId, userId), eq(affiliatePartnerAccount.providerId, "credential")))
      .limit(1);
    return rows.length > 0;
  }

  private async ownerId(): Promise<string> {
    const rows = await db
      .select()
      .from(affiliatePartner)
      .where(eq(affiliatePartner.isOwner, true))
      .orderBy(affiliatePartner.createdAt)
      .limit(1);
    const existing = rows[0];
    if (existing) {
      if (!(await this.hasCredential(existing.id))) {
        // Legacy scrypt-created owner: recreate with a better-auth credential.
        await db.delete(affiliatePartner).where(eq(affiliatePartner.id, existing.id));
      } else {
        return existing.id;
      }
    }
    const owner = await this.createPartner({
      name: "Владелец",
      email: process.env.AFFILIATE_EMAIL || "admin@partner.local",
      password: process.env.AFFILIATE_PASSWORD || "admin",
      isOwner: true,
      comment: "Системный аккаунт владельца",
    });
    return owner.partner.id;
  }

  async ensureOwnerSeed(): Promise<void> {
    try {
      await this.ownerId();
    } catch (err) {
      console.error("[affiliate] owner seed failed:", (err as Error).message);
    }
  }

  async login(
    emailRaw: string,
    password: string,
  ): Promise<{ token: string; partner: AuthPartner } | null> {
    const email = normalizeEmail(emailRaw);
    if (!email || !password) return null;
    let user: { id: string } | undefined;
    try {
      const res = await partnerAuth.api.signInEmail({ body: { email, password } });
      user = res.user;
    } catch {
      return null;
    }
    if (!user) return null;
    const rows = await db.select().from(affiliatePartner).where(eq(affiliatePartner.id, user.id)).limit(1);
    const p = rows[0];
    if (!p) return null;
    if (!p.isActive) throw new Error("account_pending");
    const token = randomToken();
    await db.update(affiliatePartner).set({ authToken: token, updatedAt: new Date() }).where(eq(affiliatePartner.id, p.id));
    return { token, partner: toAuthPartner(p) };
  }

  async register(input: {
    name?: string;
    email?: string;
    password?: string;
  }): Promise<{ partner: AuthPartner }> {
    const name = String(input.name || "").trim();
    if (!name) throw new Error("invalid_name");
    const email = normalizeEmail(input.email || "");
    if (!isValidEmail(email)) throw new Error("invalid_email");
    const password = String(input.password || "");
    if (password.length < 6) throw new Error("invalid_password");
    const clash = await db
      .select({ id: affiliatePartner.id })
      .from(affiliatePartner)
      .where(eq(affiliatePartner.email, email))
      .limit(1);
    if (clash.length > 0) throw new Error("email_taken");
    const res = await partnerAuth.api.signUpEmail({ body: { name, email, password } });
    const id = res.user?.id;
    if (!id) throw new Error("register_failed");
    await db
      .update(affiliatePartner)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(affiliatePartner.id, id));
    const rows = await db.select().from(affiliatePartner).where(eq(affiliatePartner.id, id)).limit(1);
    return { partner: toAuthPartner(rows[0]) };
  }

  async resolvePartner(token: string): Promise<AuthPartner | undefined> {
    if (!token) return undefined;
    const rows = await db
      .select()
      .from(affiliatePartner)
      .where(and(eq(affiliatePartner.authToken, token), eq(affiliatePartner.isActive, true)))
      .limit(1);
    return rows[0] ? toAuthPartner(rows[0]) : undefined;
  }

  async listPartners(): Promise<AuthPartner[]> {
    const rows = await db.select().from(affiliatePartner).orderBy(desc(affiliatePartner.createdAt));
    return rows.map(toAuthPartner);
  }

  async createPartner(input: {
    name?: string;
    email?: string;
    password?: string;
    isOwner?: boolean;
    isActive?: boolean;
    comment?: string;
  }): Promise<{ partner: AuthPartner; email: string; password: string }> {
    const name = String(input.name || "").trim();
    if (!name) throw new Error("invalid_name");
    const email = normalizeEmail(input.email || "");
    if (!isValidEmail(email)) throw new Error("invalid_email");
    const password = String(input.password || "");
    if (password.length < 6) throw new Error("invalid_password");
    const clash = await db
      .select({ id: affiliatePartner.id })
      .from(affiliatePartner)
      .where(eq(affiliatePartner.email, email))
      .limit(1);
    if (clash.length > 0) throw new Error("email_taken");
    const res = await partnerAuth.api.signUpEmail({ body: { name, email, password } });
    const id = res.user?.id;
    if (!id) throw new Error("register_failed");
    await db
      .update(affiliatePartner)
      .set({
        isOwner: input.isOwner === true,
        isActive: input.isActive !== false,
        comment: input.comment || null,
        updatedAt: new Date(),
      })
      .where(eq(affiliatePartner.id, id));
    const rows = await db.select().from(affiliatePartner).where(eq(affiliatePartner.id, id)).limit(1);
    return { partner: toAuthPartner(rows[0]), email, password };
  }

  async updatePartner(
    id: string,
    input: {
      name?: string;
      email?: string;
      password?: string;
      isActive?: boolean;
      comment?: string;
    },
  ): Promise<AuthPartner> {
    const patch: Partial<AffiliatePartner> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) throw new Error("invalid_name");
      patch.name = name;
    }
    if (input.email !== undefined) {
      const email = normalizeEmail(input.email);
      if (!isValidEmail(email)) throw new Error("invalid_email");
      const clash = await db
        .select({ id: affiliatePartner.id })
        .from(affiliatePartner)
        .where(and(eq(affiliatePartner.email, email), ne(affiliatePartner.id, id)))
        .limit(1);
      if (clash.length > 0) throw new Error("email_taken");
      patch.email = email;
    }
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.comment !== undefined) patch.comment = input.comment || null;

    if (input.password !== undefined && input.password !== "") {
      const password = String(input.password);
      if (password.length < 6) throw new Error("invalid_password");
      const accountRows = await db
        .update(affiliatePartnerAccount)
        .set({ password: await hashPartnerPassword(password), updatedAt: new Date() })
        .where(and(eq(affiliatePartnerAccount.userId, id), eq(affiliatePartnerAccount.providerId, "credential")))
        .returning({ id: affiliatePartnerAccount.id });
      if (accountRows.length === 0) throw new Error("partner_not_found");
    }

    const rows = await db.update(affiliatePartner).set(patch).where(eq(affiliatePartner.id, id)).returning();
    if (rows.length === 0) throw new Error("partner_not_found");
    return toAuthPartner(rows[0]);
  }

  async deletePartner(id: string, actorId: string): Promise<void> {
    if (id === actorId) throw new Error("cannot_delete_self");
    const rows = await db.select().from(affiliatePartner).where(eq(affiliatePartner.id, id)).limit(1);
    if (rows.length === 0) throw new Error("partner_not_found");
    if (rows[0].isOwner) throw new Error("cannot_delete_owner");
    await db.delete(affiliatePartner).where(eq(affiliatePartner.id, id));
  }

  // ---------------------------------------------------------------- groups

  async listGroups(): Promise<AffiliateGroup[]> {
    return db.select().from(affiliateGroup).orderBy(desc(affiliateGroup.createdAt));
  }

  async createGroup(input: { name?: string; comment?: string; commissionPercent?: number }): Promise<AffiliateGroup> {
    const name = String(input.name || "").trim();
    if (!name) throw new Error("invalid_name");
    const commission = Math.max(0, Number(input.commissionPercent) || 0);
    const now = new Date();
    const rows = await db
      .insert(affiliateGroup)
      .values({
        id: crypto.randomUUID(),
        name,
        comment: input.comment || null,
        commissionPercent: commission,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return rows[0];
  }

  async updateGroup(id: string, input: { name?: string; comment?: string; commissionPercent?: number }): Promise<AffiliateGroup> {
    const rows = await db
      .update(affiliateGroup)
      .set({
        name: input.name !== undefined ? String(input.name).trim() || undefined : undefined,
        comment: input.comment !== undefined ? (input.comment || null) : undefined,
        commissionPercent: input.commissionPercent !== undefined ? Math.max(0, Number(input.commissionPercent) || 0) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(affiliateGroup.id, id))
      .returning();
    if (rows.length === 0) throw new Error("group_not_found");
    return rows[0];
  }

  async deleteGroup(id: string): Promise<void> {
    await db.delete(affiliateGroup).where(eq(affiliateGroup.id, id));
  }

  // ------------------------------------------------------------- redirects

  async listRedirects(): Promise<Array<AffiliateRedirect & { urls: AffiliateRedirectUrl[] }>> {
    const rows = await db.select().from(affiliateRedirect).orderBy(desc(affiliateRedirect.createdAt));
    if (rows.length === 0) return [];
    const urlRows = await db
      .select()
      .from(affiliateRedirectUrl)
      .where(inArray(affiliateRedirectUrl.redirectId, rows.map((r) => r.id)))
      .orderBy(affiliateRedirectUrl.sortOrder);
    const byRedirect = new Map<string, AffiliateRedirectUrl[]>();
    for (const u of urlRows) {
      const arr = byRedirect.get(u.redirectId) ?? [];
      arr.push(u);
      byRedirect.set(u.redirectId, arr);
    }
    return rows.map((r) => ({ ...r, urls: byRedirect.get(r.id) ?? [] }));
  }

  async createRedirect(input: { name?: string; comment?: string; urls?: string[] }): Promise<AffiliateRedirect> {
    const name = String(input.name || "").trim();
    if (!name) throw new Error("invalid_name");
    const now = new Date();
    const id = crypto.randomUUID();
    await db.insert(affiliateRedirect).values({
      id,
      name,
      comment: input.comment || null,
      createdAt: now,
      updatedAt: now,
    });
    if (Array.isArray(input.urls)) {
      for (const [i, raw] of input.urls.entries()) {
        const url = String(raw || "").trim();
        if (!url) continue;
        await db.insert(affiliateRedirectUrl).values({
          id: crypto.randomUUID(),
          redirectId: id,
          url,
          weight: 1,
          isActive: true,
          sortOrder: i,
          createdAt: now,
        });
      }
    }
    return { id, name, comment: input.comment || null, createdAt: now, updatedAt: now };
  }

  async updateRedirect(id: string, input: { name?: string; comment?: string }): Promise<AffiliateRedirect> {
    const rows = await db
      .update(affiliateRedirect)
      .set({
        name: input.name !== undefined ? String(input.name).trim() || undefined : undefined,
        comment: input.comment !== undefined ? (input.comment || null) : undefined,
        updatedAt: new Date(),
      })
      .where(eq(affiliateRedirect.id, id))
      .returning();
    if (rows.length === 0) throw new Error("redirect_not_found");
    return rows[0];
  }

  async deleteRedirect(id: string): Promise<void> {
    await db.delete(affiliateRedirect).where(eq(affiliateRedirect.id, id));
  }

  async addRedirectUrl(redirectId: string, input: { url?: string; weight?: number }): Promise<AffiliateRedirectUrl> {
    const url = String(input.url || "").trim();
    if (!url) throw new Error("invalid_url");
    const rows = await db
      .insert(affiliateRedirectUrl)
      .values({
        id: crypto.randomUUID(),
        redirectId,
        url,
        weight: Math.max(1, Math.floor(Number(input.weight) || 1)),
        isActive: true,
        sortOrder: await this.nextSortOrder(redirectId),
        createdAt: new Date(),
      })
      .returning();
    return rows[0];
  }

  async updateRedirectUrl(redirectId: string, urlId: string, input: { url?: string; weight?: number; isActive?: boolean }): Promise<AffiliateRedirectUrl> {
    const rows = await db
      .update(affiliateRedirectUrl)
      .set({
        url: input.url !== undefined ? String(input.url).trim() || undefined : undefined,
        weight: input.weight !== undefined ? Math.max(1, Math.floor(Number(input.weight) || 1)) : undefined,
        isActive: input.isActive !== undefined ? input.isActive : undefined,
      })
      .where(and(eq(affiliateRedirectUrl.id, urlId), eq(affiliateRedirectUrl.redirectId, redirectId)))
      .returning();
    if (rows.length === 0) throw new Error("url_not_found");
    return rows[0];
  }

  async deleteRedirectUrl(redirectId: string, urlId: string): Promise<void> {
    await db
      .delete(affiliateRedirectUrl)
      .where(and(eq(affiliateRedirectUrl.id, urlId), eq(affiliateRedirectUrl.redirectId, redirectId)));
  }

  private async nextSortOrder(redirectId: string): Promise<number> {
    const rows = await db
      .select({ value: count() })
      .from(affiliateRedirectUrl)
      .where(eq(affiliateRedirectUrl.redirectId, redirectId));
    return Number(rows[0]?.value ?? 0);
  }

  // --------------------------------------------------------------- domains

  private normalizeDomainUrl(raw: string): string {
    let url = String(raw || "").trim();
    if (!url) return "";
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    try {
      const parsed = new URL(url);
      parsed.pathname = "/";
      parsed.search = "";
      parsed.hash = "";
      return parsed.origin.toLowerCase();
    } catch {
      return "";
    }
  }

  private async ensureDefaultDomain(): Promise<void> {
    const rows = await db.select({ id: affiliateDomain.id }).from(affiliateDomain).limit(1);
    if (rows.length === 0 && DEFAULT_ORIGIN) {
      const now = new Date();
      await db
        .insert(affiliateDomain)
        .values({
          id: crypto.randomUUID(),
          url: this.normalizeDomainUrl(DEFAULT_ORIGIN),
          isActive: true,
          comment: "Основной домен приложения",
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing();
    }
  }

  async allowedDomains(): Promise<string[]> {
    await this.ensureDefaultDomain();
    const rows = await db
      .select({ url: affiliateDomain.url })
      .from(affiliateDomain)
      .where(eq(affiliateDomain.isActive, true))
      .orderBy(desc(affiliateDomain.createdAt));
    return rows.map((r) => r.url);
  }

  private async resolveSourceDomain(
    raw: string | null | undefined,
    type?: AffiliateSourceType,
  ): Promise<string | null> {
    if (type === "promo") return null;
    if (!raw) return null;
    const normalized = this.normalizeDomainUrl(raw);
    if (!normalized) throw new Error("invalid_domain");
    const allowed = await this.allowedDomains();
    if (!allowed.includes(normalized)) throw new Error("domain_not_allowed");
    return normalized;
  }

  async listDomains(): Promise<AffiliateDomain[]> {
    await this.ensureDefaultDomain();
    return db.select().from(affiliateDomain).orderBy(desc(affiliateDomain.createdAt));
  }

  async createDomain(input: { url?: string; isActive?: boolean; comment?: string }): Promise<AffiliateDomain> {
    const normalized = this.normalizeDomainUrl(input.url || "");
    if (!normalized) throw new Error("invalid_domain");
    const now = new Date();
    const rows = await db
      .insert(affiliateDomain)
      .values({
        id: crypto.randomUUID(),
        url: normalized,
        isActive: input.isActive !== false,
        comment: input.comment || null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return rows[0];
  }

  async updateDomain(id: string, input: { url?: string; isActive?: boolean; comment?: string }): Promise<AffiliateDomain> {
    const patch: Partial<AffiliateDomain> = { updatedAt: new Date() };
    if (input.url !== undefined) {
      const normalized = this.normalizeDomainUrl(input.url);
      if (!normalized) throw new Error("invalid_domain");
      patch.url = normalized;
    }
    if (input.isActive !== undefined) patch.isActive = input.isActive;
    if (input.comment !== undefined) patch.comment = input.comment || null;
    const rows = await db.update(affiliateDomain).set(patch).where(eq(affiliateDomain.id, id)).returning();
    if (rows.length === 0) throw new Error("domain_not_found");
    return rows[0];
  }

  async deleteDomain(id: string): Promise<void> {
    await db.delete(affiliateDomain).where(eq(affiliateDomain.id, id));
  }

  // ------------------------------------------------- public: redirect links

  async resolveLink(codeRaw: string, meta: { ip?: string; userAgent?: string; referrer?: string }): Promise<{ url: string; code: string } | null> {
    const code = normalizeCode(codeRaw);
    if (!code) return null;
    const rows = await db
      .select()
      .from(affiliateSource)
      .where(and(eq(affiliateSource.code, code), eq(affiliateSource.type, "link"), eq(affiliateSource.isActive, true)))
      .limit(1);
    const src = rows[0];
    if (!src) return null;

    await affiliateCounters.recordClick(src.id, meta);

    let url = DEFAULT_ORIGIN;
    if (src.redirectId) {
      const urlRows = await db
        .select()
        .from(affiliateRedirectUrl)
        .where(eq(affiliateRedirectUrl.redirectId, src.redirectId));
      url = weightedPick(urlRows) ?? DEFAULT_ORIGIN;
    }
    return { url, code };
  }

  // ------------------------------------------- public: registration / promo

  async resolveRegistrationSource(ref: string): Promise<{ sourceId: string; bonus: number | null } | null> {
    const code = normalizeCode(ref);
    if (!code) return null;
    const rows = await db
      .select()
      .from(affiliateSource)
      .where(and(eq(affiliateSource.code, code), eq(affiliateSource.type, "link"), eq(affiliateSource.isActive, true)))
      .limit(1);
    const src = rows[0];
    if (!src) return null;
    return { sourceId: src.id, bonus: src.registrationBonus };
  }

  async recordSignup(input: { sourceId: string; userId: string; kind: AffiliateSignupKind; bonusGranted: number }): Promise<void> {
    await affiliateCounters.recordSignup(input.sourceId, input.userId, input.kind);
    await db
      .insert(affiliateSignup)
      .values({
        id: crypto.randomUUID(),
        sourceId: input.sourceId,
        userId: input.userId,
        kind: input.kind,
        bonusGranted: Math.floor(Number(input.bonusGranted) || 0),
        createdAt: new Date(),
      })
      .onConflictDoNothing();
  }

  async attributeUser(userId: string, ref: string): Promise<boolean> {
    const resolved = await this.resolveRegistrationSource(ref);
    if (!resolved) return false;
    await this.recordSignup({ sourceId: resolved.sourceId, userId, kind: "registration", bonusGranted: 0 });
    return true;
  }

  async resolvePromoCode(codeRaw: string): Promise<{ sourceId: string; amount: number } | null> {
    const code = normalizeCode(codeRaw);
    if (!code) return null;
    const rows = await db
      .select()
      .from(affiliateSource)
      .where(and(eq(affiliateSource.code, code), eq(affiliateSource.type, "promo"), eq(affiliateSource.isActive, true)))
      .limit(1);
    const src = rows[0];
    if (!src) return null;
    return { sourceId: src.id, amount: src.registrationBonus ?? PROMO_FALLBACK_BONUS };
  }

  async activatePromo(userId: string, sourceId: string, code: string, amount: number): Promise<number> {
    const balance = await this.core.creditBonus(userId, amount, "Промокод", code);
    await this.core.recordPromoActivation(userId, code, amount);
    await this.core.recordPromoEvent(userId);
    await this.recordSignup({ sourceId, userId, kind: "promo", bonusGranted: amount });
    return balance;
  }

  // --------------------------------------------------------------- stats

  async getStats(opts: { from?: string; to?: string } = {}, partnerId?: string): Promise<{
    summary: Record<"today" | "week" | "month" | "all", SourceStatsAggregate>;
    daily: Array<{ date: string; clicks: number; signups: number; promos: number; depositsSum: number; income: number }>;
    topSources: Array<SourceWithMeta & SourceStatsAggregate>;
    history: Array<{
      id: string;
      kind: "click" | "registration" | "promo" | "deposit";
      sourceId: string;
      sourceName: string;
      amount: number | null;
      createdAt: string;
    }>;
  }> {
    const sources = await this.allSourcesWithMeta(partnerId);

    const summaryRanges: Array<["today" | "week" | "month" | "all", Range]> = [
      ["today", { from: startOfDay(new Date()) }],
      ["week", { from: daysAgo(6) }],
      ["month", { from: daysAgo(29) }],
      ["all", {}],
    ];

    const summary = {} as Record<"today" | "week" | "month" | "all", SourceStatsAggregate>;
    for (const [key, range] of summaryRanges) {
      const agg = await this.aggregateForSources(sources, range);
      summary[key] = totalAggregate(agg);
    }

    const range = parseRange(opts.from, opts.to);
    const from = range.from ?? daysAgo(29);
    const to = range.to;

    const [daily, topSources, history] = await Promise.all([
      this.buildDailySeries(sources, { from, to }),
      this.topSources(sources, { from, to }),
      this.buildHistory(sources, { from, to }),
    ]);

    return { summary, daily, topSources, history };
  }

  async getSourceStats(id: string, opts: { from?: string; to?: string } = {}, partnerId?: string): Promise<Array<SourceWithMeta & SourceStatsAggregate>> {
    const src = await this.getSourceRow(id, partnerId);
    if (!src) throw new Error("source_not_found");
    const meta = await this.attachMeta(src);
    const agg = await this.aggregateForSources([meta], parseRange(opts.from, opts.to));
    return [{ ...meta, ...(agg.get(meta.id) ?? emptyAggregate()) }];
  }

  private async allSourcesWithMeta(partnerId?: string): Promise<SourceWithMeta[]> {
    const where = partnerId ? eq(affiliateSource.partnerId, partnerId) : undefined;
    const rows = await db
      .select()
      .from(affiliateSource)
      .where(where)
      .orderBy(desc(affiliateSource.createdAt));
    return Promise.all(rows.map((r) => this.attachMeta(r)));
  }

  // ----------------------------------------------------------- leaderboard

  async getLeaderboard(
    opts: { period?: string; metric?: string } = {},
  ): Promise<{ period: string; metric: string; items: LeaderboardEntry[] }> {
    const period = opts.period === "week" || opts.period === "month" ? opts.period : "all";
    const metric =
      opts.metric === "clicks" || opts.metric === "signups" || opts.metric === "deposits" || opts.metric === "income"
        ? opts.metric
        : "income";
    const range: Range =
      period === "week" ? { from: daysAgo(6) } : period === "month" ? { from: daysAgo(29) } : {};

    const partners = await db
      .select()
      .from(affiliatePartner)
      .where(eq(affiliatePartner.isActive, true))
      .orderBy(desc(affiliatePartner.createdAt));

    const items: LeaderboardEntry[] = [];
    for (const p of partners) {
      const sources = await this.allSourcesWithMeta(p.id);
      const agg = await this.aggregateForSources(sources, range);
      const total = totalAggregate(agg);
      items.push({ ...toAuthPartner(p), ...total });
    }

    items.sort((a, b) => {
      const key = metric === "deposits" ? "depositsSum" : metric;
      const va = a as unknown as Record<string, number>;
      const vb = b as unknown as Record<string, number>;
      const primary = vb[key] - va[key];
      if (primary !== 0) return primary;
      const depositDiff = vb.depositsSum - va.depositsSum;
      if (depositDiff !== 0) return depositDiff;
      const clickDiff = vb.clicks - va.clicks;
      if (clickDiff !== 0) return clickDiff;
      const signupDiff = vb.signups - va.signups;
      if (signupDiff !== 0) return signupDiff;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });

    return { period, metric, items };
  }

  // ------------------------------------------------------------- referrals

  async getReferrals(
    partnerId: string,
    opts: { from?: string; to?: string } = {},
  ): Promise<{ total: number; sum: number; items: ReferralItem[] }> {
    const sources = await this.allSourcesWithMeta(partnerId);
    const ids = sources.map((s) => s.id);
    if (ids.length === 0) return { total: 0, sum: 0, items: [] };

    const range = parseRange(opts.from, opts.to);
    const signupRows = await db
      .select()
      .from(affiliateSignup)
      .where(and(inArray(affiliateSignup.sourceId, ids), rangeWhere(affiliateSignup.createdAt, range)))
      .orderBy(affiliateSignup.createdAt);

    const sourceMeta = new Map<string, SourceWithMeta>();
    for (const s of sources) sourceMeta.set(s.id, s);

    const byUser = new Map<string, ReferralItem>();
    for (const s of signupRows) {
      const meta = sourceMeta.get(s.sourceId);
      if (!meta) continue;
      const existing = byUser.get(s.userId);
      if (existing) continue;
      const kind: AffiliateSignupKind = s.kind === "promo" ? "promo" : "registration";
      byUser.set(s.userId, {
        userId: s.userId,
        name: "",
        email: null,
        kind,
        createdAt: s.createdAt.toISOString(),
        sourceId: s.sourceId,
        sourceName: meta.name,
        depositsCount: 0,
        depositsSum: 0,
        income: 0,
      });
    }

    const userIds = [...byUser.keys()];
    if (userIds.length === 0) return { total: 0, sum: 0, items: [] };

    const [names, depositAgg] = await Promise.all([
      this.core.getUserNames(userIds),
      this.core.getDepositAggregates(userIds, range.from, range.to),
    ]);
    const depositByUser = new Map<string, { count: number; sum: number }>();
    for (const d of depositAgg) depositByUser.set(d.userId, { count: d.count, sum: d.sum });

    const items: ReferralItem[] = [];
    let sum = 0;
    for (const r of byUser.values()) {
      const meta = sourceMeta.get(r.sourceId)!;
      const d = depositByUser.get(r.userId);
      const depositsCount = d?.count ?? 0;
      const depositsSum = d?.sum ?? 0;
      const income = Math.floor((depositsSum * this.effectiveCommission(meta)) / 100);
      const user = names.get(r.userId);
      items.push({
        ...r,
        name: user?.name ?? "—",
        email: user?.email ?? null,
        depositsCount,
        depositsSum,
        income,
      });
      sum += income;
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return { total: items.length, sum, items };
  }

  private effectiveCommission(source: SourceWithMeta): number {
    return Math.max(0, Number(source.commissionPercent) || 0);
  }

  private async aggregateForSources(sources: SourceWithMeta[], range: Range): Promise<Map<string, SourceStatsAggregate>> {
    const map = new Map<string, SourceStatsAggregate>();
    for (const s of sources) map.set(s.id, emptyAggregate());
    if (sources.length === 0) return map;

    // Fast path: serve all-time aggregates from Redis counters when warm.
    const fromRedis = await affiliateCounters.getStats(sources.map((s) => s.id), range);
    if (fromRedis) {
      for (const s of sources) {
        const c = fromRedis.get(s.id);
        if (!c) continue;
        const agg = map.get(s.id)!;
        agg.clicks = c.clicks;
        agg.uniqueClicks = c.uniqueClicks;
        agg.signups = c.signups;
        agg.promos = c.promos;
        agg.depositors = c.depositors;
        agg.depositsCount = c.depositsCount;
        agg.depositsSum = c.depositsSum;
        agg.income = Math.floor((c.depositsSum * this.effectiveCommission(s)) / 100);
        agg.crPayment = agg.signups > 0 ? Math.round((agg.depositors / agg.signups) * 1000) / 10 : null;
      }
      return map;
    }

    const ids = sources.map((s) => s.id);

    const [clickRows, signupRows] = await Promise.all([
      db
        .select({
          sourceId: affiliateClick.sourceId,
          count: count(),
          unique: countDistinct(affiliateClick.ip),
        })
        .from(affiliateClick)
        .where(and(inArray(affiliateClick.sourceId, ids), rangeWhere(affiliateClick.createdAt, range)))
        .groupBy(affiliateClick.sourceId),
      db
        .select()
        .from(affiliateSignup)
        .where(and(inArray(affiliateSignup.sourceId, ids), rangeWhere(affiliateSignup.createdAt, range))),
    ]);

    for (const c of clickRows) {
      const agg = map.get(c.sourceId);
      if (agg) {
        agg.clicks = Number(c.count) || 0;
        agg.uniqueClicks = Number(c.unique) || 0;
      }
    }

    const signupUsersBySource = new Map<string, Set<string>>();
    const signupUsersByKindAndSource = new Map<string, Record<AffiliateSignupKind, Set<string>>>();
    for (const s of signupRows) {
      const agg = map.get(s.sourceId);
      if (!agg) continue;
      if (s.kind === "promo") agg.promos++;
      else agg.signups++;
      const set = signupUsersBySource.get(s.sourceId) ?? new Set<string>();
      set.add(s.userId);
      signupUsersBySource.set(s.sourceId, set);
      const kindMap = signupUsersByKindAndSource.get(s.sourceId) ?? {
        registration: new Set<string>(),
        promo: new Set<string>(),
      };
      kindMap[s.kind as AffiliateSignupKind].add(s.userId);
      signupUsersByKindAndSource.set(s.sourceId, kindMap);
    }

    for (const s of sources) {
      const agg = map.get(s.id)!;
      agg.cr = agg.clicks > 0 && agg.signups > 0 ? Math.round((agg.signups / agg.clicks) * 1000) / 10 : null;
    }

    const allUserIds = new Set<string>();
    for (const set of signupUsersBySource.values()) for (const uid of set) allUserIds.add(uid);

    const depositAgg = await this.core.getDepositAggregates([...allUserIds], range.from, range.to);
    const depositByUser = new Map<string, { count: number; sum: number }>();
    for (const d of depositAgg) depositByUser.set(d.userId, { count: d.count, sum: d.sum });

    const depositorIdsBySource = new Map<string, Set<string>>();
    for (const s of sources) {
      const agg = map.get(s.id)!;
      const users = signupUsersBySource.get(s.id);
      if (!users) continue;
      let depositsCount = 0;
      let depositsSum = 0;
      const depositors = new Set<string>();
      for (const uid of users) {
        const d = depositByUser.get(uid);
        if (d && d.count > 0) {
          depositsCount += d.count;
          depositsSum += d.sum;
          depositors.add(uid);
        }
      }
      agg.depositsCount = depositsCount;
      agg.depositsSum = depositsSum;
      agg.depositors = depositors.size;
      agg.income = Math.floor((depositsSum * this.effectiveCommission(s)) / 100);
      agg.crPayment = agg.signups > 0 ? Math.round((depositors.size / agg.signups) * 1000) / 10 : null;
      if (depositors.size > 0) depositorIdsBySource.set(s.id, depositors);
    }

    // Warm Redis counters with all-time totals so subsequent reads are served
    // from Redis instead of running the aggregation queries again.
    if (!range.from && !range.to) {
      const ipRows = await db
        .selectDistinct({
          sourceId: affiliateClick.sourceId,
          ip: affiliateClick.ip,
        })
        .from(affiliateClick)
        .where(and(inArray(affiliateClick.sourceId, ids), isNotNull(affiliateClick.ip), ne(affiliateClick.ip, "")));
      const uniqIpsBySource = new Map<string, string[]>();
      for (const r of ipRows) {
        if (!r.ip) continue;
        const arr = uniqIpsBySource.get(r.sourceId) ?? [];
        arr.push(r.ip);
        uniqIpsBySource.set(r.sourceId, arr);
      }

      for (const s of sources) {
        const agg = map.get(s.id)!;
        const kindMap = signupUsersByKindAndSource.get(s.id);
        void affiliateCounters.seedSource(
          s.id,
          {
            clicks: agg.clicks,
            uniqueClicks: agg.uniqueClicks,
            signups: agg.signups,
            promos: agg.promos,
            depositors: agg.depositors,
            depositsCount: agg.depositsCount,
            depositsSum: agg.depositsSum,
          },
          {
            uniqIps: uniqIpsBySource.get(s.id),
            depositorUserIds: [...(depositorIdsBySource.get(s.id) ?? [])],
            signupUserIds: kindMap
              ? { registration: [...kindMap.registration], promo: [...kindMap.promo] }
              : undefined,
          },
        );
      }
    }

    return map;
  }

  private async topSources(sources: SourceWithMeta[], range: Range): Promise<Array<SourceWithMeta & SourceStatsAggregate>> {
    const agg = await this.aggregateForSources(sources, range);
    return sources
      .map((s) => ({ ...s, ...(agg.get(s.id) ?? emptyAggregate()) }))
      .sort((a, b) => b.income - a.income)
      .slice(0, 10);
  }

  private async buildDailySeries(sources: SourceWithMeta[], range: Range): Promise<
    Array<{ date: string; clicks: number; signups: number; promos: number; depositsSum: number; income: number }>
  > {
    const from = range.from ?? daysAgo(29);
    const to = range.to;

    const ids = sources.map((s) => s.id);

    const [clickRows, signupRows, userAttribution] = await Promise.all([
      db
        .select({
          date: affiliateClick.createdAt,
          sourceId: affiliateClick.sourceId,
        })
        .from(affiliateClick)
        .where(and(inArray(affiliateClick.sourceId, ids), rangeWhere(affiliateClick.createdAt, range))),
      db
        .select({
          date: affiliateSignup.createdAt,
          sourceId: affiliateSignup.sourceId,
          kind: affiliateSignup.kind,
          userId: affiliateSignup.userId,
        })
        .from(affiliateSignup)
        .where(and(inArray(affiliateSignup.sourceId, ids), rangeWhere(affiliateSignup.createdAt, range))),
      this.buildUserAttribution(ids),
    ]);

    const userToSource = new Map<string, string>();
    for (const ua of userAttribution) userToSource.set(ua.userId, ua.sourceId);

    const userIds = new Set<string>();
    for (const s of signupRows) userIds.add(s.userId);

    const depositRows = await this.core.getDepositRows([...userIds], from, to);

    const sourceCommission = new Map<string, number>();
    for (const s of sources) sourceCommission.set(s.id, this.effectiveCommission(s));

    const byDate = new Map<string, { clicks: number; signups: number; promos: number; depositsSum: number; income: number }>();

    for (const c of clickRows) {
      const key = dateKey(c.date);
      const e = byDate.get(key) ?? { clicks: 0, signups: 0, promos: 0, depositsSum: 0, income: 0 };
      e.clicks++;
      byDate.set(key, e);
    }
    for (const s of signupRows) {
      const key = dateKey(s.date);
      const e = byDate.get(key) ?? { clicks: 0, signups: 0, promos: 0, depositsSum: 0, income: 0 };
      if (s.kind === "promo") e.promos++;
      else e.signups++;
      byDate.set(key, e);
    }
    for (const d of depositRows) {
      const key = dateKey(d.createdAt);
      const e = byDate.get(key) ?? { clicks: 0, signups: 0, promos: 0, depositsSum: 0, income: 0 };
      e.depositsSum += d.amount;
      const sid = userToSource.get(d.userId);
      if (sid) {
        e.income += Math.floor((d.amount * (sourceCommission.get(sid) ?? 0)) / 100);
      }
      byDate.set(key, e);
    }

    // Fill continuous days between from and to
    const out: Array<{ date: string; clicks: number; signups: number; promos: number; depositsSum: number; income: number }> = [];
    const cursor = new Date(from);
    const last = to ?? new Date();
    while (cursor.getTime() <= last.getTime()) {
      const key = dateKey(cursor);
      const e = byDate.get(key) ?? { clicks: 0, signups: 0, promos: 0, depositsSum: 0, income: 0 };
      out.push({ date: key, ...e });
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  private async buildUserAttribution(sourceIds: string[]): Promise<Array<{ userId: string; sourceId: string }>> {
    if (sourceIds.length === 0) return [];
    const rows = await db
      .select({
        userId: affiliateSignup.userId,
        sourceId: affiliateSignup.sourceId,
        createdAt: affiliateSignup.createdAt,
      })
      .from(affiliateSignup)
      .where(inArray(affiliateSignup.sourceId, sourceIds))
      .orderBy(affiliateSignup.createdAt);
    const seen = new Set<string>();
    const out: Array<{ userId: string; sourceId: string }> = [];
    for (const r of rows) {
      if (seen.has(r.userId)) continue;
      seen.add(r.userId);
      out.push({ userId: r.userId, sourceId: r.sourceId });
    }
    return out;
  }

  private async buildHistory(
    sources: SourceWithMeta[],
    range: Range,
  ): Promise<
    Array<{
      id: string;
      kind: "click" | "registration" | "promo" | "deposit";
      sourceId: string;
      sourceName: string;
      amount: number | null;
      createdAt: string;
    }>
  > {
    const ids = sources.map((s) => s.id);
    const nameById = new Map<string, string>();
    for (const s of sources) nameById.set(s.id, s.name);

    const [clickRows, signupRows] = await Promise.all([
      db
        .select()
        .from(affiliateClick)
        .where(and(inArray(affiliateClick.sourceId, ids), rangeWhere(affiliateClick.createdAt, range)))
        .orderBy(desc(affiliateClick.createdAt))
        .limit(150),
      db
        .select()
        .from(affiliateSignup)
        .where(and(inArray(affiliateSignup.sourceId, ids), rangeWhere(affiliateSignup.createdAt, range)))
        .orderBy(desc(affiliateSignup.createdAt))
        .limit(150),
    ]);

    const items: Array<{
      id: string;
      kind: "click" | "registration" | "promo" | "deposit";
      sourceId: string;
      sourceName: string;
      amount: number | null;
      createdAt: string;
    }> = [];

    for (const c of clickRows) {
      items.push({
        id: c.id,
        kind: "click",
        sourceId: c.sourceId,
        sourceName: nameById.get(c.sourceId) ?? "—",
        amount: null,
        createdAt: c.createdAt.toISOString(),
      });
    }
    for (const s of signupRows) {
      items.push({
        id: s.id,
        kind: s.kind === "promo" ? "promo" : "registration",
        sourceId: s.sourceId,
        sourceName: nameById.get(s.sourceId) ?? "—",
        amount: s.bonusGranted,
        createdAt: s.createdAt.toISOString(),
      });
    }

    // Deposits of referred users (income events)
    const userAttribution = await this.buildUserAttribution(ids);
    const userIds = userAttribution.map((u) => u.userId);
    if (userIds.length > 0) {
      const depositRows = await this.core.getDepositRows(userIds, range.from, range.to);
      const userToSource = new Map(userAttribution.map((u) => [u.userId, u.sourceId]));
      const sorted = [...depositRows].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, 150);
      for (const d of sorted) {
        const sid = userToSource.get(d.userId);
        if (!sid) continue;
        items.push({
          id: `dep_${d.userId}_${d.createdAt.getTime()}`,
          kind: "deposit",
          sourceId: sid,
          sourceName: nameById.get(sid) ?? "—",
          amount: d.amount,
          createdAt: d.createdAt.toISOString(),
        });
      }
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return items.slice(0, 200);
  }
}

function emptyAggregate(): SourceStatsAggregate {
  return { clicks: 0, uniqueClicks: 0, signups: 0, promos: 0, depositors: 0, depositsCount: 0, depositsSum: 0, income: 0, crPayment: null, cr: null };
}

function totalAggregate(map: Map<string, SourceStatsAggregate>): SourceStatsAggregate {
  const out = emptyAggregate();
  let signups = 0;
  let depositors = 0;
  let clicks = 0;
  for (const agg of map.values()) {
    out.clicks += agg.clicks;
    out.uniqueClicks += agg.uniqueClicks;
    out.signups += agg.signups;
    out.promos += agg.promos;
    out.depositors += agg.depositors;
    out.depositsCount += agg.depositsCount;
    out.depositsSum += agg.depositsSum;
    out.income += agg.income;
    signups += agg.signups;
    depositors += agg.depositors;
    clicks += agg.clicks;
  }
  out.crPayment = signups > 0 ? Math.round((depositors / signups) * 1000) / 10 : null;
  out.cr = clicks > 0 && signups > 0 ? Math.round((signups / clicks) * 1000) / 10 : null;
  return out;
}

function rangeWhere(col: AnyPgColumn, range: Range) {
  const parts: ReturnType<typeof gte>[] = [];
  if (range.from) parts.push(gte(col, range.from));
  if (range.to) parts.push(lte(col, range.to));
  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : and(...parts);
}

export const affiliateService = new AffiliateService();

export { iso, dateKey };
