import { and, eq, lt } from "drizzle-orm";
import { db } from "../db";
import { siteAccess, transaction } from "../db/schema";
import { redis } from "./redis";
import { withdrawalDeadline, WITHDRAWAL_PROCESSING_DAYS } from "./withdrawals";

// ─────────────────────────────────────────────────────────────────────────────
// Доступ к сайту после дедлайна заявки на вывод
//
// Раньше состояние было чисто производным: «есть pending-заявка старше 30
// дней». Из-за этого блокировка снималась сама, как только оператор закрывал
// заявку (status уходил из pending), — нарушитель возвращался на сайт.
//
// Теперь блокировка — это запись в site_access (латч): ставится один раз,
// хранится в БД и снимается только вручную из админки. Выплата, отклонение,
// возврат денег и удаление заявки её не трогают.
//
// Состояние по-прежнему вычисляется из pending-заявки, но только в момент
// перехода «открыто → locked». Дальше источник истины — строка в site_access.
// Дорогой путь (БД) закрыт коротким Redis-кэшем: открытое состояние живёт 30
// секунд, locked — час (unlock удаляет ключ сразу).
// ─────────────────────────────────────────────────────────────────────────────

export type AccessLockReason = "withdrawal_expired" | "manual";
export type AccessLockSource = "auto" | "admin";
export type SiteAccessStatus = "locked" | "unlocked";

export interface AccessState {
  locked: boolean;
  /**
   * Дедлайн заявки (ISO), пока заявка жива и сайт ещё открыт. Для латча —
   * null: блокировка бессрочная, снимается только вручную.
   */
  lockedUntil: string | null;
  reason: AccessLockReason | null;
  lockedAt?: string | null;
  source?: AccessLockSource | null;
}

export interface SiteAccessRecord {
  userId: string;
  status: SiteAccessStatus;
  reason: AccessLockReason;
  lockedAt: string;
  lockedUntil: string | null;
  withdrawalId: string | null;
  amount: number | null;
  source: AccessLockSource;
  unlockedAt: string | null;
  unlockedBy: string | null;
  unlockReason: string | null;
  updatedAt: string;
}

const UNLOCKED: AccessState = {
  locked: false,
  lockedUntil: null,
  reason: null,
};

const STATE_CACHE_SECONDS = 30;
// Час, а не вечно: если Redis переживёт ручной unlock (del не дошёл), запись
// сама перечитается из БД.
const LOCKED_STATE_CACHE_SECONDS = 60 * 60;

const ENABLED_KEY = "admin:withdrawal_lock_enabled";
const ENABLED_CACHE_MS = 5_000;

function stateKey(userId: string): string {
  return `access:state:${userId}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Флаг включения (Redis, переключается из админки без деплоя)
//
// Гейтит только автоматическую постановку блокировки. Уже поставленный латч
// от флага не зависит: выключение фичи не разблокирует нарушителей.
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
// Чистая логика: без БД, тестируется на границе дедлайна
// ─────────────────────────────────────────────────────────────────────────────

interface PendingWithdrawal {
  id: string;
  createdAt: Date;
  amount: number;
}

async function findPendingWithdrawal(userId: string): Promise<PendingWithdrawal | null> {
  const rows = await db
    .select({
      id: transaction.id,
      createdAt: transaction.createdAt,
      amount: transaction.amount,
    })
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

export interface ComputeAccessStateParams {
  createdAt: Date;
  now?: Date;
}

/** Состояние по живой заявке: без учёта латча и ручного unlock. */
export function computeAccessState(params: ComputeAccessStateParams): AccessState {
  const now = params.now ?? new Date();
  const deadline = withdrawalDeadline(params.createdAt);

  if (now.getTime() < deadline.getTime()) {
    // Заявка ещё в срок: клиент получит дедлайн, чтобы уйти в прелоадер ровно
    // в момент истечения.
    return { locked: false, lockedUntil: deadline.toISOString(), reason: null };
  }

  return { locked: true, lockedUntil: deadline.toISOString(), reason: "withdrawal_expired" };
}

/**
 * Итоговый признак блокировки по состоянию: дедлайн в прошлом считается
 * блокировкой даже при `locked: false` из кэша — иначе между истечением срока
 * и протуханием 30-секундной записи можно было бы проскочить на сайт.
 */
export function isEffectivelyLocked(state: AccessState, now: Date = new Date()): boolean {
  if (state.locked) return true;
  if (!state.lockedUntil) return false;
  const deadline = new Date(state.lockedUntil).getTime();
  return Number.isFinite(deadline) && now.getTime() >= deadline;
}

/**
 * Ставить ли латч автоматически. Вынесено отдельно, чтобы тестировать без БД.
 *
 * Правила:
 * - фича выключена или заявки нет — не блокируем;
 * - уже locked — не трогаем (в т.ч. ручную блокировку);
 * - админ снял блокировку по этой же заявке — уважаем override;
 * - иначе блокируем ровно после дедлайна.
 */
export function shouldAutoLock(params: {
  enabled: boolean;
  pending: { id: string; createdAt: Date } | null;
  record: Pick<SiteAccessRecord, "status" | "withdrawalId"> | null;
  now?: Date;
}): boolean {
  const { enabled, pending, record } = params;
  if (!enabled || !pending) return false;
  if (record?.status === "locked") return false;
  if (record?.status === "unlocked" && record.withdrawalId === pending.id) return false;
  return isEffectivelyLocked(
    computeAccessState({ createdAt: pending.createdAt, now: params.now }),
    params.now,
  );
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

// ─────────────────────────────────────────────────────────────────────────────
// Хранилище латча
// ─────────────────────────────────────────────────────────────────────────────

function parseReason(value: unknown): AccessLockReason | null {
  return value === "withdrawal_expired" || value === "manual" ? value : null;
}

function toRecord(row: typeof siteAccess.$inferSelect): SiteAccessRecord {
  return {
    userId: row.userId,
    status: row.status === "unlocked" ? "unlocked" : "locked",
    reason: parseReason(row.reason) ?? "withdrawal_expired",
    lockedAt: row.lockedAt.toISOString(),
    lockedUntil: row.lockedUntil ? row.lockedUntil.toISOString() : null,
    withdrawalId: row.withdrawalId ?? null,
    amount: row.amount ?? null,
    source: row.source === "admin" ? "admin" : "auto",
    unlockedAt: row.unlockedAt ? row.unlockedAt.toISOString() : null,
    unlockedBy: row.unlockedBy ?? null,
    unlockReason: row.unlockReason ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function lockedStateFromRecord(record: SiteAccessRecord): AccessState {
  return {
    locked: true,
    lockedUntil: null,
    reason: record.reason,
    lockedAt: record.lockedAt,
    source: record.source,
  };
}

export async function getSiteAccessRecord(userId: string): Promise<SiteAccessRecord | null> {
  const rows = await db
    .select()
    .from(siteAccess)
    .where(eq(siteAccess.userId, userId))
    .limit(1);
  const row = rows[0];
  return row ? toRecord(row) : null;
}

/**
 * Поставить латч. Идемпотентно: уже locked строку не перезаписываем (иначе
 * автопроверка затирала бы ручную блокировку и дату), а unlocked — обновляем.
 */
export async function lockSiteAccess(params: {
  userId: string;
  reason: AccessLockReason;
  source: AccessLockSource;
  withdrawalId?: string | null;
  amount?: number | null;
  lockedAt?: Date;
}): Promise<SiteAccessRecord> {
  const now = new Date();
  const lockedAt = params.lockedAt ?? now;
  const values = {
    userId: params.userId,
    status: "locked" as const,
    reason: params.reason,
    lockedAt,
    lockedUntil: null,
    withdrawalId: params.withdrawalId ?? null,
    amount: params.amount ?? null,
    source: params.source,
    unlockedAt: null,
    unlockedBy: null,
    unlockReason: null,
    updatedAt: now,
  };

  await db
    .insert(siteAccess)
    .values(values)
    .onConflictDoUpdate({
      target: siteAccess.userId,
      set: {
        status: values.status,
        reason: values.reason,
        lockedAt: values.lockedAt,
        lockedUntil: values.lockedUntil,
        withdrawalId: values.withdrawalId,
        amount: values.amount,
        source: values.source,
        unlockedAt: values.unlockedAt,
        unlockedBy: values.unlockedBy,
        unlockReason: values.unlockReason,
        updatedAt: values.updatedAt,
      },
      // Существующий locked не трогаем: сохраняем исходную дату и источник.
      setWhere: eq(siteAccess.status, "unlocked"),
    });

  await redis.del(stateKey(params.userId)).catch(() => {});

  const record = await getSiteAccessRecord(params.userId);
  if (!record) throw new Error("site_access_write_failed");
  return record;
}

/**
 * Снять латч вручную. `withdrawalId` текущей pending-заявки сохраняем, чтобы
 * автоправило не заблокировало пользователя снова по той же самой заявке.
 */
export async function unlockSiteAccess(params: {
  userId: string;
  unlockedBy?: string;
  reason?: string | null;
}): Promise<SiteAccessRecord | null> {
  const now = new Date();
  const unlockedBy = params.unlockedBy?.trim() || "admin";
  const reason = params.reason?.trim() || null;

  const [existing, pending] = await Promise.all([
    getSiteAccessRecord(params.userId),
    findPendingWithdrawal(params.userId).catch(() => null),
  ]);
  const withdrawalId = pending?.id ?? existing?.withdrawalId ?? null;

  if (existing) {
    await db
      .update(siteAccess)
      .set({
        status: "unlocked",
        unlockedAt: now,
        unlockedBy,
        unlockReason: reason,
        withdrawalId,
        updatedAt: now,
      })
      .where(eq(siteAccess.userId, params.userId));
  } else {
    await db.insert(siteAccess).values({
      userId: params.userId,
      status: "unlocked",
      reason: "manual",
      lockedAt: now,
      lockedUntil: null,
      withdrawalId,
      amount: null,
      source: "admin",
      unlockedAt: now,
      unlockedBy,
      unlockReason: reason,
      updatedAt: now,
    });
  }

  await redis.del(stateKey(params.userId)).catch(() => {});
  return getSiteAccessRecord(params.userId);
}

/**
 * Сбросить кэш после смены состояния заявки. Латч не трогаем: выплата или
 * отклонение заявки больше не разблокируют пользователя.
 */
export async function invalidateAccessState(userId: string): Promise<void> {
  try {
    const record = await getSiteAccessRecord(userId);
    if (record?.status === "locked") return;
  } catch {
    // БД недоступна — удаление кэша безвредно, следующий запрос перечитает.
  }
  await redis.del(stateKey(userId)).catch(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
// Чтение состояния
// ─────────────────────────────────────────────────────────────────────────────

function parseState(raw: string | null | undefined): AccessState | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AccessState>;
    if (typeof parsed.locked !== "boolean") return null;
    return {
      locked: parsed.locked,
      lockedUntil: typeof parsed.lockedUntil === "string" ? parsed.lockedUntil : null,
      reason: parseReason(parsed.reason),
      lockedAt: typeof parsed.lockedAt === "string" ? parsed.lockedAt : null,
      source: parsed.source === "admin" ? "admin" : parsed.source === "auto" ? "auto" : null,
    };
  } catch {
    return null;
  }
}

async function cacheState(
  userId: string,
  state: AccessState,
  ttlSeconds: number,
): Promise<void> {
  try {
    await redis.set(stateKey(userId), JSON.stringify(state), "EX", ttlSeconds);
  } catch {
    // Кэш — оптимизация; состояние всегда можно перечитать из БД.
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
    const cached = parseState(await redis.get(stateKey(userId)).catch(() => null));
    if (cached?.locked) return cached;
    if (cached && !isEffectivelyLocked(cached)) return cached;
  }

  const record = await getSiteAccessRecord(userId);

  // Латч старше любых изменений заявки: выплата/отклонение его не снимают.
  if (record?.status === "locked") {
    const state = lockedStateFromRecord(record);
    await cacheState(userId, state, LOCKED_STATE_CACHE_SECONDS);
    return state;
  }

  const enabled = await isWithdrawalLockEnabled();
  const pending = await findPendingWithdrawal(userId);

  if (!shouldAutoLock({ enabled, pending, record })) {
    let state: AccessState;
    if (!enabled || !pending) {
      state = UNLOCKED;
    } else if (record?.status === "unlocked" && record.withdrawalId === pending.id) {
      // Админ уже снимал блокировку по этой заявке — не отдаём клиенту
      // прошедший дедлайн, иначе таймер снова уведёт его в прелоадер.
      state = {
        locked: false,
        lockedUntil: null,
        reason: null,
        lockedAt: record.lockedAt,
        source: record.source,
      };
    } else {
      state = computeAccessState({ createdAt: pending.createdAt });
    }
    await cacheState(userId, state, STATE_CACHE_SECONDS);
    return state;
  }

  // Дедлайн прошёл впервые — фиксируем латч. locked_at = момент истечения
  // срока заявки, а не момент запроса: в админке видно, когда наступил исход.
  const locked = await lockSiteAccess({
    userId,
    reason: "withdrawal_expired",
    source: "auto",
    withdrawalId: pending!.id,
    amount: pending!.amount,
    lockedAt: withdrawalDeadline(pending!.createdAt),
  });
  const state = lockedStateFromRecord(locked);
  await cacheState(userId, state, LOCKED_STATE_CACHE_SECONDS);
  return state;
}

/**
 * Guard для API. При сбое Redis/БД пропускаем: сайт и так бесполезен без них.
 */
export async function isAccessLocked(userId: string): Promise<boolean> {
  try {
    return (await getAccessState(userId)).locked;
  } catch (err) {
    console.warn("[SiteAccess] state read failed, allowing request:", err);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Sweeper: ставит латч всем просроченным заявкам, даже если пользователь не
// заходил на сайт. Так админка видит полный список, а не только тех, кто уже
// дёрнул API после дедлайна. Автопостановку гейтит флаг; ручной unlock по той
// же заявке sweeper уважает.
// ─────────────────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_INITIAL_DELAY_MS = 30 * 1000;

export async function lockOverdueAccess(now: Date = new Date()): Promise<number> {
  if (!(await isWithdrawalLockEnabled())) return 0;

  const cutoff = new Date(now.getTime() - WITHDRAWAL_PROCESSING_DAYS * DAY_MS);
  const rows = await db
    .select({
      userId: transaction.userId,
      id: transaction.id,
      amount: transaction.amount,
      createdAt: transaction.createdAt,
    })
    .from(transaction)
    .where(
      and(
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "pending"),
        lt(transaction.createdAt, cutoff),
      ),
    );

  let count = 0;
  for (const row of rows) {
    const record = await getSiteAccessRecord(row.userId);
    if (record?.status === "locked") continue;
    // Админ уже снимал блокировку по этой заявке — не возвращаем её.
    if (record?.status === "unlocked" && record.withdrawalId === row.id) continue;

    await lockSiteAccess({
      userId: row.userId,
      reason: "withdrawal_expired",
      source: "auto",
      withdrawalId: row.id,
      amount: row.amount,
      lockedAt: withdrawalDeadline(row.createdAt),
    });
    count += 1;
  }
  return count;
}

export function startAccessLockSweeper(): () => void {
  let stopped = false;

  const run = async () => {
    if (stopped) return;
    try {
      const count = await lockOverdueAccess();
      if (count > 0) {
        console.log(`[SiteAccess] latched ${count} overdue withdrawal(s)`);
      }
    } catch (err) {
      console.warn("[SiteAccess] sweep failed:", (err as Error).message);
    }
  };

  const initial = setTimeout(() => void run(), SWEEP_INITIAL_DELAY_MS);
  const timer = setInterval(() => void run(), SWEEP_INTERVAL_MS);
  return () => {
    stopped = true;
    clearTimeout(initial);
    clearInterval(timer);
  };
}
