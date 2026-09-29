'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { House, Gamepad2, Wallet, Gift, Plus, Headphones } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthModal } from './AuthModal';
import { useTopUpModal } from './TopUpModal';
import { useUser } from './UserProvider';

// Верхняя шапка для мобилок (в стиле хаба)
export function MobileHeader() {
  const { openAuth } = useAuthModal();
  const { user, isLoading } = useUser();

  const initial = user ? user.name.trim().charAt(0).toUpperCase() || '?' : '';

  if (isLoading) {
    return (
      <header className="mnav-header">
        <div className="mnav-headerInner">
          <span className="mnav-brand" aria-hidden="true">
            <Image
              className="mnav-brandMark"
              width={27}
              height={27}
              alt=""
              src="/newVisual/brand-mark.svg"
              priority
            />
            <Image
              className="mnav-brandWordmark"
              width={76}
              height={14}
              alt=""
              src="/newVisual/wordmark.svg"
              priority
            />
          </span>
          <div className="mnav-headerActions animate-pulse" aria-hidden="true">
            <div className="h-11 w-11 rounded-[11px] bg-white/5" />
            <div className="h-11 w-11 rounded-[11px] bg-white/5" />
          </div>
        </div>
      </header>
    );
  }

  return (
    <header className="mnav-header">
      <div className="mnav-headerInner">
        <Link className="mnav-brand" href="/" aria-label="LITGAME — лобби">
          <Image
            className="mnav-brandMark"
            width={27}
            height={27}
            alt=""
            src="/newVisual/brand-mark.svg"
            priority
          />
          <Image
            className="mnav-brandWordmark"
            width={76}
            height={14}
            alt="LITGAME"
            src="/newVisual/wordmark.svg"
            priority
          />
        </Link>

        <div className="mnav-headerActions">
          {user ? (
            <>
              <Link href="/support" className="mnav-iconButton" aria-label="Поддержка">
                <Headphones aria-hidden="true" />
                <span className="mnav-inboxBadge">1</span>
              </Link>
              <Link href="/wallet" className="mnav-iconButton" aria-label="Открыть кошелёк">
                <span className="rail-avatar">{initial}</span>
              </Link>
            </>
          ) : (
            <>
              <button
                type="button"
                className="mnav-authSignin"
                onClick={() => openAuth('signin')}
              >
                Вход
              </button>
              <button
                type="button"
                className="mnav-authSignup"
                onClick={() => openAuth('signup')}
              >
                Регистрация
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

interface BottomNavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Путь, совпадение с которым подсвечивает пункт */
  match?: string;
}

// Нижняя плавающая плашка навигации: 2 ссылки + круглая «Пополнить» + 2 ссылки
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
    { label: 'Слоты', icon: Gamepad2, href: '/game/slots' },
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
        className="mnav-bottomLink"
        data-active={isActive}
        aria-current={isActive ? 'page' : undefined}
        aria-label={item.label}
      >
        <Icon aria-hidden="true" />
        <span>{item.label}</span>
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
    <nav aria-label="Основная навигация" className="mnav-bottomNav">
      {leftItems.map(renderItem)}

      <button
        type="button"
        className="mnav-deposit"
        onClick={handleDeposit}
        aria-label={user ? 'Пополнить баланс' : 'Зарегистрироваться'}
      >
        <span aria-hidden="true">
          <Plus strokeWidth={2.5} />
        </span>
        <strong>Пополнить</strong>
      </button>

      {rightItems.map(renderItem)}
    </nav>
  );
}
