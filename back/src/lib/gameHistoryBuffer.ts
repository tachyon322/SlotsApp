import { redis } from './redis';
import { db } from '../db';
import { slotsRound, minesRound, crashRound, casesRound, blockblastRound, minedropRound } from '../db/schema';
import { desc, eq } from 'drizzle-orm';
import { userCache } from './userCache';
import { achievementEngine } from './achievementEngine';
import { ROUND_XP, WIN_XP } from './levels';

export type GameType = 'slots' | 'mines' | 'crash' | 'cases' | 'blockblast' | 'minedrop';

export interface PendingRoundItem {
  game: GameType;
  data: any;
}

const PENDING_QUEUE_KEY = 'queue:pending_rounds';
const MAX_HISTORY_ITEMS = 50;
const HISTORY_TTL_SECONDS = 604800; // 7 days
// Cross-instance flush lock: lrange+ltrim is only safe when a single process
// owns a batch from read to trim, otherwise a second instance could trim
// queue items the first one has not persisted yet. TTL guards against a
// crashed holder blocking the flush forever.
const FLUSH_LOCK_KEY = 'queue:pending_rounds:flush_lock';
const FLUSH_LOCK_TTL_SECONDS = 120;

class GameHistoryBufferService {
  private timer: Timer | null = null;
  private isFlushing = false;

  constructor() {
    this.startPeriodicFlush();
  }

  private startPeriodicFlush() {
    if (typeof setInterval !== 'undefined') {
      this.timer = setInterval(() => {
        void this.flushToDatabase();
      }, 5000);
    }
  }

  /**
   * Push completed round to Redis read-cache, update stats hash, and queue for DB bulk flush.
   */
  async pushRound(game: GameType, userId: string, roundData: any): Promise<void> {
    try {
      const historyKey = `history:${game}:${userId}`;
      const statsKey = `stats:${game}:${userId}`;
      const jsonStr = JSON.stringify(roundData);

      // Pipeline Redis commands for max throughput
      const pipe = redis.pipeline();

      // 1. Add to user history ring buffer
      pipe.lpush(historyKey, jsonStr);
      pipe.ltrim(historyKey, 0, MAX_HISTORY_ITEMS - 1);
      pipe.expire(historyKey, HISTORY_TTL_SECONDS);

      // 2. Update stats hash
      pipe.hincrby(statsKey, 'totalCount', 1);
      if (roundData.payout > 0) {
        pipe.hincrby(statsKey, 'totalWinnings', Math.floor(roundData.payout));
      }
      pipe.expire(statsKey, HISTORY_TTL_SECONDS);

      // 3. Add to bulk write queue
      pipe.rpush(PENDING_QUEUE_KEY, JSON.stringify({ game, data: roundData }));

      const results = await pipe.exec();

      // Award XP for the round (Redis) and record achievements/challenges
      const isWin = roundData?.outcome === 'win';
      const xpGain = ROUND_XP + (isWin ? WIN_XP : 0);
      if (xpGain > 0) {
        userCache.addXp(userId, xpGain).catch((e) => {
          console.warn('[GameHistoryBuffer] addXp error:', e);
        });
      }
      achievementEngine.recordRound(userId, game, roundData).catch((e) => {
        console.warn('[GameHistoryBuffer] achievement record error:', e);
      });

      // Update maxWin if needed
      if (roundData.payout > 0) {
        const currentMaxStr = await redis.hget(statsKey, 'maxWin');
        const currentMax = currentMaxStr ? Number(currentMaxStr) : 0;
        if (roundData.payout > currentMax) {
          await redis.hset(statsKey, 'maxWin', Math.floor(roundData.payout));
        }
      }

      // Check if queue size >= 100 to trigger immediate flush
      const queueLen = results?.[3]?.[1] as number;
      if (typeof queueLen === 'number' && queueLen >= 100) {
        void this.flushToDatabase();
      }
    } catch (err) {
      console.error('[GameHistoryBuffer] Redis push failed, fallback to direct DB insert:', err);
      await this.directDbInsert(game, roundData);
    }
  }

  /**
   * Get user round history from Redis with fallback to Postgres DB on cache miss.
   */
  async getHistory(game: GameType, userId: string, limit = 30): Promise<any[]> {
    const historyKey = `history:${game}:${userId}`;

    try {
      const cached = await redis.lrange(historyKey, 0, limit - 1);
      if (cached && cached.length > 0) {
        return cached.map((str) => JSON.parse(str));
      }
    } catch (err) {
      console.warn('[GameHistoryBuffer] Redis history read error, querying DB:', err);
    }

    // Cache Miss -> Fetch from DB & repopulate Redis
    const dbItems = await this.fetchHistoryFromDb(game, userId, limit);
    if (dbItems.length > 0) {
      try {
        const pipe = redis.pipeline();
        for (const item of [...dbItems].reverse()) {
          pipe.rpush(historyKey, JSON.stringify(item));
        }
        pipe.ltrim(historyKey, 0, MAX_HISTORY_ITEMS - 1);
        pipe.expire(historyKey, HISTORY_TTL_SECONDS);
        await pipe.exec();
      } catch {
        // Ignore cache repopulate error
      }
    }

    return dbItems;
  }

  /**
   * Get aggregated user stats (totalWinnings, maxWin, totalCount).
   */
  async getStats(game: GameType, userId: string) {
    const statsKey = `stats:${game}:${userId}`;

    try {
      const statsObj = await redis.hgetall(statsKey);
      if (statsObj && Object.keys(statsObj).length > 0) {
        return {
          totalWinnings: Number(statsObj.totalWinnings || 0),
          maxWin: Number(statsObj.maxWin || 0),
          totalCount: Number(statsObj.totalCount || 0),
        };
      }
    } catch (err) {
      console.warn('[GameHistoryBuffer] Redis stats read error, calculating from DB:', err);
    }

    // DB fallback for stats
    return this.calculateStatsFromDb(game, userId);
  }

  /**
   * Flush pending rounds queue to PostgreSQL in bulk batch transactions.
   */
  async flushToDatabase(): Promise<number> {
    if (this.isFlushing) return 0;
    this.isFlushing = true;

    let totalFlushed = 0;
    let lockHeld = false;
    const lockToken = crypto.randomUUID();

    try {
      // Acquire the cross-instance lock before touching the queue.
      const lock = await redis.set(FLUSH_LOCK_KEY, lockToken, 'EX', FLUSH_LOCK_TTL_SECONDS, 'NX');
      if (lock !== 'OK') return 0;
      lockHeld = true;

      // Read the batch WITHOUT popping: if the DB insert fails, the items stay
      // in the queue and are retried on the next tick (LPOP would lose them).
      const batchRaw = await redis.lrange(PENDING_QUEUE_KEY, 0, 199);

      if (batchRaw.length === 0) {
        return 0;
      }

      const slotsBatch: any[] = [];
      const minesBatch: any[] = [];
      const crashBatch: any[] = [];
      const casesBatch: any[] = [];
      const blockblastBatch: any[] = [];
      const minedropBatch: any[] = [];

      for (const str of batchRaw) {
        try {
          const parsed = JSON.parse(str) as PendingRoundItem;
          if (parsed.game === 'slots') slotsBatch.push(parsed.data);
          else if (parsed.game === 'mines') minesBatch.push(parsed.data);
          else if (parsed.game === 'crash') crashBatch.push(parsed.data);
          else if (parsed.game === 'cases') casesBatch.push(parsed.data);
          else if (parsed.game === 'blockblast') blockblastBatch.push(parsed.data);
          else if (parsed.game === 'minedrop') minedropBatch.push(parsed.data);
        } catch {
          // Skip corrupt item
        }
      }

      await db.transaction(async (tx) => {
        // onConflictDoNothing keeps re-processing safe: if LTRIM below fails,
        // the same rounds are inserted again on the next tick as no-ops.
        if (slotsBatch.length > 0) {
          await tx.insert(slotsRound).values(slotsBatch).onConflictDoNothing();
        }
        if (minesBatch.length > 0) {
          await tx.insert(minesRound).values(minesBatch).onConflictDoNothing();
        }
        if (crashBatch.length > 0) {
          await tx.insert(crashRound).values(crashBatch).onConflictDoNothing();
        }
        if (casesBatch.length > 0) {
          await tx.insert(casesRound).values(casesBatch).onConflictDoNothing();
        }
        if (blockblastBatch.length > 0) {
          await tx.insert(blockblastRound).values(blockblastBatch).onConflictDoNothing();
        }
        if (minedropBatch.length > 0) {
          await tx.insert(minedropRound).values(minedropBatch).onConflictDoNothing();
        }
      });

      // Remove only what was successfully persisted, and only if we still own
      // the lock. If the lock expired and another instance took over, it will
      // trim this batch itself (our inserts were no-ops via onConflictDoNothing);
      // trimming here would skip rows the other instance read but hasn't
      // persisted yet.
      const owner = await redis.get(FLUSH_LOCK_KEY);
      if (owner === lockToken) {
        await redis.ltrim(PENDING_QUEUE_KEY, batchRaw.length, -1);
        totalFlushed = batchRaw.length;
      } else {
        console.warn('[GameHistoryBuffer] Lost flush lock mid-batch, leaving queue for the new owner');
      }

      if (totalFlushed > 0) {
        console.log(`[GameHistoryBuffer] Bulk flushed ${totalFlushed} rounds to PostgreSQL (slots:${slotsBatch.length}, mines:${minesBatch.length}, crash:${crashBatch.length}, cases:${casesBatch.length}, blockblast:${blockblastBatch.length}, minedrop:${minedropBatch.length})`);
      }
    } catch (err) {
      console.error('[GameHistoryBuffer] Bulk DB flush error:', err);
    } finally {
      if (lockHeld) {
        const owner = await redis.get(FLUSH_LOCK_KEY);
        if (owner === lockToken) {
          await redis.del(FLUSH_LOCK_KEY).catch(() => {});
        }
      }
      this.isFlushing = false;
    }

    return totalFlushed;
  }

  private async directDbInsert(game: GameType, roundData: any) {
    try {
      if (game === 'slots') await db.insert(slotsRound).values(roundData);
      else if (game === 'mines') await db.insert(minesRound).values(roundData);
      else if (game === 'crash') await db.insert(crashRound).values(roundData);
      else if (game === 'cases') await db.insert(casesRound).values(roundData);
      else if (game === 'blockblast') await db.insert(blockblastRound).values(roundData);
      else if (game === 'minedrop') await db.insert(minedropRound).values(roundData);
    } catch (e) {
      console.error('[GameHistoryBuffer] Direct DB insert fallback error:', e);
    }
  }

  private async fetchHistoryFromDb(game: GameType, userId: string, limit: number): Promise<any[]> {
    if (game === 'slots') {
      return db.select().from(slotsRound).where(eq(slotsRound.userId, userId)).orderBy(desc(slotsRound.createdAt)).limit(limit);
    }
    if (game === 'mines') {
      return db.select().from(minesRound).where(eq(minesRound.userId, userId)).orderBy(desc(minesRound.createdAt)).limit(limit);
    }
    if (game === 'crash') {
      return db.select().from(crashRound).where(eq(crashRound.userId, userId)).orderBy(desc(crashRound.createdAt)).limit(limit);
    }
    if (game === 'cases') {
      return db.select().from(casesRound).where(eq(casesRound.userId, userId)).orderBy(desc(casesRound.createdAt)).limit(limit);
    }
    if (game === 'blockblast') {
      return db.select().from(blockblastRound).where(eq(blockblastRound.userId, userId)).orderBy(desc(blockblastRound.createdAt)).limit(limit);
    }
    if (game === 'minedrop') {
      return db.select().from(minedropRound).where(eq(minedropRound.userId, userId)).orderBy(desc(minedropRound.createdAt)).limit(limit);
    }
    return [];
  }

  private async calculateStatsFromDb(game: GameType, userId: string) {
    let rounds: Array<{ payout: number; bet: number }> = [];
    if (game === 'slots') {
      rounds = await db.select({ payout: slotsRound.payout, bet: slotsRound.bet }).from(slotsRound).where(eq(slotsRound.userId, userId));
    } else if (game === 'mines') {
      rounds = await db.select({ payout: minesRound.payout, bet: minesRound.bet }).from(minesRound).where(eq(minesRound.userId, userId));
    } else if (game === 'crash') {
      rounds = await db.select({ payout: crashRound.payout, bet: crashRound.bet }).from(crashRound).where(eq(crashRound.userId, userId));
    } else if (game === 'cases') {
      rounds = await db.select({ payout: casesRound.payout, bet: casesRound.bet }).from(casesRound).where(eq(casesRound.userId, userId));
    } else if (game === 'blockblast') {
      rounds = await db.select({ payout: blockblastRound.payout, bet: blockblastRound.bet }).from(blockblastRound).where(eq(blockblastRound.userId, userId));
    } else if (game === 'minedrop') {
      rounds = await db.select({ payout: minedropRound.payout, bet: minedropRound.bet }).from(minedropRound).where(eq(minedropRound.userId, userId));
    }

    let totalWinnings = 0;
    let maxWin = 0;
    for (const r of rounds) {
      if (r.payout > 0) {
        totalWinnings += r.payout;
        if (r.payout > maxWin) maxWin = r.payout;
      }
    }

    return {
      totalWinnings,
      maxWin,
      totalCount: rounds.length,
    };
  }

  async destroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flushToDatabase();
  }
}

export const gameHistoryBuffer = new GameHistoryBufferService();
