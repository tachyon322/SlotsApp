import { eq } from "drizzle-orm";
import { redis } from "./redis";
import { db } from "../db";
import { affiliateClick, affiliateSignup } from "../affiliate/schema";
import type { AffiliateSignupKind } from "../affiliate/interfaces";

/**
 * Redis-first counters for affiliate conversion data.
 *
 * Conversion events (clicks, signups, promo activations, deposits of
 * referred users) are recorded into Redis counters first, and all-time
 * reads (sources list, leaderboard) are served from these counters instead
 * of running GROUP BY / scan queries against PostgreSQL.
 *
 * PostgreSQL remains the source of truth: click details are flushed to
 * `affiliate_clicks` in batches, signups are still written to
 * `affiliate_signups` (unique index guards duplicates). When Redis is cold
 * for the requested sources the callers fall back to direct DB aggregation
 * and write the results back into Redis (`seedAll`) so the counters warm up
 * naturally. Date-ranged reads always go through PostgreSQL to guarantee
 * correctness for arbitrary periods.
 */

export interface CounterStats {
  clicks: number;
  uniqueClicks: number;
  signups: number;
  promos: number;
  depositors: number;
  depositsCount: number;
  depositsSum: number;
}

interface Range {
  from?: Date;
  to?: Date;
}

const DAILY_TTL = 120 * 86400; // 120 days
const FLUSH_INTERVAL_MS = 5000;
const CLICK_BUFFER_KEY = "aff:clicks_buf";
const CLICK_FLUSH_CHUNK = 500;

const STAT = (sourceId: string) => `aff:stats:${sourceId}`;
const SEEDED = (sourceId: string) => `aff:seeded:${sourceId}`;
const DAILY = (sourceId: string, day: string) => `aff:daily:${sourceId}:${day}`;
const UNIQ_TOTAL = (sourceId: string) => `aff:uniq:${sourceId}:total`;
const UNIQ_DAY = (sourceId: string, day: string) => `aff:uniq:${sourceId}:${day}`;
const SIGNUP_SET = (sourceId: string, kind: string) => `aff:signups:${sourceId}:${kind}`;
const USER_SOURCE = (userId: string) => `aff:user_source:${userId}`;
const DEPOSITORS = (sourceId: string) => `aff:depositors:${sourceId}`;
const DEPOSITORS_DAY = (sourceId: string, day: string) => `aff:depositors:${sourceId}:${day}`;

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

class AffiliateCountersService {
  private timer: Timer | null = null;
  private isFlushing = false;

  constructor() {
    this.startClickFlush();
  }

  private startClickFlush() {
    if (typeof setInterval !== "undefined") {
      this.timer = setInterval(() => {
        void this.flushClicks();
      }, FLUSH_INTERVAL_MS);
    }
  }

  // ------------------------------------------------------------- writes

  /**
   * Record a click: bump counters (total + daily), add IP to HLL for unique
   * counting and buffer the click details for a batched DB flush. Falls back
   * to a direct DB insert if Redis is unavailable so click history is never
   * lost.
   */
  async recordClick(sourceId: string, meta: { ip?: string; userAgent?: string; referrer?: string }): Promise<void> {
    const ip = meta.ip || null;
    const day = dayKey(new Date());
    const payload = {
      id: crypto.randomUUID(),
      sourceId,
      ip,
      userAgent: meta.userAgent || null,
      referrer: meta.referrer || null,
      createdAt: new Date().toISOString(),
    };

    try {
      const pipe = redis.pipeline();
      pipe.hincrby(STAT(sourceId), "clicks", 1);
      pipe.hincrby(DAILY(sourceId, day), "clicks", 1);
      pipe.expire(DAILY(sourceId, day), DAILY_TTL);
      if (ip) {
        pipe.pfadd(UNIQ_TOTAL(sourceId), ip);
        pipe.pfadd(UNIQ_DAY(sourceId, day), ip);
        pipe.expire(UNIQ_DAY(sourceId, day), DAILY_TTL);
      }
      pipe.lpush(CLICK_BUFFER_KEY, JSON.stringify(payload));
      await pipe.exec();
    } catch (err) {
      console.warn("[AffiliateCounters] recordClick redis error, falling back to DB:", err);
      await db.insert(affiliateClick).values({
        id: payload.id,
        sourceId,
        ip,
        userAgent: payload.userAgent,
        referrer: payload.referrer,
        createdAt: new Date(payload.createdAt),
      });
    }
  }

  /**
   * Record a signup (registration or promo activation). Dedup per
   * (source, kind) via an atomic SADD, bump counters and set first-wins
   * user attribution. Errors are non-fatal: the caller still persists the
   * signup row to PostgreSQL (unique index guards against duplicates).
   */
  async recordSignup(sourceId: string, userId: string, kind: AffiliateSignupKind): Promise<void> {
    try {
      const day = dayKey(new Date());
      const added = await redis.sadd(SIGNUP_SET(sourceId, kind), userId);
      const pipe = redis.pipeline();
      if (added === 1) {
        const field = kind === "promo" ? "promos" : "signups";
        pipe.hincrby(STAT(sourceId), field, 1);
        pipe.hincrby(DAILY(sourceId, day), field, 1);
        pipe.expire(DAILY(sourceId, day), DAILY_TTL);
      }
      pipe.setnx(USER_SOURCE(userId), sourceId);
      await pipe.exec();
    } catch (err) {
      console.warn("[AffiliateCounters] recordSignup redis error:", err);
    }
  }

  /**
   * Attribute a successful deposit of a referred user to their source.
   * Called from the casino deposit flow after the deposit is credited.
   */
  async recordDeposit(userId: string, amount: number, createdAt: Date): Promise<void> {
    const normalized = Math.floor(Number(amount) || 0);
    if (normalized <= 0) return;

    let sourceId: string | null = null;
    try {
      sourceId = await redis.get(USER_SOURCE(userId));
    } catch (err) {
      console.warn("[AffiliateCounters] recordDeposit redis error:", err);
    }

    if (!sourceId) {
      sourceId = await this.lookupAttributionFromDb(userId);
      if (!sourceId) return;
      try {
        await redis.setnx(USER_SOURCE(userId), sourceId);
      } catch (err) {
        console.warn("[AffiliateCounters] recordDeposit attribution cache error:", err);
      }
    }

    const day = dayKey(createdAt);
    try {
      const pipe = redis.pipeline();
      pipe.hincrby(STAT(sourceId), "depositsCount", 1);
      pipe.hincrby(STAT(sourceId), "depositsSum", normalized);
      pipe.hincrby(DAILY(sourceId, day), "depositsCount", 1);
      pipe.hincrby(DAILY(sourceId, day), "depositsSum", normalized);
      pipe.expire(DAILY(sourceId, day), DAILY_TTL);
      pipe.sadd(DEPOSITORS(sourceId), userId);
      pipe.sadd(DEPOSITORS_DAY(sourceId, day), userId);
      pipe.expire(DEPOSITORS_DAY(sourceId, day), DAILY_TTL);
      await pipe.exec();
    } catch (err) {
      console.warn("[AffiliateCounters] recordDeposit counters error:", err);
    }
  }

  private async lookupAttributionFromDb(userId: string): Promise<string | null> {
    const rows = await db
      .select({ sourceId: affiliateSignup.sourceId })
      .from(affiliateSignup)
      .where(eq(affiliateSignup.userId, userId))
      .orderBy(affiliateSignup.createdAt)
      .limit(1);
    return rows[0]?.sourceId ?? null;
  }  /**
   * Flush buffered clicks to PostgreSQL in a single batch. Runs on a timer.
   */
  async flushClicks(): Promise<number> {
    if (this.isFlushing) return 0;
    this.isFlushing = true;
    let flushed = 0;
    try {
      const length = await redis.llen(CLICK_BUFFER_KEY);
      if (!length || length <= 0) {
        return 0;
      }
      const raw = await redis.lrange(CLICK_BUFFER_KEY, 0, Math.min(length, CLICK_FLUSH_CHUNK) - 1);
      if (raw.length === 0) return 0;

      const rows: Array<{
        id: string;
        sourceId: string;
        ip: string | null;
        userAgent: string | null;
        referrer: string | null;
        createdAt: Date;
      }> = [];
      for (const item of raw) {
        try {
          const parsed = JSON.parse(item) as {
            id: string;
            sourceId: string;
            ip?: string | null;
            userAgent?: string | null;
            referrer?: string | null;
            createdAt: string;
          };
          rows.push({
            id: parsed.id,
            sourceId: parsed.sourceId,
            ip: parsed.ip || null,
            userAgent: parsed.userAgent || null,
            referrer: parsed.referrer || null,
            createdAt: new Date(parsed.createdAt),
          });
        } catch {
          // skip malformed buffer entries
        }
      }

      if (rows.length > 0) {
        await db.insert(affiliateClick).values(rows).onConflictDoNothing();
        flushed = rows.length;
      }
      await redis.ltrim(CLICK_BUFFER_KEY, raw.length, -1);
    } catch (err) {
      console.error("[AffiliateCounters] flushClicks error:", err);
    } finally {
      this.isFlushing = false;
    }
    return flushed;
  }

  // ------------------------------------------------------------- reads

  /**
   * Return all-time counters for the requested sources from Redis, or
   * `null` when Redis is cold for at least one source (caller should fall
   * back to PostgreSQL and seed the counters via `seedAll`). Date-ranged
   * reads are intentionally not served from Redis — they always go through
   * PostgreSQL to stay correct for arbitrary periods.
   */
  async getStats(sourceIds: string[], range: Range = {}): Promise<Map<string, CounterStats> | null> {
    if (sourceIds.length === 0) return new Map();
    if (range.from || range.to) return null;

    try {
      const seededResults = await Promise.all(sourceIds.map((id) => redis.exists(SEEDED(id))));
      if (seededResults.some((v) => v === 0)) return null;

      const statKeys = sourceIds.map((id) => STAT(id));
      const hashResults = await Promise.all(statKeys.map((key) => redis.hgetall(key)));
      const uniqResults = await Promise.all(sourceIds.map((id) => redis.pfcount(UNIQ_TOTAL(id))));
      const depositorResults = await Promise.all(sourceIds.map((id) => redis.scard(DEPOSITORS(id))));

      const out = new Map<string, CounterStats>();
      sourceIds.forEach((id, i) => {
        const fields = hashResults[i];
        out.set(id, {
          clicks: Math.floor(Number(fields.clicks || 0)),
          uniqueClicks: Math.floor(Number(uniqResults[i]) || 0),
          signups: Math.floor(Number(fields.signups || 0)),
          promos: Math.floor(Number(fields.promos || 0)),
          depositors: Math.floor(Number(depositorResults[i]) || 0),
          depositsCount: Math.floor(Number(fields.depositsCount || 0)),
          depositsSum: Math.floor(Number(fields.depositsSum || 0)),
        });
      });
      return out;
    } catch (err) {
      console.warn("[AffiliateCounters] getStats redis error, falling back to DB:", err);
      return null;
    }
  }

  /**
   * Write a full all-time snapshot of a source into Redis and mark it as
   * seeded. Must be called after a PostgreSQL aggregation so Redis stays
   * consistent with the DB (historical signups/deposits/unique clicks are
   * included). Subsequent live events keep incrementing these counters.
   */
  async seedSource(
    sourceId: string,
    stats: CounterStats,
    extra: { uniqIps?: string[]; depositorUserIds?: string[]; signupUserIds?: Record<string, string[]> } = {},
  ): Promise<void> {
    try {
      const pipe = redis.pipeline();
      pipe.hset(STAT(sourceId), {
        clicks: String(Math.floor(Number(stats.clicks) || 0)),
        signups: String(Math.floor(Number(stats.signups) || 0)),
        promos: String(Math.floor(Number(stats.promos) || 0)),
        depositsCount: String(Math.floor(Number(stats.depositsCount) || 0)),
        depositsSum: String(Math.floor(Number(stats.depositsSum) || 0)),
      });
      pipe.set(SEEDED(sourceId), "1");
      const uniqIps = (extra.uniqIps ?? []).filter((ip) => ip && ip.trim());
      if (uniqIps.length > 0) pipe.pfadd(UNIQ_TOTAL(sourceId), ...uniqIps);
      const depositors = extra.depositorUserIds ?? [];
      if (depositors.length > 0) pipe.sadd(DEPOSITORS(sourceId), ...depositors);
      for (const [kind, userIds] of Object.entries(extra.signupUserIds ?? {})) {
        if (userIds.length > 0) pipe.sadd(SIGNUP_SET(sourceId, kind), ...userIds);
      }
      await pipe.exec();
    } catch (err) {
      console.warn("[AffiliateCounters] seedSource redis error:", err);
    }
  }

  /**
   * Delete all affiliate counter keys (for manual reset / rebuild). Does NOT
   * touch other Redis data (user profiles, balances, etc.).
   */
  async clearAll(): Promise<void> {
    try {
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [next, batch] = await redis.scan(cursor, "MATCH", "aff:*", "COUNT", 500);
        cursor = next;
        keys.push(...batch);
      } while (cursor !== "0");
      if (keys.length > 0) await redis.del(...keys);
    } catch (err) {
      console.warn("[AffiliateCounters] clearAll error:", err);
    }
  }

  async destroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flushClicks();
  }
}

export const affiliateCounters = new AffiliateCountersService();
