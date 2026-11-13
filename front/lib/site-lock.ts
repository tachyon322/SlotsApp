// ─────────────────────────────────────────────────────────────────────────────
// Блокировка сайта по просроченному выводу — клиентская часть
//
// Бэк отдаёт 403 access_locked на всё, кроме служебных ручек, а middleware
// подменяет документ прелоадером. Здесь живёт память об этом в браузере:
// localStorage-флаг, чтобы блок переживал протухшую сессию, и единственная
// проверка /api/access при открытии прелоадера.
//
// Разблокировка автоматически не опрашивается: один запрос на загрузку
// прелоадера, дальше — тишина. Если сервер уже не блокирует, флаг стирается и
// страница открывается.
// ─────────────────────────────────────────────────────────────────────────────

export const SITE_LOCK_KEY = 'kazik:site-lock';
const SITE_LOCK_ATTR = 'data-site-locked';
const PRELOAD_PATH = '/preload';

// Флаг — только подсказка для первого рендера, сервер остаётся источником
// истины. Через неделю без подтверждения он протухает, чтобы старый тестовый
// или чужой флаг не запирал сайт навсегда.
const SITE_LOCK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const SITE_LOCK_EXEMPT_PREFIXES = [
  '/adminlitgame43144',
  '/gjiweg32tji32',
  '/devtest',
  '/r',
  '/preload',
];

export interface AccessResponse {
  locked: boolean;
  lockedUntil: string | null;
  reason: 'withdrawal_expired' | 'manual' | null;
  banned: boolean;
  enabled: boolean;
}

export function isSiteLockExempt(pathname: string): boolean {
  return SITE_LOCK_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

interface SiteLockFlag {
  at?: number;
}

/**
 * Читает флаг и отбрасывает протухший. Старый формат `"1"` (без времени)
 * считаем валидным: его снимет guardAccess на 401 или после успешной
 * проверки. Ошибка storage (приватный режим) — флага просто нет.
 */
function readSiteLockFlag(): SiteLockFlag | null {
  try {
    const raw = window.localStorage.getItem(SITE_LOCK_KEY);
    if (!raw) return null;
    if (raw.charAt(0) !== '{') return {};
    const parsed = JSON.parse(raw) as SiteLockFlag;
    if (!parsed || typeof parsed !== 'object') return {};
    if (typeof parsed.at === 'number' && Date.now() - parsed.at > SITE_LOCK_TTL_MS) {
      window.localStorage.removeItem(SITE_LOCK_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function hasSiteLockFlag(): boolean {
  return readSiteLockFlag() !== null;
}

export function isSiteLockShowing(): boolean {
  return document.documentElement.hasAttribute(SITE_LOCK_ATTR);
}

export function markSiteLock(): void {
  try {
    window.localStorage.setItem(SITE_LOCK_KEY, JSON.stringify({ at: Date.now() }));
  } catch {
    // Приватный режим/запрет storage: остаёмся на in-memory + middleware.
  }
  document.documentElement.setAttribute(SITE_LOCK_ATTR, '1');
}

export function clearSiteLock(): void {
  try {
    window.localStorage.removeItem(SITE_LOCK_KEY);
  } catch {
    // storage недоступен — нечего чистить
  }
  document.documentElement.removeAttribute(SITE_LOCK_ATTR);
}

/**
 * Дедлайн в прошлом считается блокировкой даже при `locked: false`: бэк
 * кэширует состояние на 30 секунд, и между истечением срока и протуханием
 * кэша ответ ещё говорит «открыто».
 */
export function isAccessLockedState(state: AccessResponse | null): boolean {
  if (!state) return false;
  if (state.locked) return true;
  if (!state.lockedUntil) return false;
  const deadline = Date.parse(state.lockedUntil);
  return Number.isFinite(deadline) && Date.now() >= deadline;
}

export type AccessFetchResult = AccessResponse | 'unauthorized' | null;

/**
 * Состояние доступа. Ходим в /api/me, а не в /api/access: нужен именно
 * авторизованный ответ.
 *
 * 401 — гость или протухшая сессия. Его нельзя путать с сетевой ошибкой:
 * сервер не подтверждает блокировку, а значит старый localStorage-флаг не
 * должен держать прелоадер. Возвращаем отдельный маркер, чтобы guardAccess
 * снял флаг, а не остался на загрузке навсегда.
 */
export async function fetchAccessState(): Promise<AccessFetchResult> {
  try {
    const res = await fetch('/api/me', { cache: 'no-store', credentials: 'include' });
    if (res.status === 401) return 'unauthorized';
    if (!res.ok) return null;
    const data = (await res.json()) as {
      accessLocked?: boolean;
      accessLockedUntil?: string | null;
      accessLockReason?: string | null;
      banned?: boolean;
    };
    return {
      locked: Boolean(data.accessLocked),
      lockedUntil: data.accessLockedUntil ?? null,
      reason: data.accessLocked
        ? data.accessLockReason === 'manual'
          ? 'manual'
          : 'withdrawal_expired'
        : null,
      banned: Boolean(data.banned),
      enabled: true,
    };
  } catch {
    return null;
  }
}

let reloadInFlight = false;

/**
 * Мгновенно закрыть сайт прелоадером. Если прелоадер уже показан — просто
 * фиксируем флаг, без лишней перезагрузки.
 */
export function enterSiteLock(): void {
  if (typeof window === 'undefined') return;
  if (reloadInFlight) return;
  if (isSiteLockExempt(window.location.pathname)) return;

  // Прелоадер уже на экране (документ от middleware или атрибут уже стоит) —
  // перезагружаться незачем, только фиксируем флаг. Считаем состояние ДО
  // markSiteLock: он сам выставляет атрибут.
  const alreadyShowing =
    isSiteLockShowing() || Boolean(document.getElementById('site-lock-route'));
  markSiteLock();
  if (alreadyShowing) return;

  reloadInFlight = true;
  window.location.reload();
}

/**
 * Единственная проверка при открытии прелоадера (или при возврате фокуса).
 */
export async function guardAccess(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (isSiteLockExempt(window.location.pathname)) return false;

  const state = await fetchAccessState();

  if (state === 'unauthorized') {
    // Сессия протухла или это гость. Раньше здесь оставались на прелоадере,
    // и stale-флаг запирал сайт навсегда. Сервер блокировку не подтверждает —
    // снимаем флаг. Если аккаунт действительно заблокирован, после логина
    // /api/me вернёт accessLocked и прелоадер появится снова.
    const hadLock =
      hasSiteLockFlag() ||
      isSiteLockShowing() ||
      Boolean(document.getElementById('site-lock-route'));
    clearSiteLock();
    if (!hadLock) return false;

    if (window.location.pathname === PRELOAD_PATH) {
      window.location.replace('/');
    } else {
      window.location.reload();
    }
    return false;
  }

  if (isAccessLockedState(state)) {
    markSiteLock();
    return true;
  }

  // Сеть/5xx: сервер не ответил — не открываем сайт вслепую, остаёмся.
  if (state === null) {
    markSiteLock();
    return true;
  }

  // Сервер отпустил (или фичу выключили). Если флага нет и прелоадер не
  // показан — это обычная страница, лишний reload не нужен.
  const hadLock =
    hasSiteLockFlag() ||
    isSiteLockShowing() ||
    Boolean(document.getElementById('site-lock-route'));
  clearSiteLock();
  if (!hadLock) return false;

  // Прямой заход на служебный /preload уводим на главную, иначе перезагружаем
  // тот самый URL, который открыл пользователь.
  if (window.location.pathname === PRELOAD_PATH) {
    window.location.replace('/');
  } else {
    window.location.reload();
  }
  return false;
}
