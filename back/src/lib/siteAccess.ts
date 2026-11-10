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
// уходит из pending (выплата / отклонение / отмена), поэтому разблокировка
// мгновенная даже с кэшем.
//
// Ручная разблокировка оператором — Redis-ключ с id конкретной заявки: он
// подавляет блокировку только для неё и не «залипнет» на следующей просрочке.
// ─────────────────────────────────────────────────────────────────────────────

export type AccessLockReason = "withdrawal_expired";

export interface AccessState {
  /** Итоговое состояние с учётом ручной разблокировки. */
  locked: boolean;
  /** Дедлайн заявки (ISO), пока заявка жива; null — заявки нет. */
  lockedUntil: string | null;
  /** id pending-заявки, к которой относится состояние. */
  requestId: string | null;
  reason: AccessLockReason | null;
}

const UNLOCKED: AccessState = {
  locked: false,
  lockedUntil: null,
  requestId: null,
  reason: null,
};

const STATE_CACHE_SECONDS = 30;
const OVERRIDE_TTL_SECONDS = 30 * 24 * 60 * 60;

const ENABLED_KEY = "admin:withdrawal_lock_enabled";
const ENABLED_CACHE_MS = 5_000;

function stateKey(userId: string): string {
  return `access:state:${userId}`;
}

function overrideKey(userId: string): string {
  return `access:override:${userId}`;
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
  "/api/auth",
  "/api/quick-auth",
  "/api/admin",
  "/api/gjiweg32tji32",
  // Статус счёта нужен поддержке и ИИ-ассистенту, даже когда сайт закрыт.
  "/api/wallet/account-status",
];

export function isLockExemptPath(path: string): boolean {
  return LOCK_EXEMPT_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

// ─────────────────────────────────────────────────────────────────────────────
// Вывод состояния
// ─────────────────────────────────────────────────────────────────────────────

async function findPendingWithdrawal(
  userId: string,
): Promise<{ id: string; createdAt: Date } | null> {
  const rows = await db
    .select({ id: transaction.id, createdAt: transaction.createdAt })
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
export function computeAccessState(params: {
  requestId: string;
  createdAt: Date;
  now?: Date;
  overrideId?: string | null;
}): AccessState {
  const now = params.now ?? new Date();
  const deadline = withdrawalDeadline(params.createdAt);
  const expired = now.getTime() >= deadline.getTime();

  if (!expired) {
    // Заявка ещё в срок: клиент получит дедлайн, чтобы выкинуть на белый
    // экран ровно в момент истечения.
    return {
      locked: false,
      lockedUntil: deadline.toISOString(),
      requestId: params.requestId,
      reason: null,
    };
  }

  if (params.overrideId === params.requestId) {
    // Ручная разблокировка действует только на эту заявку; дедлайн уже в
    // прошлом — таймер клиента не должен снова выкидывать.
    return {
      locked: false,
      lockedUntil: null,
      requestId: params.requestId,
      reason: "withdrawal_expired",
    };
  }

  return {
    locked: true,
    lockedUntil: deadline.toISOString(),
    requestId: params.requestId,
    reason: "withdrawal_expired",
  };
}

/** Свежее (без кэша) состояние до применения ручной разблокировки. */
export async function deriveAccessState(
  userId: string,
  now: Date = new Date(),
): Promise<AccessState> {
  const pending = await findPendingWithdrawal(userId);
  if (!pending) return UNLOCKED;
  return computeAccessState({ requestId: pending.id, createdAt: pending.createdAt, now });
}

function applyOverride(state: AccessState, overrideId: string | null): AccessState {
  if (!state.locked || !state.requestId || overrideId !== state.requestId) return state;
  return {
    locked: false,
    // Дедлайн уже в прошлом — таймер клиента не должен снова выкидывать.
    lockedUntil: null,
    requestId: state.requestId,
    reason: state.reason,
  };
}

function parseState(raw: string | null | undefined): AccessState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AccessState>;
    if (typeof parsed.locked !== "boolean") return null;
    return {
      locked: parsed.locked,
      lockedUntil: typeof parsed.lockedUntil === "string" ? parsed.lockedUntil : null,
      requestId: typeof parsed.requestId === "string" ? parsed.requestId : null,
      reason: parsed.reason === "withdrawal_expired" ? "withdrawal_expired" : null,
    };
  } catch {
    return null;
  }
}

/**
 * Итоговое состояние для пользователя. `fresh` игнорирует кэш (нужен точечно
 * админке и ручной разблокировке, чтобы не показывать устаревшее значение).
 */
export async function getAccessState(
  userId: string,
  options?: { fresh?: boolean },
): Promise<AccessState> {
  const [rawState, overrideId] = await redis.mget(stateKey(userId), overrideKey(userId));

  if (!options?.fresh) {
    const cached = parseState(rawState);
    if (cached) return applyOverride(cached, overrideId);
  }

  const derived = await deriveAccessState(userId);
  const effective = applyOverride(derived, overrideId);
  await redis
    .set(stateKey(userId), JSON.stringify(derived), "EX", STATE_CACHE_SECONDS)
    .catch(() => {});
  return effective;
}

/**
 * Итоговый признак блокировки. Дедлайн в прошлом считается блокировкой даже
 * при `locked: false` из кэша: между истечением срока и протуханием 30-секундной
 * записи кэш ещё отдаёт состояние «в срок», и без этого правила пользователь
 * успевал бы проскочить на сайт и получить обратный выброс на белый экран.
 * Ручная разблокировка не задевается: у неё lockedUntil = null.
 */
export function isEffectivelyLocked(state: AccessState, now: Date = new Date()): boolean {
  if (state.locked) return true;
  if (!state.lockedUntil) return false;
  const deadline = new Date(state.lockedUntil).getTime();
  return Number.isFinite(deadline) && now.getTime() >= deadline;
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

export async function setAccessOverride(userId: string, requestId: string): Promise<void> {
  await redis.set(overrideKey(userId), requestId, "EX", OVERRIDE_TTL_SECONDS);
  await invalidateAccessState(userId);
}

export async function clearAccessOverride(userId: string): Promise<void> {
  await redis.del(overrideKey(userId)).catch(() => {});
}

/** Пакетная читка override'ов для списков админки (один roundtrip). */
export async function getAccessOverrides(userIds: string[]): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  try {
    const values = await redis.mget(userIds.map(overrideKey));
    const result = new Map<string, string>();
    userIds.forEach((userId, index) => {
      const value = values[index];
      if (value) result.set(userId, value);
    });
    return result;
  } catch {
    // Redis недоступен — списки админки важнее точности бейджа.
    return new Map();
  }
}

/**
 * Снять кэш и ручную разблокировку, когда заявка пользователя стала
 * терминальной. Состояние после этого выводится заново (обычно — «свободен»).
 */
export async function refreshAfterWithdrawalSettled(userId: string): Promise<void> {
  await Promise.all([invalidateAccessState(userId), clearAccessOverride(userId)]);
}
