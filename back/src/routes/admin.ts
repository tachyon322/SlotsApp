import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, asc, count, desc, eq, gte, inArray, ne, sql, sum, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  user as userTable,
  transaction,
  supportConversation,
  supportMessage,
  minesRound,
  crashRound,
  slotsRound,
  casesRound,
  blockblastRound,
  minedropRound,
} from "../db/schema";
import { userCache } from "../lib/userCache";
import { getWelcomeBonus, setWelcomeBonus, getMinDeposit, setMinDeposit } from "../lib/config";

const admin = new Hono();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const MAX_PAGE_SIZE = 200;

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

function parsePagination(c: Context): { limit: number; offset: number } {
  const rawLimit = Number(c.req.query("limit"));
  const rawOffset = Number(c.req.query("offset"));
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), MAX_PAGE_SIZE) : 50;
  const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? Math.floor(rawOffset) : 0;
  return { limit, offset };
}

function startOfToday(): Date {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

admin.use("*", async (c, next) => {
  const header = c.req.header("authorization") || "";
  if (!ADMIN_PASSWORD || header !== `Bearer ${ADMIN_PASSWORD}`) {
    return fail(c, "Unauthorized", 401);
  }
  return next();
});

admin.get("/stats", async (c) => {
  const today = startOfToday();

  const [totalUsersRow, todayUsersRow, totalDepositsRow, todayDepositsRow, supportRow] =
    await Promise.all([
      db.select({ value: count() }).from(userTable),
      db
        .select({ value: count() })
        .from(userTable)
        .where(gte(userTable.createdAt, today)),
      db
        .select({ value: count(), total: sum(transaction.amount) })
        .from(transaction)
        .where(and(eq(transaction.type, "deposit"), eq(transaction.status, "success"))),
      db
        .select({ value: count(), total: sum(transaction.amount) })
        .from(transaction)
        .where(
          and(
            eq(transaction.type, "deposit"),
            eq(transaction.status, "success"),
            gte(transaction.createdAt, today),
          ),
        ),
      db.select({ value: count() }).from(supportConversation),
    ]);

  return c.json({
    users: {
      total: Number(totalUsersRow[0]?.value ?? 0),
      today: Number(todayUsersRow[0]?.value ?? 0),
    },
    deposits: {
      total: Number(totalDepositsRow[0]?.value ?? 0),
      sum: Number(totalDepositsRow[0]?.total ?? 0),
      today: Number(todayDepositsRow[0]?.value ?? 0),
      todaySum: Number(todayDepositsRow[0]?.total ?? 0),
    },
    support: {
      conversations: Number(supportRow[0]?.value ?? 0),
    },
  });
});

type AnalyticsRange = "all" | "today" | "7d" | "30d";

function rangeCutoff(c: Context): Date | null {
  const range = (c.req.query("range") || "all") as AnalyticsRange;
  const now = new Date();
  switch (range) {
    case "today": {
      const d = new Date(now);
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case "7d":
      return new Date(now.getTime() - 7 * 86_400_000);
    case "30d":
      return new Date(now.getTime() - 30 * 86_400_000);
    default:
      return null;
  }
}

// Все шесть таблиц раундов имеют одинаковый набор общих колонок, поэтому P&L
// считается одним UNION ALL без лишних соединений и повторных сканирований.
function gameUnionQuery(cutoff: Date | null): SQL {
  const branch = (table: any, kind: string) => {
    const base = sql`SELECT '${sql.raw(kind)}'::text AS game, user_id, bet, multiplier, payout, outcome, created_at FROM ${table}`;
    return cutoff ? sql`${base} WHERE created_at >= ${cutoff}` : base;
  };
  return sql`
    ${branch(minesRound, "mines")}
    UNION ALL ${branch(crashRound, "crash")}
    UNION ALL ${branch(slotsRound, "slots")}
    UNION ALL ${branch(casesRound, "cases")}
    UNION ALL ${branch(blockblastRound, "blockblast")}
    UNION ALL ${branch(minedropRound, "minedrop")}
  `;
}

type AnalyticsGameAggRow = {
  game: string;
  rounds: number;
  bet: number;
  payout: number;
  profit: number;
  rtp: number | null;
  winRate: number | null;
}

type AnalyticsUserRow = {
  name: string;
  email: string;
  profit: number;
  rounds: number;
}

type AnalyticsPayoutRow = {
  name: string;
  game: string;
  bet: number;
  multiplier: number;
  payout: number;
  createdAt: string;
}

type AnalyticsFinanceRow = {
  depositsCount: number;
  depositsSum: number;
  withdrawalsCount: number;
  withdrawalsSum: number;
  bonusesCount: number;
  bonusesSum: number;
}

admin.get("/analytics", async (c) => {
  const cutoff = rangeCutoff(c);
  const union = gameUnionQuery(cutoff);
  const txWhere = cutoff ? sql`created_at >= ${cutoff}` : sql`true`;

  const [games, totals, winners, losers, payouts, finance] = await Promise.all([
    db.execute<AnalyticsGameAggRow>(sql`
      SELECT game,
        count(*)::int AS rounds,
        sum(bet)::float8 AS bet,
        sum(payout)::float8 AS payout,
        (sum(payout) - sum(bet))::float8 AS profit,
        round(sum(payout) * 100.0 / nullif(sum(bet), 0), 1)::float8 AS rtp,
        round(count(*) FILTER (WHERE payout > bet) * 100.0 / nullif(count(*), 0), 1)::float8 AS "winRate"
      FROM (${union}) g
      GROUP BY game
      ORDER BY game
    `),
    db.execute<AnalyticsGameAggRow>(sql`
      SELECT
        count(*)::int AS rounds,
        sum(bet)::float8 AS bet,
        sum(payout)::float8 AS payout,
        (sum(payout) - sum(bet))::float8 AS profit,
        round(sum(payout) * 100.0 / nullif(sum(bet), 0), 1)::float8 AS rtp,
        round(count(*) FILTER (WHERE payout > bet) * 100.0 / nullif(count(*), 0), 1)::float8 AS "winRate"
      FROM (${union}) g
    `),
    db.execute<AnalyticsUserRow>(sql`
      SELECT u.name, u.email,
        (sum(r.payout) - sum(r.bet))::float8 AS profit,
        count(*)::int AS rounds
      FROM (${union}) r
      JOIN ${userTable} u ON u.id = r.user_id
      GROUP BY u.id, u.name, u.email
      ORDER BY profit DESC
      LIMIT 10
    `),
    db.execute<AnalyticsUserRow>(sql`
      SELECT u.name, u.email,
        (sum(r.payout) - sum(r.bet))::float8 AS profit,
        count(*)::int AS rounds
      FROM (${union}) r
      JOIN ${userTable} u ON u.id = r.user_id
      GROUP BY u.id, u.name, u.email
      ORDER BY profit ASC
      LIMIT 10
    `),
    db.execute<AnalyticsPayoutRow>(sql`
      SELECT u.name, r.game,
        r.bet::float8 AS bet,
        r.multiplier,
        r.payout::float8 AS payout,
        to_char(r.created_at, 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS "createdAt"
      FROM (${union}) r
      JOIN ${userTable} u ON u.id = r.user_id
      ORDER BY r.payout DESC, r.created_at DESC
      LIMIT 10
    `),
    db.execute<AnalyticsFinanceRow>(sql`
      SELECT
        count(*) FILTER (WHERE type = 'deposit' AND status = 'success')::int AS "depositsCount",
        sum(amount) FILTER (WHERE type = 'deposit' AND status = 'success')::float8 AS "depositsSum",
        count(*) FILTER (WHERE type = 'withdrawal' AND status = 'success')::int AS "withdrawalsCount",
        sum(amount) FILTER (WHERE type = 'withdrawal' AND status = 'success')::float8 AS "withdrawalsSum",
        count(*) FILTER (WHERE type = 'bonus' AND status = 'success')::int AS "bonusesCount",
        sum(amount) FILTER (WHERE type = 'bonus' AND status = 'success')::float8 AS "bonusesSum"
      FROM ${transaction}
      WHERE ${txWhere}
    `),
  ]);

  return c.json({
    range: c.req.query("range") || "all",
    games: games.rows,
    totals: totals.rows[0] ?? null,
    topWinners: winners.rows,
    topLosers: losers.rows,
    biggestPayouts: payouts.rows,
    finances: finance.rows[0] ?? null,
  });
});

admin.get("/users", async (c) => {
  const { limit, offset } = parsePagination(c);

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(userTable),
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        balance: userTable.balance,
        level: userTable.level,
        xp: userTable.xp,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .orderBy(desc(userTable.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  return c.json({
    total: Number(totalRow[0]?.value ?? 0),
    items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  });
});

admin.get("/deposits", async (c) => {
  const { limit, offset } = parsePagination(c);

  const [totalRow, rows] = await Promise.all([
    db
      .select({ value: count(), total: sum(transaction.amount) })
      .from(transaction)
      .where(and(eq(transaction.type, "deposit"), eq(transaction.status, "success"))),
    db
      .select({
        id: transaction.id,
        userId: transaction.userId,
        name: userTable.name,
        email: userTable.email,
        amount: transaction.amount,
        method: transaction.method,
        details: transaction.details,
        createdAt: transaction.createdAt,
      })
      .from(transaction)
      .innerJoin(userTable, eq(transaction.userId, userTable.id))
      .where(and(eq(transaction.type, "deposit"), eq(transaction.status, "success")))
      .orderBy(desc(transaction.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  return c.json({
    total: Number(totalRow[0]?.value ?? 0),
    sum: Number(totalRow[0]?.total ?? 0),
    items: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
  });
});

admin.post("/users/:id", async (c) => {
  const userId = c.req.param("id");
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: unknown;
    email?: unknown;
    balance?: unknown;
    level?: unknown;
    xp?: unknown;
  };

  const fields: {
    name?: string;
    email?: string;
    balance?: number;
    level?: number;
    xp?: number;
  } = {};

  if (body.balance !== undefined) {
    const value = Math.floor(Number(body.balance));
    if (!Number.isFinite(value) || value < 0) {
      return fail(c, "Некорректный баланс", 400);
    }
    fields.balance = value;
  }

  if (body.level !== undefined) {
    const value = Math.floor(Number(body.level));
    if (!Number.isFinite(value) || value < 1) {
      return fail(c, "Некорректный уровень", 400);
    }
    fields.level = value;
  }

  if (body.xp !== undefined) {
    const value = Math.floor(Number(body.xp));
    if (!Number.isFinite(value) || value < 0) {
      return fail(c, "Некорректный XP", 400);
    }
    fields.xp = value;
  }

  if (body.name !== undefined) {
    const value = String(body.name).trim();
    if (!value) {
      return fail(c, "Имя не может быть пустым", 400);
    }
    fields.name = value;
  }

  if (body.email !== undefined) {
    const value = String(body.email).trim().toLowerCase();
    if (!value) {
      return fail(c, "Email не может быть пустым", 400);
    }
    const existing = await db
      .select({ id: userTable.id })
      .from(userTable)
      .where(and(eq(userTable.email, value), ne(userTable.id, userId)))
      .limit(1);
    if (existing.length > 0) {
      return fail(c, "Этот email уже используется другим пользователем", 409);
    }
    fields.email = value;
  }

  if (Object.keys(fields).length === 0) {
    return fail(c, "Нет полей для обновления", 400);
  }

  try {
    const profile = await userCache.setAdminFields(userId, fields);
    return c.json({ user: profile });
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }
});

admin.get("/support", async (c) => {
  const { limit, offset } = parsePagination(c);

  const [totalRow, rows] = await Promise.all([
    db.select({ value: count() }).from(supportConversation),
    db
      .select({
        id: supportConversation.id,
        userId: supportConversation.userId,
        name: userTable.name,
        email: userTable.email,
        createdAt: supportConversation.createdAt,
        updatedAt: supportConversation.updatedAt,
      })
      .from(supportConversation)
      .innerJoin(userTable, eq(supportConversation.userId, userTable.id))
      .orderBy(desc(supportConversation.updatedAt))
      .limit(limit)
      .offset(offset),
  ]);

  const ids = rows.map((r) => r.id);
  const messageRows =
    ids.length > 0
      ? await db
          .select({
            conversationId: supportMessage.conversationId,
            role: supportMessage.role,
            content: supportMessage.content,
            createdAt: supportMessage.createdAt,
          })
          .from(supportMessage)
          .where(inArray(supportMessage.conversationId, ids))
      : [];

  const byConversation = new Map<
    string,
    { count: number; lastRole: string; lastContent: string; lastAt: Date }
  >();
  for (const m of messageRows) {
    const agg = byConversation.get(m.conversationId) ?? {
      count: 0,
      lastRole: "",
      lastContent: "",
      lastAt: new Date(0),
    };
    agg.count += 1;
    if (m.createdAt > agg.lastAt) {
      agg.lastAt = m.createdAt;
      agg.lastRole = m.role;
      agg.lastContent = m.content;
    }
    byConversation.set(m.conversationId, agg);
  }

  return c.json({
    total: Number(totalRow[0]?.value ?? 0),
    items: rows.map((r) => {
      const agg = byConversation.get(r.id);
      return {
        id: r.id,
        userId: r.userId,
        name: r.name,
        email: r.email,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
        messageCount: agg?.count ?? 0,
        lastMessage: agg
          ? {
              role: agg.lastRole,
              content: agg.lastContent,
              createdAt: agg.lastAt.toISOString(),
            }
          : null,
      };
    }),
  });
});

admin.get("/support/:id", async (c) => {
  const conversationId = c.req.param("id");

  const convRows = await db
    .select({
      id: supportConversation.id,
      userId: supportConversation.userId,
      name: userTable.name,
      email: userTable.email,
      createdAt: supportConversation.createdAt,
      updatedAt: supportConversation.updatedAt,
    })
    .from(supportConversation)
    .innerJoin(userTable, eq(supportConversation.userId, userTable.id))
    .where(eq(supportConversation.id, conversationId))
    .limit(1);

  const conv = convRows[0];
  if (!conv) {
    return fail(c, "Диалог не найден", 404);
  }

  const messageRows = await db
    .select({
      id: supportMessage.id,
      role: supportMessage.role,
      content: supportMessage.content,
      createdAt: supportMessage.createdAt,
    })
    .from(supportMessage)
    .where(eq(supportMessage.conversationId, conversationId))
    .orderBy(asc(supportMessage.createdAt), asc(supportMessage.id));

  return c.json({
    conversation: {
      id: conv.id,
      userId: conv.userId,
      name: conv.name,
      email: conv.email,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    },
    items: messageRows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

admin.get("/config", async (c) => {
  const [welcomeBonus, minDeposit] = await Promise.all([getWelcomeBonus(), getMinDeposit()]);
  return c.json({ welcomeBonus, minDeposit });
});

admin.post("/config", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    welcomeBonus?: unknown;
    minDeposit?: unknown;
  };

  if (body.welcomeBonus !== undefined) {
    const value = Math.floor(Number(body.welcomeBonus));
    if (!Number.isFinite(value) || value < 0) {
      return fail(c, "Некорректное значение приветственного бонуса", 400);
    }
    await setWelcomeBonus(value);
  }

  if (body.minDeposit !== undefined) {
    const value = Math.floor(Number(body.minDeposit));
    if (!Number.isFinite(value) || value < 0) {
      return fail(c, "Некорректное значение минимальной суммы депозита", 400);
    }
    await setMinDeposit(value);
  }

  const [savedWelcomeBonus, savedMinDeposit] = await Promise.all([
    getWelcomeBonus(),
    getMinDeposit(),
  ]);

  return c.json({ welcomeBonus: savedWelcomeBonus, minDeposit: savedMinDeposit });
});

export default admin;
