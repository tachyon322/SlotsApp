import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { transaction } from "../db/schema";
import { redis } from "./redis";
import { withdrawalDeadline } from "./withdrawals";

// ─────────────────────────────────────────────────────────────────────────────
// Доступ к сайту после дедлайна заявки на вывод
//
// Состояние не хранится в БД: оно выводится из единственной pending-заявки
// пользователя. Частичный уникальный индекс transactions_one_pending_
// withdrawal_per_user означает, что это ровно один поиск по индексу, поэтому
// «просрочено» = createdAt + 30 дней <= now(). Ни флага, ни sweeper'а, ни
// миграции.
//
// Дорогой путь (БД) закрыт коротким Redis-кэшем: в горячих игровых ручках
// guard читает готовое состояние из Redis. Кэш сбрасывается явно, когда заявка
// уходит из pending (выплата / отклонение / отмена), поэтому освобождение
// мгновенное даже с кэшем.
//
// Ручной разблокировки нет: на клиенте блокировка запоминается в localStorage
// и переживает протухание сессии, поэтому серверу достаточно не блокировать —
// решает ли он пускать, только пока жива сессия.
// ─────────────────────────────────────────────────────────────────────────────

export type AccessLockReason = "withdrawal_expired";

export interface AccessState {
  locked: boolean;
  /** Дедлайн заявки (ISO), пока заявка жива; null — заявки нет. */
  lockedUntil: string | null;
  reason: AccessLockReason | null;
}

const UNLOCKED: AccessState = {
  locked: false,
  lockedUntil: null,
  reason: null,
};

const STATE_CACHE_SECONDS = 30;

const ENABLED_KEY = "admin:withdrawal_lock_enabled";
const ENABLED_CACHE_MS = 5_000;

function stateKey(userId: string): string {
  return `access:state:${userId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Флаг включения (Redis, переключается из админки без деплоя)
// ─────────────────────────────────────────────────────────────────────────────

let enabledCache: { value: boolean; at: number } = { value: false, at: 0 };

export async function isWithdrawalLockEnabled(): Promise<boolean> {
  if (Date.now() - enabledCache.at < ENABLED_CACHE_MS) return enabledCache.value;
  try {
    const raw = await redis.get(ENABLED_KEY);
    const value = raw === "1" || raw === "true";
    enabledCache = { value, at: Date.now() };
    return value;
  } catch {
    // Redis уже обязателен для профилей и балансов; при сбое не блокируем.
    return enabledCache.value;
  }
}

export async function setWithdrawalLockEnabled(enabled: boolean): Promise<void> {
  await redis.set(ENABLED_KEY, enabled ? "1" : "0");
  enabledCache = { value: enabled, at: Date.now() };
}

// ─────────────────────────────────────────────────────────────────────────────
// Пути, которые всегда доступны (иначе заблокированный не прочитает ни сессию,
// ни своё состояние, а админка зависит от Bearer-токена, а не от гейта)
// ─────────────────────────────────────────────────────────────────────────────

const LOCK_EXEMPT_PATHS = [
  "/api/me",
  "/api/access",
  "/api/admin",
  "/api/gjiweg32tji32",
  // Ручной тест блокировки: страница должна работать, пока сайт закрыт.
  "/api/devtest",
];

export function isLockExemptPath(path: string): boolean {
  return LOCK_EXEMPT_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// ─────────────────────────────────────────────────────────────────────────────
// Вывод состояния
// ─────────────────────────────────────────────────────────────────────────────

async function findPendingWithdrawal(userId: string): Promise<{ createdAt: Date } | null> {
  const rows = await db
    .select({ createdAt: transaction.createdAt })
    .from(transaction)
    .where(
      and(
        eq(transaction.userId, userId),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "pending"),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/** Чистая логика состояния: без БД, тестируется на границе дедлайна. */
export function computeAccessState(params: { createdAt: Date; now?: Date }): AccessState {
  const now = params.now ?? new Date();
  const deadline = withdrawalDeadline(params.createdAt);

  if (now.getTime() < deadline.getTime()) {
    // Заявка ещё в срок: клиент получит дедлайн, чтобы уйти в прелоадер ровно
    // в момент истечения.
    return { locked: false, lockedUntil: deadline.toISOString(), reason: null };
  }

  return { locked: true, lockedUntil: deadline.toISOString(), reason: "withdrawal_expired" };
}

/** Свежее (без кэша) состояние по текущей pending-заявке. */
export async function deriveAccessState(
  userId: string,
  now: Date = new Date(),
): Promise<AccessState> {
  const pending = await findPendingWithdrawal(userId);
  if (!pending) return UNLOCKED;
  return computeAccessState({ createdAt: pending.createdAt, now });
}

/**
 * Итоговый признак блокировки. Дедлайн в прошлом считается блокировкой даже
 * при `locked: false` из кэша: между истечением срока и протуханием 30-секундной
 * записи кэш ещё отдаёт состояние «в срок», и без этого правила пользователь
 * успевал бы проскочить на сайт.
 */
export function isEffectivelyLocked(state: AccessState, now: Date = new Date()): boolean {
  if (state.locked) return true;
  if (!state.lockedUntil) return false;
  const deadline = new Date(state.lockedUntil).getTime();
  return Number.isFinite(deadline) && now.getTime() >= deadline;
}

function parseState(raw: string | null | undefined): AccessState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AccessState>;
    if (typeof parsed.locked !== "boolean") return null;
    return {
      locked: parsed.locked,
      lockedUntil: typeof parsed.lockedUntil === "string" ? parsed.lockedUntil : null,
      reason: parsed.reason === "withdrawal_expired" ? "withdrawal_expired" : null,
    };
  } catch {
    return null;
  }
}

/**
 * Итоговое состояние для пользователя. `fresh` игнорирует кэш — нужно ручкам,
 * которые читают состояние напрямую, а не из горячего guard'а.
 */
export async function getAccessState(
  userId: string,
  options?: { fresh?: boolean },
): Promise<AccessState> {
  if (!options?.fresh) {
    const cached = parseState(await redis.get(stateKey(userId)));
    if (cached) return cached;
  }

  const derived = await deriveAccessState(userId);
  await redis
    .set(stateKey(userId), JSON.stringify(derived), "EX", STATE_CACHE_SECONDS)
    .catch(() => {});
  return derived;
}

/**
 * Guard для API. При сбое Redis/БД пропускаем: сайт и так бесполезен без них.
 */
export async function isAccessLocked(userId: string): Promise<boolean> {
  try {
    return isEffectivelyLocked(await getAccessState(userId));
  } catch (err) {
    console.warn("[SiteAccess] state read failed, allowing request:", err);
    return false;
  }
}

/** Сбросить кэш после смены состояния заявки. */
export async function invalidateAccessState(userId: string): Promise<void> {
  await redis.del(stateKey(userId)).catch(() => {});
}
