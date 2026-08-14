import { redis } from './redis';
import { db } from '../db';
import { user as userTable, transaction } from '../db/schema';
import { eq } from 'drizzle-orm';
import { MAX_LEVEL } from './levels';

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
const WITHDRAW_MARKER_TTL_SECONDS = 604800; // 7 days: must outlive any outage before the sweep consumes it
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
   * Admin: overwrite account fields (balance, level, xp, name, email) in both
   * the Redis profile cache and PostgreSQL, then mark for background balance sync.
   */
  async setAdminFields(
    userId: string,
    fields: {
      balance?: number;
      level?: number;
      xp?: number;
      name?: string;
      email?: string;
      operator?: string;
    },
  ): Promise<UserProfileData> {
    const current = await this.getUserProfile(userId);
    if (!current) {
      throw new Error('user_not_found');
    }

    const merged: UserProfileData = {
      ...current,
      balance:
        fields.balance !== undefined
          ? Math.max(0, Math.floor(fields.balance))
          : current.balance,
      level:
        fields.level !== undefined ? Math.max(1, Math.floor(fields.level)) : current.level,
      xp: fields.xp !== undefined ? Math.max(0, Math.floor(fields.xp)) : current.xp,
      name:
        fields.name !== undefined && fields.name.trim() ? fields.name.trim() : current.name,
      email:
        fields.email !== undefined && fields.email.trim()
          ? fields.email.trim()
          : current.email,
    };

    await this.setUserProfile(userId, merged);
    await db
      .update(userTable)
      .set({
        balance: merged.balance,
        level: merged.level,
        xp: merged.xp,
        name: merged.name,
        email: merged.email,
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, userId));

    // Каждая ручная корректировка баланса обязана оставить след в истории
    // транзакций — иначе сверки и поддержка не могут объяснить баланс.
    if (fields.balance !== undefined && merged.balance !== current.balance) {
      const delta = merged.balance - current.balance;
      await db
        .insert(transaction)
        .values({
          id: crypto.randomUUID(),
          userId,
          type: "bonus",
          amount: Math.abs(delta),
          status: "success",
          balanceDebited: delta < 0,
          method: "Корректировка администратором",
          details: JSON.stringify({
            operator: fields.operator || "admin",
            from: current.balance,
            to: merged.balance,
          }),
          createdAt: new Date(),
        })
        .catch((e) => {
          console.error("[UserCache] setAdminFields balance transaction insert failed:", e);
        });
    }

    await redis.sadd(DIRTY_BALANCES_SET_KEY, userId);

    return merged;
  }

  /**
   * Atomically adjust user balance in Redis and mark for DB sync
   */
  async adjustUserBalance(userId: string, deltaAmount: number): Promise<number> {    const key = `user:profile:${userId}`;

    // Ensure profile exists in Redis
    const currentProfile = await this.getUserProfile(userId);
    if (!currentProfile) {
      throw new Error('user_not_found');
    }

    // Mark dirty BEFORE mutating the balance. If sadd threw after the Lua eval,
    // this function would throw after the balance already changed — callers
    // cannot tell whether the debit happened (withdraw would delete its intent
    // row, deposits would re-credit on retry). Sadd is idempotent and harmless
    // if the eval then fails: the dirty entry only re-syncs the same balance.
    await redis.sadd(DIRTY_BALANCES_SET_KEY, userId);

    // Атомарная проверка + изменение баланса одной операцией Lua.
    // Исключает гонку «проверка по устаревшему балансу → запись» (TOCTOU)
    // при параллельных запросах (двойной клик / несколько запросов одновременно).
    const script = `
      local balance = tonumber(redis.call('hget', KEYS[1], 'balance') or '0')
      local delta = tonumber(ARGV[1])
      if balance + delta < 0 then
        return -1
      end
      redis.call('hincrby', KEYS[1], 'balance', delta)
      redis.call('expire', KEYS[1], ${PROFILE_TTL_SECONDS})
      return balance + delta
    `;

    const res = Number(await redis.eval(script, 1, key, String(Math.floor(deltaAmount))));
    if (res < 0) {
      throw new Error('insufficient_balance');
    }

    return res;
  }

  /**
   * Debit for a withdrawal intent. Same atomic check+debit as adjustUserBalance,
   * but the Lua script also writes a marker key in the SAME operation, so a
   * crash right after the debit leaves proof of the mutation: the recovery
   * sweep can distinguish "debited" (refund) from "never debited" (no-op)
   * instead of guessing and either losing the user's money or printing it.
   */
  async debitForWithdraw(userId: string, deltaAmount: number, intentId: string): Promise<number> {
    const key = `user:profile:${userId}`;
    const markerKey = `withdraw:debit_marker:${intentId}`;

    const currentProfile = await this.getUserProfile(userId);
    if (!currentProfile) {
      throw new Error('user_not_found');
    }

    await redis.sadd(DIRTY_BALANCES_SET_KEY, userId);

    // The marker doubles as an idempotency key: ioredis re-sends in-flight
    // commands on reconnect (maxRetriesPerRequest), so a lost response can
    // re-execute this script. Without the exists guard the retry would debit
    // a second time and the single marker refund would silently leave the user
    // at -amount.
    const script = `
      if redis.call('exists', KEYS[2]) == 1 then
        return -2
      end
      local balance = tonumber(redis.call('hget', KEYS[1], 'balance') or '0')
      local delta = tonumber(ARGV[1])
      if balance + delta < 0 then
        return -1
      end
      redis.call('hincrby', KEYS[1], 'balance', delta)
      redis.call('expire', KEYS[1], ${PROFILE_TTL_SECONDS})
      redis.call('set', KEYS[2], '1', 'EX', ${WITHDRAW_MARKER_TTL_SECONDS})
      return balance + delta
    `;

    const res = Number(await redis.eval(script, 2, key, markerKey, String(Math.floor(deltaAmount))));
    if (res === -2) {
      // The first execution debited and set the marker, then lost its response;
      // the retry saw the marker. Money already left the balance — report the
      // current balance so the caller flags the row and completes normally.
      const currentProfile = await this.getUserProfile(userId);
      if (!currentProfile) {
        throw new Error('user_not_found');
      }
      return currentProfile.balance;
    }
    if (res < 0) {
      throw new Error('insufficient_balance');
    }

    return res;
  }

  /**
   * Refund a withdrawal debit iff it actually happened. Consumes the debit
   * marker and credits the balance in ONE atomic Lua script (GETDEL), so of
   * all concurrent consumers (sweep, /withdraw catch, refund path) exactly one
   * performs the refund — never zero (money lost) and never two (money
   * printed). If Redis fails, nothing changed and the marker survives for a
   * retry.
   */
  async refundIfDebited(userId: string, amount: number, intentId: string): Promise<boolean> {
    const key = `user:profile:${userId}`;
    const markerKey = `withdraw:debit_marker:${intentId}`;

    const currentProfile = await this.getUserProfile(userId);
    if (!currentProfile) {
      throw new Error('user_not_found');
    }

    await redis.sadd(DIRTY_BALANCES_SET_KEY, userId);

    // get+del inside the script instead of GETDEL for Redis < 6.2; atomic
    // either way.
    const script = `
      local marker = redis.call('get', KEYS[2])
      if not marker then
        return 0
      end
      redis.call('del', KEYS[2])
      local balance = tonumber(redis.call('hget', KEYS[1], 'balance') or '0')
      local amount = tonumber(ARGV[1])
      redis.call('hincrby', KEYS[1], 'balance', amount)
      redis.call('expire', KEYS[1], ${PROFILE_TTL_SECONDS})
      return balance + amount
    `;

    const res = Number(await redis.eval(script, 2, key, markerKey, String(Math.floor(amount))));
    return res !== 0;
  }

  /**
   * Atomically add XP in Redis (Lua script), resolve level-ups and grant level
   * rewards. Returns updated level/xp plus any level-up money rewards credited.
   */
  async addXp(
    userId: string,
    amount: number,
  ): Promise<{ level: number; xp: number; leveledUp: boolean; levelRewards: number[] }> {
    const key = `user:profile:${userId}`;

    const currentProfile = await this.getUserProfile(userId);
    if (!currentProfile) {
      throw new Error('user_not_found');
    }

    if (amount <= 0) {
      return {
        level: currentProfile.level,
        xp: currentProfile.xp,
        leveledUp: false,
        levelRewards: [],
      };
    }

    // Mark dirty BEFORE the eval for the same reason as adjustUserBalance:
    // nothing after the balance/XP mutation may be able to throw.
    await redis.sadd(DIRTY_BALANCES_SET_KEY, userId);

    const script = `
      local xp = redis.call('hincrby', KEYS[1], 'xp', tonumber(ARGV[1]))
      local level = tonumber(redis.call('hget', KEYS[1], 'level') or '1')
      if level < 1 then level = 1 end
      local maxLevel = tonumber(ARGV[2])
      local rewards = {}
      local count = 0
      while level < maxLevel do
        local need = math.floor(100 * math.pow(level, 1.5) + 0.5)
        if xp < need then break end
        xp = xp - need
        level = level + 1
        count = count + 1
        rewards[count] = 50 + 50 * level
      end
      redis.call('hset', KEYS[1], 'xp', tostring(xp), 'level', tostring(level))
      for i = 1, count do
        redis.call('hincrby', KEYS[1], 'balance', rewards[i])
      end
      redis.call('expire', KEYS[1], ${PROFILE_TTL_SECONDS})
      return {xp, level, cjson.encode(rewards)}
    `;

    let xp: number;
    let level: number;
    let rewards: number[];
    try {
      const res = (await redis.eval(script, 1, key, String(Math.floor(amount)), String(MAX_LEVEL))) as [
        string,
        string,
        string,
      ];
      xp = Math.floor(Number(res[0]));
      level = Math.max(1, Math.floor(Number(res[1])));
      rewards = JSON.parse(res[2]) as number[];
    } catch (err) {
      console.warn('[UserCache] addXp eval error:', err);
      throw err;
    }

    if (rewards.length > 0) {
      const now = new Date();
      try {
        await db.insert(transaction).values(
          rewards.map((reward, i) => ({
            id: crypto.randomUUID(),
            userId,
            type: 'bonus',
            amount: reward,
            status: 'success',
            method: 'Награда за уровень',
            details: `Уровень ${level - rewards.length + 1 + i}`,
            createdAt: new Date(now.getTime() + i),
          })),
        );
      } catch (err) {
        console.error('[UserCache] level reward transaction insert failed:', err);
      }
    }

    return {
      level,
      xp,
      leveledUp: rewards.length > 0,
      levelRewards: rewards,
    };
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

      // Read the cached values and remove the id from the dirty set in a single
      // atomic script. Without it, an adjustUserBalance landing between the
      // hget and the srem would be overwritten by the stale DB write and the
      // user would never be re-synced (money lost after the Redis TTL). Any
      // adjust that runs after this script re-adds the id via sadd, so the next
      // tick still picks it up.
      const readScript = `
        local b = redis.call('hget', KEYS[1], 'balance')
        if not b then
          redis.call('srem', KEYS[2], ARGV[1])
          return nil
        end
        local xp = redis.call('hget', KEYS[1], 'xp')
        local level = redis.call('hget', KEYS[1], 'level')
        redis.call('srem', KEYS[2], ARGV[1])
        return { b, xp or '', level or '' }
      `;

      for (const userId of dirtyUserIds) {
        const profileKey = `user:profile:${userId}`;
        const vals = (await redis.eval(readScript, 2, profileKey, DIRTY_BALANCES_SET_KEY, userId)) as
          [string, string, string] | null;

        if (!vals) continue;

        const newBal = Math.floor(Number(vals[0]));
        const cachedXp = vals[1] !== '' ? vals[1] : null;
        const cachedLevel = vals[2] !== '' ? vals[2] : null;
        try {
          await db
            .update(userTable)
            .set({
              balance: newBal,
              xp: cachedXp !== null ? Math.floor(Number(cachedXp)) : undefined,
              level: cachedLevel !== null ? Math.max(1, Math.floor(Number(cachedLevel))) : undefined,
              updatedAt: new Date(),
            })
            .where(eq(userTable.id, userId));
          syncedCount++;
        } catch (err) {
          // Re-queue so the next tick retries instead of silently dropping the
          // balance update (the id was already removed by the script above).
          console.error('[UserCache] balance sync failed, re-queuing:', userId, err);
          await redis.sadd(DIRTY_BALANCES_SET_KEY, userId).catch(() => {});
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
