'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from './UserBlock';
import { guardAccess, isAccessRedirectExempt, meApi, redirectToWhite } from '@/lib/api';
import { identify } from '@/lib/analytics';

interface UserContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const UserContext = createContext<UserContextValue>({
  user: null,
  isLoading: false,
  refresh: async () => {},
});

function toAuthUser(
  sessionUser: Record<string, unknown>,
  accessLocked?: boolean,
  accessLockedUntil?: string | null,
): AuthUser {
  return {
    id: String(sessionUser.id ?? ''),
    name: String(sessionUser.name ?? ''),
    level: Number(sessionUser.level ?? 1),
    xp: Number(sessionUser.xp ?? 0),
    balance: Number(sessionUser.balance ?? 0),
    banned: Boolean(sessionUser.banned),
    accessLocked: Boolean(accessLocked),
    accessLockedUntil: accessLockedUntil ?? null,
  };
}

function isLockNavigationExempt(): boolean {
  if (typeof window === 'undefined') return true;
  return isAccessRedirectExempt(window.location.pathname);
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Таймер до дедлайна заявки: по нему уходим на белый экран ровно в момент
  // истечения срока, не дожидаясь следующего ответа API.
  const lockTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLockTimer = useCallback(() => {
    if (lockTimerRef.current !== null) {
      clearTimeout(lockTimerRef.current);
      lockTimerRef.current = null;
    }
  }, []);

  const scheduleLockRedirect = useCallback(
    (next: AuthUser | null) => {
      clearLockTimer();
      if (!next || isLockNavigationExempt()) return;

      if (next.accessLocked) {
        redirectToWhite();
        return;
      }

      const until = next.accessLockedUntil ? Date.parse(next.accessLockedUntil) : NaN;
      if (!Number.isFinite(until)) return;

      // +1с: не гоним пользователя на белый экран за мгновение до дедлайна.
      const delay = Math.max(until - Date.now() + 1000, 0);
      lockTimerRef.current = setTimeout(() => {
        lockTimerRef.current = null;
        void guardAccess();
      }, delay);
    },
    [clearLockTimer],
  );

  const refresh = useCallback(async () => {
    try {
      const res = await meApi.get();
      const profile = res.user;
      if (profile) {
        // accessLocked/accessLockedUntil приходят рядом с user (контракт /api/me).
        const nextUser = toAuthUser(
          profile as unknown as Record<string, unknown>,
          Boolean(res.accessLocked),
          res.accessLockedUntil ?? null,
        );
        setUser(nextUser);
        identify(profile.id);
        scheduleLockRedirect(nextUser);
      } else {
        setUser(null);
        scheduleLockRedirect(null);
      }
    } catch {
      setUser(null);
    }
  }, [scheduleLockRedirect]);

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  useEffect(() => {
    // Возврат в таб или фокус окна — повод перепроверить блокировку: в фоне
    // браузер может душить таймеры, а разблокировка должна замечаться сразу.
    const recheck = () => {
      if (document.visibilityState === 'hidden') return;
      if (isLockNavigationExempt()) return;
      void guardAccess();
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') recheck();
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => clearLockTimer, [clearLockTimer]);

  return (
    <UserContext.Provider value={{ user, isLoading, refresh }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
