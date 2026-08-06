import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, count, desc, eq, gte, sum } from "drizzle-orm";
import { db } from "../db";
import { user as userTable, transaction } from "../db/schema";
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

  const [totalUsersRow, todayUsersRow, totalDepositsRow, todayDepositsRow] = await Promise.all([
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
