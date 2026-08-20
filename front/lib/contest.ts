export const CONTEST_DEADLINE = new Date('2026-08-28T14:00:00');

export const CONTEST_PARTICIPATED_KEY = 'kazik_contest_participated';

export const CONTEST_PARTICIPATED_KEY_PREFIX = 'kazik_contest_participated:';

export type ContestUser = { id?: string | null; name?: string | null } | string | null | undefined;

export function getContestKey(user: ContestUser): string | null {
  if (!user) return null;
  if (typeof user === 'string') {
    const trimmed = user.trim();
    if (!trimmed) return null;
    return `${CONTEST_PARTICIPATED_KEY_PREFIX}name:${trimmed}`;
  }
  const id = user.id != null ? String(user.id).trim() : '';
  if (id) return `${CONTEST_PARTICIPATED_KEY_PREFIX}id:${id}`;
  const name = user.name != null ? String(user.name).trim() : '';
  if (name) return `${CONTEST_PARTICIPATED_KEY_PREFIX}name:${name}`;
  return null;
}

export function isContestParticipated(user?: ContestUser): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const perUserKey = getContestKey(user ?? null);
    if (perUserKey) {
      if (window.localStorage.getItem(perUserKey) === 'true') return true;
      // Migration: if legacy key exists and no per-user keys yet, treat legacy as belonging to current user
      const legacy = window.localStorage.getItem(CONTEST_PARTICIPATED_KEY);
      if (legacy === 'true') {
        let hasAnyPerUser = false;
        for (let i = 0; i < window.localStorage.length; i++) {
          const k = window.localStorage.key(i);
          if (k && k.startsWith(CONTEST_PARTICIPATED_KEY_PREFIX)) {
            hasAnyPerUser = true;
            break;
          }
        }
        if (!hasAnyPerUser) {
          try {
            window.localStorage.setItem(perUserKey, 'true');
            window.localStorage.removeItem(CONTEST_PARTICIPATED_KEY);
          } catch {
            // ignore
          }
          return true;
        }
      }
      return false;
    }
    // No user identifier -> fallback to legacy for backwards compat / guest
    return window.localStorage.getItem(CONTEST_PARTICIPATED_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setContestParticipated(user: ContestUser): void {
  if (typeof window === 'undefined') return;
  try {
    const perUserKey = getContestKey(user);
    if (perUserKey) {
      window.localStorage.setItem(perUserKey, 'true');
      // clean up legacy key if it exists to avoid ambiguity
      try {
        if (window.localStorage.getItem(CONTEST_PARTICIPATED_KEY) === 'true') {
          window.localStorage.removeItem(CONTEST_PARTICIPATED_KEY);
        }
      } catch {
        // ignore
      }
      return;
    }
    window.localStorage.setItem(CONTEST_PARTICIPATED_KEY, 'true');
  } catch {
    // ignore
  }
}

export function formatContestDate(date: Date = CONTEST_DEADLINE): string {
  return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
}

export interface CountdownParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function getCountdownParts(now: Date, deadline: Date = CONTEST_DEADLINE): CountdownParts {
  const diff = Math.max(0, deadline.getTime() - now.getTime());
  const totalSeconds = Math.floor(diff / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function formatCountdown(parts: CountdownParts): string {
  const hh = String(parts.hours).padStart(2, '0');
  const mm = String(parts.minutes).padStart(2, '0');
  const ss = String(parts.seconds).padStart(2, '0');
  return `${parts.days}д ${hh}:${mm}:${ss}`;
}
