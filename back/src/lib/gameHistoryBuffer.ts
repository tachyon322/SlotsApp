import { redis } from './redis';
import { db } from '../db';
import { slotsRound, minesRound, crashRound } from '../db/schema';
import { desc, eq } from 'drizzle-orm';

export type GameType = 'slots' | 'mines' | 'crash';

export interface PendingRoundItem {
  game: GameType;
  data: any;
}

const PENDING_QUEUE_KEY = 'queue:pending_rounds';
const MAX_HISTORY_ITEMS = 50;
const HISTORY_TTL_SECONDS = 604800; // 7 days

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

    try {
      // Pop up to 200 items from pending queue
      const batchRaw: string[] = [];
      for (let i = 0; i < 200; i++) {
        const item = await redis.lpop(PENDING_QUEUE_KEY);
        if (!item) break;
        batchRaw.push(item);
      }

      if (batchRaw.length === 0) {
        this.isFlushing = false;
        return 0;
      }

      const slotsBatch: any[] = [];
      const minesBatch: any[] = [];
      const crashBatch: any[] = [];

      for (const str of batchRaw) {
        try {
          const parsed = JSON.parse(str) as PendingRoundItem;
          if (parsed.game === 'slots') slotsBatch.push(parsed.data);
          else if (parsed.game === 'mines') minesBatch.push(parsed.data);
          else if (parsed.game === 'crash') crashBatch.push(parsed.data);
        } catch {
          // Skip corrupt item
        }
      }

      await db.transaction(async (tx) => {
        if (slotsBatch.length > 0) {
          await tx.insert(slotsRound).values(slotsBatch);
        }
        if (minesBatch.length > 0) {
          await tx.insert(minesRound).values(minesBatch);
        }
        if (crashBatch.length > 0) {
          await tx.insert(crashRound).values(crashBatch);
        }
      });

      totalFlushed = batchRaw.length;
      console.log(`[GameHistoryBuffer] Bulk flushed ${totalFlushed} rounds to PostgreSQL (slots:${slotsBatch.length}, mines:${minesBatch.length}, crash:${crashBatch.length})`);
    } catch (err) {
      console.error('[GameHistoryBuffer] Bulk DB flush error:', err);
    } finally {
      this.isFlushing = false;
    }

    return totalFlushed;
  }

  private async directDbInsert(game: GameType, roundData: any) {
    try {
      if (game === 'slots') await db.insert(slotsRound).values(roundData);
      else if (game === 'mines') await db.insert(minesRound).values(roundData);
      else if (game === 'crash') await db.insert(crashRound).values(roundData);
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
