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

const SITE_LOCK_EXEMPT_PREFIXES = ['/adminlitgame43144', '/gjiweg32tji32', '/r', '/preload'];

export interface AccessResponse {
  locked: boolean;
  lockedUntil: string | null;
  reason: 'withdrawal_expired' | null;
  banned: boolean;
  enabled: boolean;
}

export function isSiteLockExempt(pathname: string): boolean {
  return SITE_LOCK_EXEMPT_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function hasSiteLockFlag(): boolean {
  try {
    return Boolean(window.localStorage.getItem(SITE_LOCK_KEY));
  } catch {
    return false;
  }
}

export function isSiteLockShowing(): boolean {
  return document.documentElement.hasAttribute(SITE_LOCK_ATTR);
}

export function markSiteLock(): void {
  try {
    window.localStorage.setItem(SITE_LOCK_KEY, '1');
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

/**
 * Состояние доступа. Ходим в /api/me, а не в /api/access: нужен именно
 * авторизованный ответ. Гость (протухшая сессия) получает 401 — и по флагу в
 * localStorage остаётся на прелоадере, пока не почистят данные сайта.
 */
export async function fetchAccessState(): Promise<AccessResponse | null> {
  try {
    const res = await fetch('/api/me', { cache: 'no-store', credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      accessLocked?: boolean;
      accessLockedUntil?: string | null;
      banned?: boolean;
    };
    return {
      locked: Boolean(data.accessLocked),
      lockedUntil: data.accessLockedUntil ?? null,
      reason: data.accessLocked ? 'withdrawal_expired' : null,
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

  if (isAccessLockedState(state)) {
    markSiteLock();
    return true;
  }

  // Ошибка сети/401 — не повод открывать сайт, остаёмся.
  if (state === null) {
    markSiteLock();
    return true;
  }

  // Сервер отпустил (или фичу выключили). Если флага нет и прелоадер не
  // показан — это обычная страница, лишний reload не нужен.
  const hadLock = hasSiteLockFlag() || isSiteLockShowing();
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
