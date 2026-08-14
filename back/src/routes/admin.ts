import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, asc, count, desc, eq, gte, ilike, inArray, ne, or, sql, sum, type SQL } from "drizzle-orm";
import { db } from "../db";
import {
  user as userTable,
  transaction,
  payment as paymentTable,
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
import { getWelcomeBonus, setWelcomeBonus, getMinDeposit, setMinDeposit, getUsdtRate, setUsdtRate, getSbpFeeFlat, setSbpFeeFlat, getSbpFeePercent, setSbpFeePercent, getMinWithdraw, setMinWithdraw } from "../lib/config";
import { supportBuffer } from "../lib/supportBuffer";
import { redis } from "../lib/redis";
import { conversationStreamChannel } from "../lib/supportConversation";
import { affiliateWithdrawal, affiliatePartner } from "../affiliate/schema";
import { affiliateService } from "../affiliate/service";
import { startOfMskDay, mskDaysAgo } from "../lib/tz";
import { hasSuccessfulDeposit, hasPaidVerification } from "./wallet";

const admin = new Hono();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const MAX_PAGE_SIZE = 200;
const PREMIUM_LIFETIME = "2099-12-31T23:59:59.000Z";

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
  return startOfMskDay(new Date());
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
  switch (range) {
    case "today":
      return startOfMskDay(new Date());
    case "7d":
      return mskDaysAgo(7);
    case "30d":
      return mskDaysAgo(30);
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

// Сверка балансов: для каждого пользователя считает ожидаемый баланс из
// транзакций и раундов игр и сравнивает с фактическим. Положительный diff —
// деньги в балансе без записи (дыра в учёте), отрицательный — деньги списаны,
// но не объяснены записями (например, зависшие заявки на вывод).
admin.get("/reconcile", async (c) => {
  const { limit, offset } = parsePagination(c);

  // Sync Redis balances to Postgres first, otherwise the query compares the
  // (up to 5s stale) DB balance against the ledger and reports phantom diffs.
  await userCache.flushBalancesToDb();

  const rows = await db.execute<{
    id: string;
    name: string;
    email: string;
    balance: number;
    expected: number;
    diff: number;
    heldFailed: number;
  }>(sql`
    WITH games AS (
      SELECT user_id, sum(bet) AS bets, sum(payout) AS payouts
      FROM (
        SELECT user_id, bet, payout FROM ${minesRound}
        UNION ALL SELECT user_id, bet, payout FROM ${crashRound}
        UNION ALL SELECT user_id, bet, payout FROM ${slotsRound}
        UNION ALL SELECT user_id, bet, payout FROM ${casesRound}
        UNION ALL SELECT user_id, bet, payout FROM ${blockblastRound}
        UNION ALL SELECT user_id, bet, payout FROM ${minedropRound}
      ) g GROUP BY user_id
    ),
    fin AS (
      SELECT user_id,
        sum(amount) FILTER (WHERE type = 'deposit' AND status = 'success') AS deposits,
        sum(CASE WHEN balance_debited THEN -amount ELSE amount END)
          FILTER (WHERE type = 'bonus' AND status = 'success') AS bonuses,
        sum(amount) FILTER (WHERE type = 'withdrawal' AND status IN ('pending', 'success')) AS withdrawn,
        sum(amount) FILTER (WHERE type = 'withdrawal' AND status = 'failed' AND balance_debited) AS held_failed
      FROM ${transaction}
      GROUP BY user_id
    )
    SELECT u.id, u.name, u.email, u.balance::int AS balance,
      (COALESCE(f.deposits, 0) + COALESCE(f.bonuses, 0) + COALESCE(g.payouts, 0)
        - COALESCE(g.bets, 0) - COALESCE(f.withdrawn, 0))::int AS expected,
      (u.balance - (COALESCE(f.deposits, 0) + COALESCE(f.bonuses, 0) + COALESCE(g.payouts, 0)
        - COALESCE(g.bets, 0) - COALESCE(f.withdrawn, 0)))::int AS diff,
      COALESCE(f.held_failed, 0)::int AS "heldFailed"
    FROM ${userTable} u
    LEFT JOIN games g ON g.user_id = u.id
    LEFT JOIN fin f ON f.user_id = u.id
    WHERE abs(u.balance - (COALESCE(f.deposits, 0) + COALESCE(f.bonuses, 0) + COALESCE(g.payouts, 0)
        - COALESCE(g.bets, 0) - COALESCE(f.withdrawn, 0))) > 100
    ORDER BY diff
    LIMIT ${limit} OFFSET ${offset}
  `);

  return c.json({ items: rows.rows });
});

admin.get("/users", async (c) => {
  const { limit, offset } = parsePagination(c);
  const q = (c.req.query("q") || "").trim();

  const where = q
    ? or(ilike(userTable.name, `%${q}%`), ilike(userTable.email, `%${q}%`))
    : undefined;

  const [totalRow, rows] = await Promise.all([
    db
      .select({ value: count() })
      .from(userTable)
      .where(where),
    db
      .select({
        id: userTable.id,
        name: userTable.name,
        email: userTable.email,
        balance: userTable.balance,
        level: userTable.level,
        xp: userTable.xp,
        verifiedForPayment: userTable.verifiedForPayment,
        premiumUntil: userTable.premiumUntil,
        createdAt: userTable.createdAt,
      })
      .from(userTable)
      .where(where)
      .orderBy(desc(userTable.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  const ids = rows.map((r) => r.id);
  const depositSet = new Set<string>();
  const verificationSet = new Set<string>();
  const pendingMap = new Map<
    string,
    { amount: number; method: string | null; details: string | null; createdAt: Date }
  >();

  if (ids.length > 0) {
    const [deposited, verified, pending] = await Promise.all([
      db
        .select({ userId: transaction.userId })
        .from(transaction)
        .where(
          and(
            eq(transaction.type, "deposit"),
            eq(transaction.status, "success"),
            inArray(transaction.userId, ids),
          ),
        )
        .groupBy(transaction.userId),
      db
        .select({ userId: paymentTable.userId })
        .from(paymentTable)
        .where(
          and(
            eq(paymentTable.purpose, "verification"),
            eq(paymentTable.status, "PAID"),
            eq(paymentTable.credited, true),
            inArray(paymentTable.userId, ids),
          ),
        )
        .groupBy(paymentTable.userId),
      db
        .select({
          userId: transaction.userId,
          amount: transaction.amount,
          method: transaction.method,
          details: transaction.details,
          createdAt: transaction.createdAt,
        })
        .from(transaction)
        .where(
          and(
            eq(transaction.type, "withdrawal"),
            eq(transaction.status, "pending"),
            inArray(transaction.userId, ids),
          ),
        ),
    ]);
    for (const r of deposited) depositSet.add(r.userId);
    for (const r of verified) verificationSet.add(r.userId);
    for (const w of pending) {
      pendingMap.set(w.userId, {
        amount: w.amount,
        method: w.method,
        details: w.details,
        createdAt: w.createdAt,
      });
    }
  }

  return c.json({
    total: Number(totalRow[0]?.value ?? 0),
    items: rows.map((r) => {
      const pending = pendingMap.get(r.id);
      return {
        id: r.id,
        name: r.name,
        email: r.email,
        balance: r.balance,
        level: r.level,
        xp: r.xp,
        createdAt: r.createdAt.toISOString(),
        funnel: {
          hasDeposit: depositSet.has(r.id),
          hasPaidVerification: verificationSet.has(r.id),
          verifiedForPayment: r.verifiedForPayment,
          premiumActive: r.premiumUntil ? r.premiumUntil.getTime() > Date.now() : false,
        },
        pendingWithdrawal: pending
          ? {
              amount: pending.amount,
              method: pending.method,
              details: pending.details,
              createdAt: pending.createdAt.toISOString(),
            }
          : null,
      };
    }),
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
    operator?: unknown;
    funnel?: unknown;
  };

  const operator = typeof body.operator === "string" && body.operator.trim()
    ? body.operator.trim()
    : "admin";

  const funnel = (typeof body.funnel === "object" && body.funnel !== null ? body.funnel : {}) as {
    hasDeposit?: unknown;
    hasPaidVerification?: unknown;
    verifiedForPayment?: unknown;
    premiumActive?: unknown;
  };

  const funnelChanged =
    funnel.hasDeposit === true ||
    funnel.hasPaidVerification === true ||
    funnel.verifiedForPayment === true ||
    funnel.verifiedForPayment === false ||
    funnel.premiumActive === true ||
    funnel.premiumActive === false;

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

  if (Object.keys(fields).length === 0 && !funnelChanged) {
    return fail(c, "Нет полей для обновления", 400);
  }

  const exists = await db
    .select({ id: userTable.id })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1);
  if (exists.length === 0) {
    return fail(c, "Пользователь не найден", 404);
  }

  // Ручная выдача этапов воронки. «Депозит» и «Верификация» выдаются
  // синтетическими записями (сумма 0) — они только открывают гейты вывода,
  // не влияя на баланс и финансовую аналитику.
  if (funnel.hasDeposit === true && !(await hasSuccessfulDeposit(userId))) {
    await db.insert(transaction).values({
      id: crypto.randomUUID(),
      userId,
      type: "deposit",
      amount: 0,
      status: "success",
      balanceDebited: false,
      method: "Администратор",
      details: `Выдан этап воронки «Депозит» (${operator})`,
      createdAt: new Date(),
    });
  }

  if (funnel.hasPaidVerification === true && !(await hasPaidVerification(userId))) {
    const now = new Date();
    await db.insert(paymentTable).values({
      id: crypto.randomUUID(),
      userId,
      amount: 0,
      currency: "rub",
      method: "admin",
      purpose: "verification",
      status: "PAID",
      credited: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (funnel.verifiedForPayment === true || funnel.verifiedForPayment === false) {
    await db
      .update(userTable)
      .set({ verifiedForPayment: funnel.verifiedForPayment, updatedAt: new Date() })
      .where(eq(userTable.id, userId));
  }

  if (funnel.premiumActive === true || funnel.premiumActive === false) {
    await db
      .update(userTable)
      .set({
        premiumUntil: funnel.premiumActive ? new Date(PREMIUM_LIFETIME) : null,
        updatedAt: new Date(),
      })
      .where(eq(userTable.id, userId));
  }

  if (Object.keys(fields).length > 0) {
    try {
      const profile = await userCache.setAdminFields(userId, { ...fields, operator });
      return c.json({ user: profile });
    } catch (e) {
      const msg = (e as Error).message;
      if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
      throw e;
    }
  }

  return c.json({ ok: true });
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
      messageId: supportMessage.messageId,
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
      messageId: m.messageId,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

admin.post("/support/:id/messages", async (c) => {
  const conversationId = c.req.param("id");

  const convRows = await db
    .select({ userId: supportConversation.userId })
    .from(supportConversation)
    .where(eq(supportConversation.id, conversationId))
    .limit(1);

  const conv = convRows[0];
  if (!conv) {
    return fail(c, "Диалог не найден", 404);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    content?: unknown;
  };

  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return fail(c, "Сообщение не может быть пустым", 400);
  }
  if (content.length > 4000) {
    return fail(c, "Сообщение слишком длинное", 400);
  }

  const messageId = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  const saved = await supportBuffer.sendOperatorMessage({
    conversationId,
    userId: conv.userId,
    messageId,
    role: "operator",
    content,
    createdAt,
  });
  if (!saved) {
    return fail(c, "Не удалось сохранить сообщение", 500);
  }

  void redis
    .publish(
      conversationStreamChannel(conversationId),
      JSON.stringify({
        id: messageId,
        messageId,
        role: "operator",
        content,
        createdAt,
      }),
    )
    .catch((err) => {
      console.error("[Admin] Support publish failed:", err);
    });

  return c.json({
    ok: true,
    message: { id: messageId, messageId, role: "operator", content, createdAt },
  });
});

admin.get("/config", async (c) => {
  const [welcomeBonus, minDeposit, usdtRate, sbpFeeFlat, sbpFeePercent, minWithdraw] = await Promise.all([
    getWelcomeBonus(),
    getMinDeposit(),
    getUsdtRate(),
    getSbpFeeFlat(),
    getSbpFeePercent(),
    getMinWithdraw(),
  ]);
  return c.json({ welcomeBonus, minDeposit, usdtRate, sbpFeeFlat, sbpFeePercent, minWithdraw });
});

admin.post("/config", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    welcomeBonus?: unknown;
    minDeposit?: unknown;
    usdtRate?: unknown;
    sbpFeeFlat?: unknown;
    sbpFeePercent?: unknown;
    minWithdraw?: unknown;
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

  if (body.usdtRate !== undefined) {
    const value = Number(body.usdtRate);
    if (!Number.isFinite(value) || value <= 0) {
      return fail(c, "Некорректное значение курса USDT", 400);
    }
    await setUsdtRate(value);
  }

  if (body.sbpFeeFlat !== undefined) {
    const value = Math.floor(Number(body.sbpFeeFlat));
    if (!Number.isFinite(value) || value < 0) {
      return fail(c, "Некорректное значение комиссии СБП (₽)", 400);
    }
    await setSbpFeeFlat(value);
  }

  if (body.sbpFeePercent !== undefined) {
    const value = Number(body.sbpFeePercent);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return fail(c, "Некорректное значение комиссии СБП (%)", 400);
    }
    await setSbpFeePercent(value);
  }

  if (body.minWithdraw !== undefined) {
    const value = Math.floor(Number(body.minWithdraw));
    if (!Number.isFinite(value) || value < 0) {
      return fail(c, "Некорректное значение минимальной суммы вывода", 400);
    }
    await setMinWithdraw(value);
  }

  const [savedWelcomeBonus, savedMinDeposit, savedUsdtRate, savedSbpFeeFlat, savedSbpFeePercent, savedMinWithdraw] =
    await Promise.all([
      getWelcomeBonus(),
      getMinDeposit(),
      getUsdtRate(),
      getSbpFeeFlat(),
      getSbpFeePercent(),
      getMinWithdraw(),
    ]);

  return c.json({
    welcomeBonus: savedWelcomeBonus,
    minDeposit: savedMinDeposit,
    usdtRate: savedUsdtRate,
    sbpFeeFlat: savedSbpFeeFlat,
    sbpFeePercent: savedSbpFeePercent,
    minWithdraw: savedMinWithdraw,
  });
});

admin.get("/affiliate/withdrawals", async (c) => {
  const { limit, offset } = parsePagination(c);
  const status = c.req.query("status") || undefined;
  const where = status && status !== "all" ? eq(affiliateWithdrawal.status, status) : undefined;

  const [totalRow, rows] = await Promise.all([
    db
      .select({ value: count(), sum: sum(affiliateWithdrawal.amount) })
      .from(affiliateWithdrawal)
      .where(where),
    db
      .select({
        id: affiliateWithdrawal.id,
        partnerId: affiliateWithdrawal.partnerId,
        name: affiliatePartner.name,
        email: affiliatePartner.email,
        amount: affiliateWithdrawal.amount,
        method: affiliateWithdrawal.method,
        rate: affiliateWithdrawal.rate,
        usdtAmount: affiliateWithdrawal.usdtAmount,
        fee: affiliateWithdrawal.fee,
        bank: affiliateWithdrawal.bank,
        requisites: affiliateWithdrawal.requisites,
        status: affiliateWithdrawal.status,
        comment: affiliateWithdrawal.comment,
        decidedAt: affiliateWithdrawal.decidedAt,
        createdAt: affiliateWithdrawal.createdAt,
      })
      .from(affiliateWithdrawal)
      .innerJoin(affiliatePartner, eq(affiliateWithdrawal.partnerId, affiliatePartner.id))
      .where(where)
      .orderBy(desc(affiliateWithdrawal.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  return c.json({
    total: Number(totalRow[0]?.value ?? 0),
    sum: Number(totalRow[0]?.sum ?? 0),
    items: rows.map((r) => ({
      ...r,
      decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

admin.post("/affiliate/withdrawals/:id/decide", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    decision?: string;
    comment?: string;
  };
  const decision = body.decision === "rejected" ? "rejected" : "approved";
  const comment = typeof body.comment === "string" ? body.comment : "";
  try {
    const withdrawal = await affiliateService.decideWithdrawal(c.req.param("id"), decision, comment);
    return c.json({
      withdrawal: {
        ...withdrawal,
        createdAt: withdrawal.createdAt.toISOString(),
        updatedAt: withdrawal.updatedAt.toISOString(),
        decidedAt: withdrawal.decidedAt ? withdrawal.decidedAt.toISOString() : null,
      },
    });
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "withdrawal_not_pending") return fail(c, "Заявка уже обработана", 409);
    throw err;
  }
});

export default admin;
