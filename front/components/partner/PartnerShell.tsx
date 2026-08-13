'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, LayoutGrid, Lock, LogOut, Settings, User, Wallet, Zap } from 'lucide-react';
import { partnerApi, type AffiliatePartner } from '@/lib/api';
import { formatRub } from '@/components/partner/format';
import { btnPrimary, inputClass } from '@/components/partner/ui';
import { cn } from '@/lib/utils';
import {
  readPartnerTokenCookie,
  setPartnerTokenCookie,
  clearPartnerTokenCookie,
} from '@/lib/partner-auth';

const TOKEN_KEY = 'partner_token';
const PROFILE_KEY = 'partner_profile';

export interface PartnerAuth {
  token: string;
  partner: AffiliatePartner;
}

const PartnerAuthContext = createContext<PartnerAuth | null>(null);

export function usePartnerAuth(): PartnerAuth {
  const ctx = useContext(PartnerAuthContext);
  if (!ctx) {
    throw new Error('usePartnerAuth must be used within <PartnerShell>');
  }
  return ctx;
}

interface PartnerShellProps {
  initialToken?: string | null;
  initialPartner?: AffiliatePartner | null;
  children: ReactNode;
}

export function PartnerShell({ initialToken, initialPartner, children }: PartnerShellProps) {
  const [token, setToken] = useState<string | null>(initialToken ?? null);
  const [partner, setPartner] = useState<AffiliatePartner | null>(initialPartner ?? null);
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [registered, setRegistered] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) setToken(saved);
    if (!initialPartner) {
      const savedProfile = localStorage.getItem(PROFILE_KEY);
      if (savedProfile) {
        try {
          setPartner(JSON.parse(savedProfile) as AffiliatePartner);
        } catch {
          // ignore
        }
      }
    }
    if (!saved) {
      const cookieToken = readPartnerTokenCookie();
      if (cookieToken) {
        localStorage.setItem(TOKEN_KEY, cookieToken);
        setToken(cookieToken);
      }
    }
  }, [initialPartner]);

  const handleLogin = async () => {
    const e = email.trim();
    if (!e || !password) return;
    setLoggingIn(true);
    setError(null);
    try {
      const res = await partnerApi.login(e, password);
      localStorage.setItem(TOKEN_KEY, res.token);
      localStorage.setItem(PROFILE_KEY, JSON.stringify(res.partner));
      setPartnerTokenCookie(res.token);
      setToken(res.token);
      setPartner(res.partner);
      setPassword('');
      setEmail('');
      setName('');
    } catch (err) {
      setError((err as Error).message || 'Не удалось войти');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleRegister = async () => {
    const n = name.trim();
    const e = email.trim();
    if (!n || !e || !password) return;
    setLoggingIn(true);
    setError(null);
    try {
      await partnerApi.register(n, e, password);
      setRegistered(true);
      setMode('login');
      setError(null);
      setPassword('');
      setEmail('');
      setName('');
    } catch (err) {
      setError((err as Error).message || 'Не удалось зарегистрироваться');
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(PROFILE_KEY);
    clearPartnerTokenCookie();
    setToken(null);
    setPartner(null);
  };

  if (registered) {
    return (
      <main className="flex min-h-dvh items-center justify-center px-page py-2xl">
        <div className="w-full max-w-[28rem] rounded-card border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Партнёрская панель</h2>
          </div>
          <h3 className="mt-4 text-base font-bold text-white">Заявка отправлена</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Аккаунт появится в панели после того, как владелец одобрит регистрацию. Как только доступ будет открыт, вы
            сможете войти.
          </p>
          <button type="button" className={cn(btnPrimary, 'mt-5 w-full')} onClick={() => setRegistered(false)}>
            Вернуться ко входу
          </button>
        </div>
      </main>
    );
  }

  if (!token || !partner) {
    const isRegister = mode === 'register';
    const submit = (e: React.FormEvent) => {
      e.preventDefault();
      if (isRegister) void handleRegister();
      else void handleLogin();
    };

    return (
      <main className="flex min-h-dvh items-center justify-center px-page py-2xl">
        <div className="w-full max-w-[28rem] rounded-card border border-white/10 bg-white/[0.02] p-6">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Партнёрская панель</h2>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isRegister ? 'Зарегистрируйтесь, чтобы начать зарабатывать' : 'Войдите в аккаунт веб-партнёра'}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {isRegister && (
              <div className="relative">
                <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
                <input
                  className={cn(inputClass, 'pl-10')}
                  placeholder="Имя"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                />
              </div>
            )}
            <div className="relative">
              <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                className={cn(inputClass, 'pl-10')}
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="relative">
              <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                type="password"
                className={cn(inputClass, 'pl-10')}
                placeholder="Пароль"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isRegister ? 'new-password' : 'current-password'}
              />
            </div>

            {error && <p className="text-xs text-red-400">{error}</p>}

            <button type="submit" disabled={loggingIn} className={cn(btnPrimary, 'w-full')}>
              {isRegister ? 'Зарегистрироваться' : 'Войти'}
            </button>

            <div className="text-center">
              <button
                type="button"
                onClick={() => {
                  setMode(isRegister ? 'login' : 'register');
                  setError(null);
                }}
                className="text-xs font-semibold text-blue-400 transition-colors hover:text-blue-300"
              >
                {isRegister ? 'Уже есть аккаунт? Войти' : 'Нет аккаунта? Зарегистрироваться'}
              </button>
            </div>
          </form>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <PartnerAuthContext.Provider value={{ token, partner }}>
        <PartnerHeader partner={partner} onLogout={handleLogout} />
        <main className="px-page pt-md pb-2xl w-full">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </PartnerAuthContext.Provider>
    </div>
  );
}

function PartnerHeader({ partner, onLogout }: { partner: AffiliatePartner; onLogout: () => void }) {
  const pathname = usePathname();

  const items = [
    { label: 'Офферы', href: '/partner', icon: LayoutGrid, active: pathname === '/partner' },
    { label: 'Статистика', href: '/partner/stats', icon: BarChart3, active: pathname.startsWith('/partner/stats') },
    { label: 'Выплаты', href: '/partner/payout', icon: Wallet, active: pathname.startsWith('/partner/payout') },
    ...(partner.isOwner
      ? [{ label: 'Настройки', href: '/partner/settings', icon: Settings, active: pathname.startsWith('/partner/settings') }]
      : []),
  ];

  return (
    <header className="sticky top-0 z-30 border-b border-sidebar-border bg-background">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-page py-sm">
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/partner" className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-bold text-white">
              LITGAME <span className="text-white/40">· Партнёрка</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-button px-sm py-xs text-sm font-medium transition-colors',
                    item.active
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-sm text-white/80">
            {partner.name}
            {partner.isOwner ? <span className="text-blue-400"> · владелец</span> : null}
          </span>
          <span className="rounded-pill bg-blue-500/15 px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-blue-400">
            {formatRub(partner.balance)}
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Выйти
          </button>
        </div>
      </div>
    </header>
  );
}
