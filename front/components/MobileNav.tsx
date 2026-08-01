'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Grid3x3, Wallet, Gift } from 'lucide-react';

// Верхняя шапка для мобилок
export function MobileHeader() {
  return (
    <header className="md:hidden flex items-center justify-between px-4 py-3 bg-background border-b border-sidebar-border sticky top-0 z-30">
      <span className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
        Swaga
      </span>
      <div className="flex items-center gap-2">
        <button className="text-xs font-semibold px-3 py-1.5 text-white/80 hover:text-white">
          Вход
        </button>
        <button className="text-xs font-semibold px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white shadow-md">
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
      className="md:hidden fixed left-0 right-0 z-50 px-4 pointer-events-none bottom-4"
    >
      <div className="nav-glass-pill mx-auto max-w-md rounded-full px-1.5 py-1 pointer-events-auto">
        <div className="flex items-center justify-around gap-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`relative py-1 px-3 rounded-xl transition-all duration-300 flex flex-col items-center ${
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
                      className="h-0.5 w-5 rounded-full bg-blue-500" 
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