import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { redis } from "../lib/redis";
import { db } from "../db";
import { auth } from "../lib/auth";
import { userCache } from "../lib/userCache";
import { achievementEngine } from "../lib/achievementEngine";
import { xpToNext, levelReward } from "../lib/levels";
import { ACHIEVEMENTS } from "../lib/achievements";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const bonuses = new Hono<{ Variables: Variables }>();

const WELCOME_BONUS = 1000;
const INSTALL_BONUS = 300;

const DAILY_REWARDS = [100, 150, 200, 300, 500, 750, 1000];
const DAILY_KEY = (userId: string) => `bonus:daily:${userId}`;

function fail(c: Context, message: string, status: ContentfulStatusCode, code?: string) {
  return c.json(code ? { message, code } : { message }, status);
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function nextDailyAmount(prevDate: string | undefined, prevStreak: number): number {
  if (prevDate === todayDate()) return 0;
  const nextStreak = prevDate === yesterdayDate() ? prevStreak + 1 : 1;
  return DAILY_REWARDS[(nextStreak - 1) % DAILY_REWARDS.length];
}

async function getDailyState(userId: string): Promise<{
  streak: number;
  claimedToday: boolean;
  amount: number;
  cycle: number[];
}> {
  const data = await redis.hgetall(DAILY_KEY(userId));
  const prevDate = data?.date as string | undefined;
  const prevStreak = Math.max(0, Math.floor(Number(data?.streak) || 0));
  const claimedToday = prevDate === todayDate();
  const streak = claimedToday || prevDate === yesterdayDate() ? prevStreak : 0;
  return {
    streak,
    claimedToday,
    amount: nextDailyAmount(prevDate, prevStreak),
    cycle: DAILY_REWARDS,
  };
}

bonuses.get("/status", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const profile = await userCache.getUserProfile(u.id);
  const level = profile?.level ?? 1;
  const xp = profile?.xp ?? 0;
  const need = xpToNext(level);

  const [daily, welcomeClaimed, installClaimed, achievements, summary] = await Promise.all([
    getDailyState(u.id),
    achievementEngine.isBonusClaimed(u.id, "welcome"),
    achievementEngine.isBonusClaimed(u.id, "install"),
    achievementEngine.getAchievements(u.id),
    achievementEngine.getSummary(u.id),
  ]);

  const preview = achievements
    .filter((a) => a.status === "completed")
    .sort((a, b) => b.reward - a.reward)
    .slice(0, 3)
    .map((a) => ({
      id: a.id,
      title: a.title,
      emoji: a.emoji,
      reward: a.reward,
      progress: a.progress,
      target: a.target,
    }));

  return c.json({
    level: {
      level,
      xp,
      xpToNext: need,
      progress: need > 0 ? Math.min(100, Math.floor((xp / need) * 100)) : 100,
      nextReward: levelReward(level + 1),
    },
    daily,
    welcome: { amount: WELCOME_BONUS, claimed: welcomeClaimed },
    install: { amount: INSTALL_BONUS, claimed: installClaimed },
    summary,
    preview,
  });
});

bonuses.post("/daily/claim", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const data = await redis.hgetall(DAILY_KEY(u.id));
  const prevDate = data?.date as string | undefined;
  const prevStreak = Math.max(0, Math.floor(Number(data?.streak) || 0));

  if (prevDate === todayDate()) {
    return fail(c, "Ежедневный бонус уже получен сегодня", 400, "already_claimed");
  }

  const streak = prevDate === yesterdayDate() ? prevStreak + 1 : 1;
  const amount = DAILY_REWARDS[(streak - 1) % DAILY_REWARDS.length];

  const balance = await achievementEngine.grantMoneyBonus(
    u.id,
    amount,
    "Ежедневный бонус",
    `День ${streak}`,
  );

  await redis.hset(DAILY_KEY(u.id), { date: todayDate(), streak: String(streak) });
  await redis.expire(DAILY_KEY(u.id), 3 * 86400);

  return c.json({
    balance,
    reward: amount,
    streak,
    claimedToday: true,
  });
});

bonuses.post("/welcome/claim", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  if (await achievementEngine.isBonusClaimed(u.id, "welcome")) {
    return fail(c, "Приветственный бонус уже получен", 400, "already_claimed");
  }

  const balance = await achievementEngine.grantMoneyBonus(
    u.id,
    WELCOME_BONUS,
    "Бонус за регистрацию",
    `${WELCOME_BONUS.toLocaleString("ru-RU")} ₽`,
  );
  await achievementEngine.markBonusClaimed(u.id, "welcome");

  return c.json({ balance, reward: WELCOME_BONUS, claimed: true });
});

bonuses.post("/install/claim", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  if (await achievementEngine.isBonusClaimed(u.id, "install")) {
    return fail(c, "Бонус за установку уже получен", 400, "already_claimed");
  }

  const balance = await achievementEngine.grantMoneyBonus(
    u.id,
    INSTALL_BONUS,
    "Установка приложения",
    "+300 ₽ за установку",
  );
  await achievementEngine.markBonusClaimed(u.id, "install");

  return c.json({ balance, reward: INSTALL_BONUS, claimed: true });
});

bonuses.get("/achievements", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const [achievements, summary] = await Promise.all([
    achievementEngine.getAchievements(u.id),
    achievementEngine.getSummary(u.id),
  ]);

  return c.json({
    total: ACHIEVEMENTS.length,
    achievements,
    summary,
  });
});

bonuses.post("/achievements/:id/claim", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const id = c.req.param("id");
  try {
    const { reward, balance } = await achievementEngine.claimAchievement(u.id, id);
    return c.json({ balance, reward, claimed: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "achievement_not_found") return fail(c, "Достижение не найдено", 404);
    if (msg === "achievement_not_completed") return fail(c, "Достижение ещё не выполнено", 400, "not_completed");
    if (msg === "already_claimed") return fail(c, "Награда уже получена", 400, "already_claimed");
    throw e;
  }
});

bonuses.get("/challenges", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const challenges = await achievementEngine.getChallenges(u.id);
  return c.json({
    date: todayDate(),
    challenges,
  });
});

bonuses.post("/challenges/:id/claim", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const id = c.req.param("id");
  try {
    const { reward, balance } = await achievementEngine.claimChallenge(u.id, id);
    return c.json({ balance, reward, claimed: true });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "challenge_not_found") return fail(c, "Челлендж не найден", 404);
    if (msg === "challenge_not_completed") return fail(c, "Челлендж ещё не выполнен", 400, "not_completed");
    if (msg === "already_claimed") return fail(c, "Награда уже получена", 400, "already_claimed");
    throw e;
  }
});

export default bonuses;
