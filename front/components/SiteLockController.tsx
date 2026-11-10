'use client';

import { useEffect } from 'react';
import {
  SITE_LOCK_KEY,
  guardAccess,
  hasSiteLockFlag,
  isSiteLockExempt,
  isSiteLockShowing,
  markSiteLock,
} from '@/lib/site-lock';

/**
 * Держит прелоадер синхронным с флагом в localStorage.
 *
 * Поллинг не нужен: при открытии прелоадера делается ровно один запрос
 * /api/access. Если сессия протухла (401) или бэк недоступен — остаёмся на
 * прелоадере, пока данные сайта не почистят.
 *
 * Флаг ставится в двух случаях: прелоадер отрисован (middleware rewrite или
 * прямой заход) и в localStorage уже лежит отметка (документ прилетел с
 * протухшей сессией, сервер про флаг не знает).
 */
export function SiteLockController() {
  useEffect(() => {
    if (isSiteLockExempt(window.location.pathname)) return;

    const preloadRendered = Boolean(document.getElementById('site-lock-route'));
    const flagged = hasSiteLockFlag();

    // Обычная живая страница без отметки: серверных проверок не делаем вообще.
    if (!preloadRendered && !flagged) return;

    if (flagged) markSiteLock();

    let cancelled = false;
    void (async () => {
      if (cancelled) return;
      await guardAccess();
    })();

    // Блок в соседней вкладке — закрываемся здесь тоже, без ожидания клика.
    const onStorage = (event: StorageEvent) => {
      if (event.key !== SITE_LOCK_KEY || !event.newValue) return;
      if (isSiteLockShowing() && document.getElementById('site-lock-route')) return;
      markSiteLock();
      window.location.reload();
    };

    window.addEventListener('storage', onStorage);
    return () => {
      cancelled = true;
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return null;
}
