'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  House, 
  Wallet, 
  Gift, 
  LayoutDashboard, 
  Sparkles, 
  Blocks, 
  Bomb, 
  Gamepad2,
  LogOut
} from 'lucide-react';
import { useAuthModal } from './AuthModal';
import { UserBlock } from './UserBlock';
import { SkeletonReveal } from './SkeletonReveal';
import { useUser } from './UserProvider';
import { authClient } from '@/lib/auth-client';

function SidebarUserSkeleton() {
  return (
    <div className="p-md border-b border-sidebar-border animate-pulse" aria-hidden="true">
      <div className="space-y-sm">
        <div className="flex items-center gap-sm">
          <div className="h-10 w-10 shrink-0 rounded-pill bg-white/5" />
          <div className="flex flex-col flex-1 gap-2xs">
            <div className="h-4 w-24 rounded bg-white/5" />
            <div className="h-3 w-16 rounded bg-white/5" />
          </div>
        </div>
        <div className="h-9 rounded-panel bg-white/5" />
        <div className="flex gap-xs">
          <div className="h-8 flex-1 rounded-control bg-white/5" />
          <div className="h-8 flex-1 rounded-control bg-white/5" />
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname(); // Получаем текущий путь (например, "/" или "/wallet")
  const { openAuth } = useAuthModal();
  const { user, isLoading, refresh } = useUser();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await authClient.signOut();
      await refresh();
    } finally {
      setSigningOut(false);
    }
  };

  const menuItems = [
    { title: "Главная", icon: House, href: "/" },
    { title: "Кошелек", icon: Wallet, href: "/wallet" },
    { title: "Бонусы", icon: Gift, href: "/bonuses", badge: true },
  ];

  const games = [
    { title: "Crash", icon: Gamepad2, href: "/game/crash" },
    { title: "Кейсы", icon: LayoutDashboard, href: "/game/cases" },
    { title: "Слоты", icon: Sparkles, href: "/game/slots" },
    { title: "Mines", icon: Bomb, href: "/game/mines" },
    { title: "MineDrop", icon: Gamepad2, href: "/game/minedrop" },
    { title: "Block Blast", icon: Blocks, href: "/game/blockblast" },
  ];

  return (
    <aside className="hidden md:flex fixed left-0 top-0 bottom-0 w-64 bg-sidebar border-r border-sidebar-border z-40 flex-col">
      {/* Логотип */}
      <div className="px-xl py-lg border-b border-sidebar-border">
        <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
          LITGAME
        </h2>
      </div>

      {/* Блок пользователя / авторизации */}
      {user ? (
        <SkeletonReveal pending={isLoading} skeleton={<SidebarUserSkeleton />}>
          <UserBlock user={user} />
        </SkeletonReveal>
      ) : isLoading ? (
        <SidebarUserSkeleton />
      ) : (
        <div className="p-md border-b border-sidebar-border">
          <div className="space-y-xs">
            <p className="text-sm text-muted-foreground mb-sm">Войдите, чтобы начать играть</p>
            <button onClick={() => openAuth('signup')} className="inline-flex items-center justify-center gap-xs whitespace-nowrap font-medium transition-colors h-8 rounded-control px-sm text-xs relative w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white overflow-hidden shadow">
              <span className="absolute inset-0 overflow-hidden rounded-control">
                <span className="absolute inset-0 -translate-x-full animate-[btn-shine_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent"></span>
              </span>
              <span className="relative z-10">Регистрация</span>
            </button>
            <button onClick={() => openAuth('signin')} className="inline-flex items-center justify-center gap-xs whitespace-nowrap font-medium transition-colors hover:bg-accent hover:text-accent-foreground h-8 rounded-control px-sm text-xs w-full">
              Вход
            </button>
          </div>
        </div>
      )}

      {/* Основное меню */}
      <nav className="flex-1 px-sm py-md space-y-2xs overflow-y-auto">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.title}
              href={item.href}
              className={`w-full flex items-center gap-sm px-sm py-xs rounded-button text-sm font-medium transition-colors ${
                isActive 
                  ? "bg-sidebar-accent text-sidebar-primary" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <Icon className="h-5 w-5 flex-shrink-0" />
              <span>{item.title}</span>
              {item.badge && (
                <span className="ml-auto w-2 h-2 bg-red-500 rounded-pill animate-pulse" />
              )}
            </Link>
          );
        })}

        {/* Раздел Игр */}
        <div className="pt-sm pb-2xs px-sm">
          <span className="text-xs font-semibold text-sidebar-foreground/40 uppercase tracking-wider">
            Игры
          </span>
        </div>

        {games.map((game) => {
          const Icon = game.icon;
          const isActive = pathname === game.href;

          return (
            <Link
              key={game.title}
              href={game.href}
              className={`w-full flex items-center gap-sm px-sm py-xs rounded-button text-sm font-medium transition-colors ${
                isActive 
                  ? "bg-sidebar-accent text-sidebar-primary" 
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              <Icon className="h-[18px] w-[18px] flex-shrink-0" />
              <span>{game.title}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-sm border-t border-sidebar-border space-y-2xs">
        {user && (
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="w-full flex items-center gap-sm px-sm py-xs rounded-button text-sm font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors"
          >
            <LogOut className="h-5 w-5 flex-shrink-0" />
            <span>{signingOut ? 'Выход...' : 'Выйти'}</span>
          </button>
        )}
      </div>
    </aside>
  );
}
