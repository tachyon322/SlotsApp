'use client';

import { useEffect } from 'react';
import { isAccessLockedState, type AccessResponse } from '@/lib/api';

// Пока сайт закрыт, экран молча опрашивает состояние. Никаких ошибок: если
// бэк недоступен, продолжаем ждать следующий тик.
const POLL_INTERVAL_MS = 10_000;

export function WhiteScreen() {
  useEffect(() => {
    let stopped = false;

    const check = async () => {
      try {
        const res = await fetch('/api/access', {
          cache: 'no-store',
          credentials: 'include',
        });
        if (stopped) return;
        // Сессия истекла — дальше покажет обычный сайт.
        if (res.status === 401) {
          window.location.replace('/');
          return;
        }
        if (!res.ok) return;
        const data = (await res.json()) as AccessResponse;
        // Дедлайн в прошлом — тоже блокировка (бэк кэширует состояние на 30 с).
        if (!stopped && !isAccessLockedState(data)) window.location.replace('/');
      } catch {
        // Сеть недоступна — ждём следующий тик.
      }
    };

    void check();
    const timer = setInterval(() => void check(), POLL_INTERVAL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <main
      role="status"
      aria-live="polite"
      className="flex min-h-dvh items-center justify-center bg-white"
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-500"
        />
        <span className="text-sm text-zinc-500">Загрузка…</span>
      </div>
    </main>
  );
}
