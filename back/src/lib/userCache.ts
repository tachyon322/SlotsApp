import { redis } from './redis';
import { db } from '../db';
import { user as userTable } from '../db/schema';
import { eq } from 'drizzle-orm';

export interface UserProfileData {
  id: string;
  name: string;
  email: string;
  balance: number;
  level: number;
  xp: number;
  image?: string | null;
}

const PROFILE_TTL_SECONDS = 86400; // 24 hours
const DIRTY_BALANCES_SET_KEY = 'set:dirty_user_balances';

class UserCacheService {
  private timer: Timer | null = null;
  private isSyncing = false;

  constructor() {
    this.startPeriodicBalanceSync();
  }

  private startPeriodicBalanceSync() {
    if (typeof setInterval !== 'undefined') {
      this.timer = setInterval(() => {
        void this.flushBalancesToDb();
      }, 5000);
    }
  }

  /**
   * Get user profile from Redis with automatic DB fallback on cache miss.
   */
  async getUserProfile(userId: string): Promise<UserProfileData | null> {
    const key = `user:profile:${userId}`;

    try {
      const cached = await redis.hgetall(key);
      if (cached && cached.id) {
        return {
          id: cached.id,
          name: cached.name || '',
          email: cached.email || '',
          balance: Math.floor(Number(cached.balance || 0)),
          level: Math.floor(Number(cached.level || 1)),
          xp: Math.floor(Number(cached.xp || 0)),
          image: cached.image || null,
        };
      }
    } catch (err) {
      console.warn('[UserCache] Redis read error, querying DB:', err);
    }

    // Cache miss -> Query Postgres DB
    const rows = await db.select().from(userTable).where(eq(userTable.id, userId));
    const usr = rows[0];
    if (!usr) return null;

    const profile: UserProfileData = {
      id: usr.id,
      name: usr.name,
      email: usr.email,
      balance: usr.balance,
      level: usr.level,
      xp: usr.xp,
      image: usr.image,
    };

    // Cache in Redis
    try {
      await this.setUserProfile(usr.id, profile);
    } catch {
      // Ignore cache write error
    }

    return profile;
  }

  /**
   * Set or update full user profile in Redis
   */
  async setUserProfile(userId: string, profile: UserProfileData): Promise<void> {
    const key = `user:profile:${userId}`;
    const pipe = redis.pipeline();
    pipe.hset(key, {
      id: profile.id,
      name: profile.name,
      email: profile.email,
      balance: Math.floor(profile.balance),
      level: Math.floor(profile.level),
      xp: Math.floor(profile.xp),
      image: profile.image || '',
    });
    pipe.expire(key, PROFILE_TTL_SECONDS);
    await pipe.exec();
  }

  /**
   * Atomically adjust user balance in Redis and mark for DB sync
   */
  async adjustUserBalance(userId: string, deltaAmount: number): Promise<number> {
    const key = `user:profile:${userId}`;

    // Ensure profile exists in Redis
    const currentProfile = await this.getUserProfile(userId);
    if (!currentProfile) {
      throw new Error('user_not_found');
    }

    const currentBalance = currentProfile.balance;
    if (currentBalance + deltaAmount < 0) {
      throw new Error('insufficient_balance');
    }

    // Atomic increment/decrement in Redis
    const newBalance = await redis.hincrby(key, 'balance', deltaAmount);
    await redis.expire(key, PROFILE_TTL_SECONDS);

    // Mark userId in dirty balances set for background DB sync
    await redis.sadd(DIRTY_BALANCES_SET_KEY, userId);

    return newBalance;
  }

  /**
   * Flush updated user balances to PostgreSQL in batch transactions
   */
  async flushBalancesToDb(): Promise<number> {
    if (this.isSyncing) return 0;
    this.isSyncing = true;

    let syncedCount = 0;
    try {
      const dirtyUserIds = await redis.smembers(DIRTY_BALANCES_SET_KEY);
      if (!dirtyUserIds || dirtyUserIds.length === 0) {
        this.isSyncing = false;
        return 0;
      }

      // Pop user IDs to sync
      await redis.del(DIRTY_BALANCES_SET_KEY);

      for (const userId of dirtyUserIds) {
        const cachedBalanceStr = await redis.hget(`user:profile:${userId}`, 'balance');
        if (cachedBalanceStr !== null) {
          const newBal = Math.floor(Number(cachedBalanceStr));
          await db
            .update(userTable)
            .set({ balance: newBal, updatedAt: new Date() })
            .where(eq(userTable.id, userId));
          syncedCount++;
        }
      }

      if (syncedCount > 0) {
        console.log(`[UserCache] Synced ${syncedCount} user balance(s) to PostgreSQL`);
      }
    } catch (err) {
      console.error('[UserCache] Error syncing user balances to DB:', err);
    } finally {
      this.isSyncing = false;
    }

    return syncedCount;
  }

  async destroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flushBalancesToDb();
  }
}

export const userCache = new UserCacheService();
