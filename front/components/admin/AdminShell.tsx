'use client';

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Loader2, Lock, LogOut, Shield } from 'lucide-react';
import { adminApi, ApiError } from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

const TOKEN_KEY = 'admin_token';

interface AdminShellProps {
  children: (auth: { token: string }) => ReactNode;
}

export function AdminShell({ children }: AdminShellProps) {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) return;
    setLoggingIn(true);
    try {
      await adminApi.stats(password.trim());
      localStorage.setItem(TOKEN_KEY, password.trim());
      setToken(password.trim());
      setPassword('');
      showSuccess('Вход выполнен');
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        showError('Неверный пароль');
      } else {
        showError((err as Error).message);
      }
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  };

  if (!token) {
    return (
      <main className="px-page pt-md pb-2xl w-full min-h-dvh flex items-center justify-center">
        <form
          onSubmit={handleLogin}
          className="w-full flex flex-col gap-3 rounded-panel border border-white/10 bg-white/[0.02] p-6"
        >
          <div className="flex items-center gap-xs">
            <Shield className="h-5 w-5 text-blue-400" />
            <h1 className="text-xl font-bold text-white">Админ-панель</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Lock className="h-4 w-4" />
            Введите пароль администратора
          </div>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Пароль"
            autoComplete="current-password"
            className="w-full rounded-button border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white placeholder:text-white/30 focus:border-blue-500 focus:outline-none"
          />
          <button
            type="submit"
            disabled={loggingIn || !password.trim()}
            className="inline-flex items-center justify-center gap-1 rounded-button bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow transition-colors hover:from-blue-600 hover:to-blue-700 disabled:opacity-50"
          >
            {loggingIn && <Loader2 className="h-4 w-4 animate-spin" />}
            Войти
          </button>
        </form>
      </main>
    );
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-sidebar-border bg-background px-page py-sm">
        <div className="flex items-center gap-xs">
          <Shield className="h-5 w-5 text-blue-400" />
          <span className="text-sm font-bold text-white">
            LITGAME <span className="text-white/40">·</span> Админ
          </span>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/5"
        >
          <LogOut className="h-3.5 w-3.5" />
          Выйти
        </button>
      </header>

      {children({ token })}
    </div>
  );
}
