import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db";
import { transaction } from "../db/schema";
import { auth } from "../lib/auth";
import {
  getAccessState,
  invalidateAccessState,
  isWithdrawalLockEnabled,
  setWithdrawalLockEnabled,
  unlockSiteAccess,
} from "../lib/siteAccess";
import {
  markWithdrawalPaid,
  refundPendingWithdrawal,
  withdrawalDeadline,
} from "../lib/withdrawals";

// ─────────────────────────────────────────────────────────────────────────────
// Ручной тест блокировки сайта по просроченному выводу
//
// Ручки работают с текущей сессией игрока и не двигают деньги: заявка
// создаётся/сдвигается по датам, статусы закрываются штатными функциями.
// Роут и его API исключены из блокировки, поэтому страница остаётся доступной
// даже когда сайт закрыт прелоадером.
// ─────────────────────────────────────────────────────────────────────────────

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const devtest = new Hono<{ Variables: Variables }>();

const TEST_AMOUNT = 10_000;
const DAY_MS = 24 * 60 * 60 * 1000;
const OVERDUE_OFFSET_MS = 31 * DAY_MS;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

// Ручки создают фиктивные заявки и возвращают их сумму на баланс, а флаг фичи
// глобальный — только с админским паролем (как /api/admin), иначе это печатный
// станок для любого игрока.
devtest.use("*", async (c, next) => {
  const header = c.req.header("authorization") || "";
  if (!ADMIN_PASSWORD || header !== `Bearer ${ADMIN_PASSWORD}`) {
    return c.json({ message: "Нужен админский пароль", code: "admin_required" }, 401);
  }
  return next();
});

async function pendingWithdrawal(userId: string) {
  const rows = await db
    .select({ id: transaction.id, createdAt: transaction.createdAt, amount: transaction.amount })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "pending"),
      ),
    )
    .orderBy(desc(transaction.createdAt))
    .limit(1);
  return rows[0] ?? null;
}

async function statusFor(userId: string) {
  const [state, enabled, pending] = await Promise.all([
    // fresh: без кэша, чтобы страница теста видела результат сразу.
    getAccessState(userId, { fresh: true }),
    isWithdrawalLockEnabled(),
    pendingWithdrawal(userId),
  ]);
  return {
    enabled,
    // Латч не зависит от флага: выключение фичи не разблокирует.
    locked: state.locked,
    lockedUntil: state.lockedUntil,
    reason: state.reason,
    lockedAt: state.lockedAt ?? null,
    source: state.source ?? null,
    pending: pending
      ? {
          id: pending.id,
          amount: pending.amount,
          createdAt: pending.createdAt.toISOString(),
          deadline: withdrawalDeadline(pending.createdAt).toISOString(),
        }
      : null,
  };
}

devtest.get("/lock/status", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  return c.json(await statusFor(u.id));
});

// Создать заявку и сразу состарить её за дедлайн (или состарить текущую).
devtest.post("/lock/setup", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const createdAt = new Date(Date.now() - OVERDUE_OFFSET_MS);
  const existing = await pendingWithdrawal(u.id);
  if (existing) {
    await db
      .update(transaction)
      .set({ createdAt })
      .where(eq(transaction.id, existing.id));
  } else {
    await db.insert(transaction).values({
      id: crypto.randomUUID(),
      userId: u.id,
      type: "withdrawal",
      amount: TEST_AMOUNT,
      status: "pending",
      balanceDebited: true,
      method: "СБП",
      details: "+7 (999) ***-**-99",
      createdAt,
    });
  }
  await invalidateAccessState(u.id);
  return c.json(await statusFor(u.id));
});

// Поставить дедлайн через N секунд: страницу нужно открыть сразу, чтобы
// проверить срабатывание таймера в открытой вкладке.
devtest.post("/lock/deadline", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as { seconds?: unknown };
  const seconds = Math.max(1, Math.min(600, Math.floor(Number(body.seconds) || 10)));
  const createdAt = new Date(Date.now() + seconds * 1000 - 30 * DAY_MS);

  const existing = await pendingWithdrawal(u.id);
  if (existing) {
    await db.update(transaction).set({ createdAt }).where(eq(transaction.id, existing.id));
  } else {
    await db.insert(transaction).values({
      id: crypto.randomUUID(),
      userId: u.id,
      type: "withdrawal",
      amount: TEST_AMOUNT,
      status: "pending",
      balanceDebited: true,
      method: "СБП",
      details: "+7 (999) ***-**-99",
      createdAt,
    });
  }
  await invalidateAccessState(u.id);
  return c.json({ ...(await statusFor(u.id)), seconds });
});

devtest.post("/lock/pay", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  const pending = await pendingWithdrawal(u.id);
  if (!pending) return fail(c, "Нет pending-заявки", 409);
  const paid = await markWithdrawalPaid(pending.id);
  if (!paid) return fail(c, "Не удалось закрыть заявку", 409);
  await invalidateAccessState(u.id);
  return c.json(await statusFor(u.id));
});

devtest.post("/lock/reject", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  const pending = await pendingWithdrawal(u.id);
  if (!pending) return fail(c, "Нет pending-заявки", 409);
  const result = await refundPendingWithdrawal(u.id, pending.id);
  if (result !== "ok" && result !== "already") {
    return fail(c, "Не удалось отклонить заявку", 409);
  }
  await invalidateAccessState(u.id);
  return c.json(await statusFor(u.id));
});

// Снять латч вручную: выплата и отклонение заявки этого больше не делают.
devtest.post("/lock/unlock", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  await unlockSiteAccess({ userId: u.id, unlockedBy: "devtest", reason: "manual test" });
  return c.json(await statusFor(u.id));
});

// Полный сброс: удаляем все выводы тестового аккаунта и снимаем латч.
devtest.post("/lock/reset", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  await db
    .delete(transaction)
    .where(and(eq(transaction.userId, u.id), eq(transaction.type, "withdrawal")));
  await unlockSiteAccess({ userId: u.id, unlockedBy: "devtest", reason: "reset" });
  return c.json(await statusFor(u.id));
});

devtest.post("/lock/enabled", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);
  const body = (await c.req.json().catch(() => ({}))) as { enabled?: unknown };
  await setWithdrawalLockEnabled(body.enabled === true);
  return c.json(await statusFor(u.id));
});

export default devtest;
