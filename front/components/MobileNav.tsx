'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { House, Headphones, Wallet, Gift, Plus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthModal } from './AuthModal';
import { useTopUpModal } from './TopUpModal';
import { useUser } from './UserProvider';

interface BottomNavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Путь, совпадение с которым подсвечивает пункт */
  match?: string;
}

// Нижняя плавающая плашка навигации (≤1199px): 2 ссылки + «Пополнить» + 2 ссылки
export function MobileBottomNav() {
  const pathname = usePathname();
  const { openAuth } = useAuthModal();
  const { user } = useUser();
  const { openTopUp } = useTopUpModal();

  // Не перекрываем композер чата на странице поддержки
  if (pathname.startsWith('/support')) {
    return null;
  }

  const leftItems: BottomNavItem[] = [
    { label: 'Главная', icon: House, href: '/', match: '/' },
    { label: 'Помощь', icon: Headphones, href: '/support' },
  ];
  const rightItems: BottomNavItem[] = [
    { label: 'Кошелёк', icon: Wallet, href: '/wallet' },
    { label: 'Бонусы', icon: Gift, href: '/bonuses' },
  ];

  const renderItem = (item: BottomNavItem) => {
    const Icon = item.icon;
    const match = item.match ?? item.href;
    const isActive = match === '/' ? pathname === '/' : pathname.startsWith(match);

    return (
      <Link
        key={item.label}
        href={item.href}
        data-active={isActive}
        aria-current={isActive ? 'page' : undefined}
      >
        <Icon className="lg-i" aria-hidden="true" />
        {item.label}
      </Link>
    );
  };

  const handleDeposit = () => {
    if (user) {
      openTopUp();
    } else {
      openAuth('signup');
    }
  };

  return (
    <nav aria-label="Основная навигация" className="lg-tabbar">
      {leftItems.map(renderItem)}

      <button
        type="button"
        className="lg-dep"
        onClick={handleDeposit}
        aria-label={user ? 'Пополнить баланс' : 'Зарегистрироваться'}
      >
        <span aria-hidden="true">
          <Plus className="lg-i" strokeWidth={2.5} />
        </span>
        Пополнить
      </button>

      {rightItems.map(renderItem)}
    </nav>
  );
}
