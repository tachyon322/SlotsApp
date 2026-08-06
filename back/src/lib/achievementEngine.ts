import { redis } from './redis';
import { db } from '../db';
import {
  slotsRound,
  minesRound,
  crashRound,
  casesRound,
  blockblastRound,
  minedropRound,
  wheelSpin,
  promoActivation,
  achievementClaim,
  challengeClaim,
  transaction,
} from '../db/schema';
import { eq } from 'drizzle-orm';
import { userCache } from './userCache';
import { xpForBonusMoney } from './levels';
import {
  ACHIEVEMENTS,
  CHALLENGES,
  ACHIEVEMENT_BY_ID,
  CHALLENGE_BY_ID,
  GAME_IDS,
  type AchievementDef,
  type AchievementMetric,
  type ChallengeDef,
  type GameId,
} from './achievements';

const PROGRESS_KEY = (userId: string) => `ach:progress:${userId}`;
const STREAK_KEY = (userId: string) => `ach:streak:${userId}`;
const GAMES_KEY = (userId: string) => `ach:games:${userId}`;
const CLAIMED_KEY = (userId: string) => `ach:claimed:${userId}`;
const CHALLENGE_KEY = (userId: string, date: string) => `challenge:${date}:${userId}`;
const CHALLENGE_CLAIMED_KEY = (userId: string, date: string) => `challenge:claimed:${date}:${userId}`;

const COUNTER_TTL = 30 * 86400;

export function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export type AchievementStatus = 'claimed' | 'completed' | 'in_progress';

export interface AchievementView extends AchievementDef {
  progress: number;
  percent: number;
  status: AchievementStatus;
}

export interface ChallengeView extends ChallengeDef {
  progress: number;
  percent: number;
  status: AchievementStatus;
}

export interface BonusSummary {
  total: number;
  obtained: number;
  claimable: number;
  inProgress: number;
  earnedMoney: number;
}

function resolveProgress(
  metric: AchievementMetric,
  target: number,
  game: GameId | undefined,
  counters: Record<string, number>,
  streak: Record<string, number>,
  gamesCount: number,
): number {
  switch (metric) {
    case 'rounds':
      return counters.rounds ?? 0;
    case 'roundsGame':
      return counters[`rounds:${game}`] ?? 0;
    case 'wins':
      return counters.wins ?? 0;
    case 'winsGame':
      return counters[`wins:${game}`] ?? 0;
    case 'distinctGames':
      return gamesCount;
    case 'bets':
      return counters.bets ?? 0;
    case 'winStreak':
      return streak.win ?? 0;
    case 'winStreakGame':
      return streak[`win:${game}`] ?? 0;
    case 'winAfterLosses':
      return counters.winAfterLosses ?? 0;
    case 'highMultStreak':
      return counters.highMultStreak ?? 0;
    case 'bigMult':
      return Math.floor(counters.bigMult ?? 0);
    case 'wheel':
      return counters.wheel ?? 0;
    case 'promos':
      return counters.promos ?? 0;
    default:
      return 0;
  }
}

function percentOf(progress: number, target: number): number {
  if (target <= 0) return 100;
  return Math.min(100, Math.round((progress / target) * 100));
}

function toView(
  def: AchievementDef | ChallengeDef,
  counters: Record<string, number>,
  streak: Record<string, number>,
  gamesCount: number,
  claimedIds: Set<string>,
): AchievementView {
  const progress = resolveProgress(def.metric, def.target, def.game, counters, streak, gamesCount);
  const completed = progress >= def.target;
  const status: AchievementStatus = claimedIds.has(def.id)
    ? 'claimed'
    : completed
      ? 'completed'
      : 'in_progress';
  return {
    ...def,
    progress,
    percent: percentOf(progress, def.target),
    status,
  };
}

class AchievementEngineService {
  /**
   * Record a finalized game round. Updates Redis counters/streaks/games and
   * today's challenge counters. Best-effort, never throws.
   */
  async recordRound(userId: string, game: GameId, roundData: any): Promise<void> {
    try {
      const isWin = roundData?.outcome === 'win';
      const bet = Math.floor(Number(roundData?.bet) || 0);
      const mult = Number(roundData?.multiplier) || 0;

      const pipe = redis.pipeline();

      // Progress counters
      pipe.hincrby(PROGRESS_KEY(userId), 'rounds', 1);
      pipe.hincrby(PROGRESS_KEY(userId), `rounds:${game}`, 1);
      if (bet > 0) pipe.hincrby(PROGRESS_KEY(userId), 'bets', bet);
      if (isWin) {
        pipe.hincrby(PROGRESS_KEY(userId), 'wins', 1);
        pipe.hincrby(PROGRESS_KEY(userId), `wins:${game}`, 1);
      }
      pipe.expire(PROGRESS_KEY(userId), COUNTER_TTL);

      // Big multiplier (max seen)
      if (isWin && mult >= 2) {
        const prev = await redis.hget(PROGRESS_KEY(userId), 'bigMult');
        const prevNum = prev ? Number(prev) : 0;
        if (mult > prevNum) {
          pipe.hset(PROGRESS_KEY(userId), 'bigMult', String(Math.floor(mult)));
        }
      }

      // Streaks
      if (isWin) {
        const priorLoss = await redis.hget(STREAK_KEY(userId), 'loss');
        const priorLossNum = priorLoss ? Number(priorLoss) : 0;
        if (priorLossNum >= 5) {
          pipe.hincrby(PROGRESS_KEY(userId), 'winAfterLosses', 1);
        }
        pipe.hincrby(STREAK_KEY(userId), 'win', 1);
        pipe.hset(STREAK_KEY(userId), 'loss', '0');
        pipe.hincrby(STREAK_KEY(userId), `win:${game}`, 1);
        if (mult >= 2) {
          pipe.hincrby(PROGRESS_KEY(userId), 'highMultStreak', 1);
        } else {
          pipe.hset(PROGRESS_KEY(userId), 'highMultStreak', '0');
        }
      } else {
        pipe.hincrby(STREAK_KEY(userId), 'loss', 1);
        pipe.hset(STREAK_KEY(userId), 'win', '0');
        pipe.hset(STREAK_KEY(userId), `win:${game}`, '0');
        pipe.hset(PROGRESS_KEY(userId), 'highMultStreak', '0');
      }
      pipe.expire(STREAK_KEY(userId), COUNTER_TTL);

      // Distinct games
      pipe.sadd(GAMES_KEY(userId), game);
      pipe.expire(GAMES_KEY(userId), COUNTER_TTL);

      // Today's challenges
      const date = todayDate();
      pipe.hincrby(CHALLENGE_KEY(userId, date), 'rounds', 1);
      pipe.hincrby(CHALLENGE_KEY(userId, date), `rounds:${game}`, 1);
      if (bet > 0) pipe.hincrby(CHALLENGE_KEY(userId, date), 'bets', bet);
      if (isWin) pipe.hincrby(CHALLENGE_KEY(userId, date), 'wins', 1);
      pipe.expire(CHALLENGE_KEY(userId, date), 3 * 86400);

      await pipe.exec();
    } catch (err) {
      console.warn('[Achievements] recordRound error:', err);
    }
  }

  /**
   * Record non-game events: wheel spin / promo activation.
   */
  async recordEvent(userId: string, type: 'wheel' | 'promo'): Promise<void> {
    try {
      const pipe = redis.pipeline();
      if (type === 'wheel') {
        pipe.hincrby(PROGRESS_KEY(userId), 'wheel', 1);
        pipe.expire(PROGRESS_KEY(userId), COUNTER_TTL);
        pipe.hincrby(CHALLENGE_KEY(userId, todayDate()), 'wheel', 1);
        pipe.expire(CHALLENGE_KEY(userId, todayDate()), 3 * 86400);
      } else {
        pipe.hincrby(PROGRESS_KEY(userId), 'promos', 1);
        pipe.expire(PROGRESS_KEY(userId), COUNTER_TTL);
      }
      await pipe.exec();
    } catch (err) {
      console.warn('[Achievements] recordEvent error:', err);
    }
  }

  /**
   * Lazy hydrate Redis progress/claimed state from PostgreSQL on cache miss.
   */
  private async ensureHydrated(userId: string): Promise<void> {
    const exists = await redis.exists(PROGRESS_KEY(userId));
    if (!exists) {
      try {
        const tables: Array<{ game: GameId; table: any }> = [
          { game: 'slots', table: slotsRound },
          { game: 'mines', table: minesRound },
          { game: 'crash', table: crashRound },
          { game: 'cases', table: casesRound },
          { game: 'blockblast', table: blockblastRound },
          { game: 'minedrop', table: minedropRound },
        ];

        const pipe = redis.pipeline();
        let totalRounds = 0;
        let totalWins = 0;
        let totalBets = 0;
        let maxBigMult = 0;
        let gamesCount = 0;

        for (const { game, table } of tables) {
          const rows = await db
            .select()
            .from(table)
            .where(eq(table.userId, userId));
          const cnt = rows.length;
          let wins = 0;
          let bets = 0;
          let maxM = 0;
          for (const r of rows) {
            if (r.outcome === 'win') {
              wins++;
              if (Number(r.multiplier) > maxM) maxM = Number(r.multiplier);
            }
            bets += Math.floor(Number(r.bet) || 0);
          }
          if (cnt > 0) {
            totalRounds += cnt;
            totalWins += wins;
            totalBets += bets;
            gamesCount++;
            pipe.hset(PROGRESS_KEY(userId), {
              [`rounds:${game}`]: String(cnt),
              [`wins:${game}`]: String(wins),
            });
            pipe.sadd(GAMES_KEY(userId), game);
          }
          if (maxM > maxBigMult) maxBigMult = maxM;
        }

        pipe.hset(PROGRESS_KEY(userId), {
          rounds: String(totalRounds),
          wins: String(totalWins),
          bets: String(totalBets),
          bigMult: String(Math.floor(maxBigMult)),
          wheel: '0',
          promos: '0',
          winAfterLosses: '0',
          highMultStreak: '0',
        });
        pipe.expire(PROGRESS_KEY(userId), COUNTER_TTL);
        pipe.expire(GAMES_KEY(userId), COUNTER_TTL);

        const wheelRows = await db
          .select({ id: wheelSpin.id })
          .from(wheelSpin)
          .where(eq(wheelSpin.userId, userId));
        if (wheelRows.length > 0) {
          pipe.hset(PROGRESS_KEY(userId), 'wheel', String(wheelRows.length));
        }

        const promoRows = await db
          .select({ id: promoActivation.id })
          .from(promoActivation)
          .where(eq(promoActivation.userId, userId));
        if (promoRows.length > 0) {
          pipe.hset(PROGRESS_KEY(userId), 'promos', String(promoRows.length));
        }

        await pipe.exec();
      } catch (err) {
        console.warn('[Achievements] hydration error:', err);
      }
    }

    const claimedExists = await redis.exists(CLAIMED_KEY(userId));
    if (!claimedExists) {
      try {
        const rows = await db
          .select({ achievementId: achievementClaim.achievementId })
          .from(achievementClaim)
          .where(eq(achievementClaim.userId, userId));
        if (rows.length > 0) {
          await redis.sadd(CLAIMED_KEY(userId), ...rows.map((r) => r.achievementId));
        } else {
          await redis.sadd(CLAIMED_KEY(userId), '__empty__');
          await redis.expire(CLAIMED_KEY(userId), 3600);
        }
      } catch (err) {
        console.warn('[Achievements] claimed hydration error:', err);
      }
    }
  }

  private async getCounterSnapshot(userId: string): Promise<{
    counters: Record<string, number>;
    streak: Record<string, number>;
    gamesCount: number;
    claimed: Set<string>;
  }> {
    await this.ensureHydrated(userId);
    const [progressObj, streakObj, games, claimedArr] = await Promise.all([
      redis.hgetall(PROGRESS_KEY(userId)),
      redis.hgetall(STREAK_KEY(userId)),
      redis.scard(GAMES_KEY(userId)),
      redis.smembers(CLAIMED_KEY(userId)),
    ]);

    const counters: Record<string, number> = {};
    for (const [k, v] of Object.entries(progressObj)) {
      counters[k] = Number(v) || 0;
    }
    const streak: Record<string, number> = {};
    for (const [k, v] of Object.entries(streakObj)) {
      streak[k] = Number(v) || 0;
    }
    const claimed = new Set(claimedArr.filter((id) => id && id !== '__empty__'));

    return { counters, streak, gamesCount: Number(games) || 0, claimed };
  }

  async getAchievements(userId: string): Promise<AchievementView[]> {
    const snap = await this.getCounterSnapshot(userId);
    return ACHIEVEMENTS.map((a) => toView(a, snap.counters, snap.streak, snap.gamesCount, snap.claimed));
  }

  async getChallenges(userId: string): Promise<ChallengeView[]> {
    const snap = await this.getCounterSnapshot(userId);
    const date = todayDate();
    const today = await redis.hgetall(CHALLENGE_KEY(userId, date));
    const claimedArr = await redis.smembers(CHALLENGE_CLAIMED_KEY(userId, date));
    const claimed = new Set(claimedArr.filter((id) => id && id !== '__empty__'));

    const counters: Record<string, number> = {};
    for (const [k, v] of Object.entries(today)) {
      counters[k] = Number(v) || 0;
    }

    return CHALLENGES.map((c) => toView(c, counters, {}, 0, claimed) as ChallengeView);
  }

  async getSummary(userId: string): Promise<BonusSummary> {
    const views = await this.getAchievements(userId);
    let earnedMoney = 0;
    let obtained = 0;
    let claimable = 0;
    let inProgress = 0;
    for (const v of views) {
      if (v.status === 'claimed') {
        obtained++;
        earnedMoney += v.reward;
      } else if (v.status === 'completed') {
        claimable++;
      } else {
        inProgress++;
      }
    }
    return {
      total: views.length,
      obtained,
      claimable,
      inProgress,
      earnedMoney,
    };
  }

  /**
   * Claim a completed achievement: money + XP through Redis, persist to DB.
   */
  async claimAchievement(userId: string, id: string): Promise<{
    reward: number;
    balance: number;
  }> {
    const def = ACHIEVEMENT_BY_ID.get(id);
    if (!def) throw new Error('achievement_not_found');

    const snap = await this.getCounterSnapshot(userId);
    const progress = resolveProgress(def.metric, def.target, def.game, snap.counters, snap.streak, snap.gamesCount);
    if (progress < def.target) throw new Error('achievement_not_completed');
    if (snap.claimed.has(id)) throw new Error('already_claimed');

    const balance = await this.grantMoneyBonus(userId, def.reward, 'Достижение', def.title);
    await redis.sadd(CLAIMED_KEY(userId), id);
    await db.insert(achievementClaim).values({
      id: crypto.randomUUID(),
      userId,
      achievementId: id,
      amount: def.reward,
      claimedAt: new Date(),
    });
    return { reward: def.reward, balance };
  }

  /**
   * Claim a completed daily challenge.
   */
  async claimChallenge(userId: string, id: string): Promise<{
    reward: number;
    balance: number;
  }> {
    const def = CHALLENGE_BY_ID.get(id);
    if (!def) throw new Error('challenge_not_found');

    const date = todayDate();
    const today = await redis.hgetall(CHALLENGE_KEY(userId, date));
    const counters: Record<string, number> = {};
    for (const [k, v] of Object.entries(today)) {
      counters[k] = Number(v) || 0;
    }
    const progress = resolveProgress(def.metric, def.target, def.game, counters, {}, 0);
    if (progress < def.target) throw new Error('challenge_not_completed');

    const claimedArr = await redis.smembers(CHALLENGE_CLAIMED_KEY(userId, date));
    if (claimedArr.includes(id)) throw new Error('already_claimed');

    const balance = await this.grantMoneyBonus(userId, def.reward, 'Челлендж', def.title);
    await redis.sadd(CHALLENGE_CLAIMED_KEY(userId, date), id);
    await db.insert(challengeClaim).values({
      id: crypto.randomUUID(),
      userId,
      challengeId: id,
      date,
      amount: def.reward,
      claimedAt: new Date(),
    });
    return { reward: def.reward, balance };
  }

  /**
   * Credit money + XP for a bonus, log a transaction. Money/XP go through Redis.
   */
  async grantMoneyBonus(
    userId: string,
    amount: number,
    method: string,
    details: string,
  ): Promise<number> {
    const balance = await userCache.adjustUserBalance(userId, amount);
    await userCache.addXp(userId, xpForBonusMoney(amount));
    await db.insert(transaction).values({
      id: crypto.randomUUID(),
      userId,
      type: 'bonus',
      amount,
      status: 'success',
      method,
      details,
      createdAt: new Date(),
    });
    return balance;
  }

  /**
   * Check whether a one-time bonus (welcome/install) was already claimed.
   */
  async isBonusClaimed(userId: string, type: string): Promise<boolean> {
    const key = `bonus:claim:${userId}`;
    return (await redis.sismember(key, type)) === 1;
  }

  async markBonusClaimed(userId: string, type: string): Promise<void> {
    const key = `bonus:claim:${userId}`;
    await redis.sadd(key, type);
    await redis.expire(key, COUNTER_TTL);
  }
}

export const achievementEngine = new AchievementEngineService();

export { GAME_IDS };
