'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { AuthUser } from './UserBlock';
import { authClient } from '@/lib/auth-client';

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

function toAuthUser(sessionUser: Record<string, unknown>): AuthUser {
  return {
    name: String(sessionUser.name ?? ''),
    level: Number(sessionUser.level ?? 1),
    xp: Number(sessionUser.xp ?? 0),
    balance: Number(sessionUser.balance ?? 0),
  };
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await authClient.getSession();
      if (data?.user) {
        setUser(toAuthUser(data.user as unknown as Record<string, unknown>));
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setIsLoading(false));
  }, [refresh]);

  return (
    <UserContext.Provider value={{ user, isLoading, refresh }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
