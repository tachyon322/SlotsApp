'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Grid3x3, Wallet, Gift, Trophy, Plus } from 'lucide-react';
import { useAuthModal } from './AuthModal';
import { useTopUpModal } from './TopUpModal';
import { useUser } from './UserProvider';

function formatXp(xp: number): string {
  if (xp >= 1000) {
    return `${(xp / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(xp);
}

function formatBalance(balance: number): string {
  return `${balance.toLocaleString('ru-RU')} ₽`;
}

// Верхняя шапка для мобилок
export function MobileHeader() {
  const { openAuth } = useAuthModal();
  const { user, isLoading } = useUser();
  const { openTopUp } = useTopUpModal();

  const initial = user ? user.name.trim().charAt(0).toUpperCase() || '?' : '';

  if (isLoading) {
    return (
      <header className="md:hidden flex items-center justify-between px-page py-sm bg-background border-b border-sidebar-border sticky top-0 z-30">
        <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          LITGAME
        </span>
        <div className="flex items-center gap-xs animate-pulse" aria-hidden="true">
          <div className="h-9 w-9 rounded-pill bg-white/5" />
          <div className="h-9 w-24 rounded-pill bg-white/5" />
          <div className="h-9 w-9 rounded-pill bg-white/5" />
        </div>
      </header>
    );
  }

  return (
    <header className="md:hidden flex items-center justify-between gap-sm px-page py-sm bg-background border-b border-sidebar-border sticky top-0 z-30">
      {user ? (
        <>
          <div className="flex items-center gap-xs min-w-0">
            <Link
              href="/wallet"
              aria-label="Открыть профиль"
              className="relative flex shrink-0 overflow-hidden rounded-pill h-9 w-9 ring-2 ring-emerald-500/10"
            >
              <span className="flex h-full w-full items-center justify-center rounded-pill bg-emerald-500/10 text-emerald-400 font-semibold text-sm">
                {initial}
              </span>
            </Link>
            <div className="flex flex-col min-w-0 leading-tight">
              <div className="flex items-center gap-2xs min-w-0">
                <span className="text-sm font-bold truncate text-sidebar-foreground">
                  {user.name}
                </span>
                <span className="inline-flex items-center rounded-pill border border-transparent bg-sidebar-accent text-sidebar-foreground h-4 px-2xs text-[10px] font-semibold flex-shrink-0">
                  LVL {user.level}
                </span>
              </div>
              <div className="flex items-center gap-2xs text-xs text-muted-foreground">
                <Trophy className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{formatXp(user.xp)} XP</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-xs">
            <Link
              href="/wallet"
              aria-label="Открыть кошелёк"
              className="flex items-center gap-2xs px-sm py-2xs rounded-pill bg-white/5 border border-white/10 text-sm font-bold text-sidebar-foreground hover:bg-white/10 transition-colors"
            >
              <Wallet className="h-4 w-4 text-cyan-500 flex-shrink-0" />
              <span className="">{formatBalance(user.balance)}</span>
            </Link>
            <button
              onClick={openTopUp}
              aria-label="Пополнить баланс"
              title="Пополнить"
              className="h-9 w-9 rounded-pill bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow flex items-center justify-center flex-shrink-0 transition-colors"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
            LITGAME
          </span>
          <div className="flex items-center gap-xs">
            <button onClick={() => openAuth('signin')} className="text-xs font-semibold px-sm py-2xs text-white/80 hover:text-white">
              Вход
            </button>
            <button onClick={() => openAuth('signup')} className="text-xs font-semibold px-sm py-2xs rounded-button bg-blue-600 hover:bg-blue-500 text-white shadow-md">
              Регистрация
            </button>
          </div>
        </>
      )}
    </header>
  );
}

// Нижняя плавающая плашка навигации
export function MobileBottomNav() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Главная', icon: House, href: '/' },
    { label: 'Слоты', icon: Grid3x3, href: '/game/slots' },
    { label: 'Кошелек', icon: Wallet, href: '/wallet' },
    { label: 'Бонусы', icon: Gift, href: '/bonuses' },
  ];

  return (
    <nav 
      aria-label="Основная навигация" 
      className="md:hidden fixed left-0 right-0 z-50 px-page pointer-events-none bottom-md"
    >
      <div className="nav-glass-pill mx-auto max-w-[28rem] rounded-pill px-2xs py-2xs pointer-events-auto">
        <div className="flex items-center justify-around gap-2xs">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`relative py-2xs px-sm rounded-panel transition-all duration-300 flex flex-col items-center ${
                  isActive ? 'text-blue-400' : 'text-slate-400 hover:text-white'
                }`}
              >
                <div className="relative">
                  <Icon className={`h-5 w-5 transition-transform ${isActive ? 'scale-110' : ''}`} />
                </div>

                {/* Точечный индикатор активности под иконкой */}
                <div className="h-1.5 flex items-center justify-center">
                  {isActive && (
                    <div 
                      className="h-0.5 w-5 rounded-pill bg-blue-500" 
                      style={{ boxShadow: '0px 0px 8px rgba(59, 130, 246, 0.8)' }} 
                    />
                  )}
                </div>

                <span className={`text-[10px] ${isActive ? 'font-semibold opacity-100' : 'font-medium opacity-70'}`}>
                  {item.label}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
