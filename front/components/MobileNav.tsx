'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Grid3x3, Wallet, Gift } from 'lucide-react';
import { useAuthModal } from './AuthModal';

// Верхняя шапка для мобилок
export function MobileHeader() {
  const { openAuth } = useAuthModal();

  return (
    <header className="md:hidden flex items-center justify-between px-page py-sm bg-background border-b border-sidebar-border sticky top-0 z-30">
      <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
        Swaga
      </span>
      <div className="flex items-center gap-xs">
        <button onClick={() => openAuth('signin')} className="text-xs font-semibold px-sm py-2xs text-white/80 hover:text-white">
          Вход
        </button>
        <button onClick={() => openAuth('signup')} className="text-xs font-semibold px-sm py-2xs rounded-button bg-blue-600 hover:bg-blue-500 text-white shadow-md">
          Регистрация
        </button>
      </div>
    </header>
  );
}

// Нижняя плавающая плашка навигации
export function MobileBottomNav() {
  const pathname = usePathname();

  const navItems = [
    { label: 'Главная', icon: House, href: '/' },
    { label: 'Слоты', icon: Grid3x3, href: '/slots' },
    { label: 'Кошелек', icon: Wallet, href: '/wallet' },
    { label: 'Бонусы', icon: Gift, href: '/bonuses' },
  ];

  return (
    <nav 
      aria-label="Основная навигация" 
      className="md:hidden fixed left-0 right-0 z-50 px-page pointer-events-none bottom-md"
    >
      <div className="nav-glass-pill mx-auto max-w-md rounded-pill px-2xs py-2xs pointer-events-auto">
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
