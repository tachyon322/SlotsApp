'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutGrid,
  Gamepad2,
  WalletCards,
  Gift,
  Trophy,
  Headphones,
  ArrowUpRight,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuthModal } from './AuthModal';
import { useUser } from './UserProvider';
import { useTopUpModal } from './TopUpModal';
import { useWithdrawModal } from './WithdrawModal';
import { useWheelModal } from './WheelModal';
import { SkeletonReveal } from './SkeletonReveal';

interface NavItem {
  label: string;
  icon: LucideIcon;
  href: string;
  /** Путь, совпадение с которым подсвечивает пункт */
  match?: string;
  badge?: number;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Лобби', icon: LayoutGrid, href: '/', match: '/' },
  { label: 'Игры', icon: Gamepad2, href: '/#games', match: '/game' },
  { label: 'Кошелёк', icon: WalletCards, href: '/wallet' },
  { label: 'Бонусы', icon: Gift, href: '/bonuses' },
  // Отдельной страницы достижений пока нет — ведём в бонусы
  { label: 'Достижения', icon: Trophy, href: '/bonuses/achievements', match: '/bonuses/achievements' },
  { label: 'Поддержка', icon: Headphones, href: '/support', badge: 1 },
];

function formatBalance(balance: number): string {
  return `${balance.toLocaleString('ru-RU')} ₽`;
}

function RailProfileSkeleton() {
  return (
    <div className="rail-profile animate-pulse" aria-hidden="true">
      <span className="rail-avatar" />
      <span className="rail-profileDetails">
        <span className="block h-2 w-24 rounded bg-white/10" />
        <span className="block h-2 w-14 rounded bg-white/10" />
        <span className="mt-1 block h-[2px] w-full rounded-full bg-white/10" />
      </span>
    </div>
  );
}

function RailGuestBlock() {
  const { openAuth } = useAuthModal();

  return (
    <div className="rail-guest">
      <p className="rail-guestText">Войдите, чтобы начать играть</p>
      <button type="button" className="rail-guestSignup" onClick={() => openAuth('signup')}>
        Регистрация
      </button>
      <button type="button" className="rail-guestSignin" onClick={() => openAuth('signin')}>
        Вход
      </button>
    </div>
  );
}

function RailProfile({ name, id, level, xp }: { name: string; id: string; level: number; xp: number }) {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  const idSuffix = id.slice(-4);
  // Прогресс до следующего уровня — заглушка на основе XP (как 52% в эталоне)
  const progress = Math.min(100, Math.max(4, Math.round(xp % 100)));

  return (
    // TODO: повесить открытие профиля, когда появится страница/модалка профиля
    <div className="rail-profile">
      <span className="rail-avatar" aria-hidden="true">{initial}</span>
      <span className="rail-profileDetails">
        <span className="rail-profileName">{name}</span>
        <span className="rail-profileId">ID ••••{idSuffix}</span>
        <span className="rail-profileLevel">Уровень {level}</span>
        <span className="rail-profileProgress" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </span>
      </span>
    </div>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, isLoading } = useUser();
  const { openTopUp } = useTopUpModal();
  const { openWithdraw } = useWithdrawModal();
  const { openWheel } = useWheelModal();

  return (
    <aside className="rail" aria-label="Навигация LITGAME">
      {/* Бренд */}
      <Link className="rail-brand" href="/" aria-label="LITGAME — лобби">
        <Image
          className="rail-brandMark"
          width={29}
          height={29}
          alt=""
          src="/newVisual/brand-mark.svg"
          priority
        />
        <Image
          className="rail-brandWordmark"
          width={111}
          height={21}
          alt="LITGAME"
          src="/newVisual/wordmark.svg"
          priority
        />
      </Link>

      {/* Разделы */}
      <nav className="rail-nav" aria-label="Разделы LITGAME">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const match = item.match ?? item.href;
          const isActive =
            match === '/'
              ? pathname === '/'
              : pathname === match || pathname.startsWith(`${match}/`);

          return (
            <Link
              key={item.label}
              className="rail-navLink"
              href={item.href}
              data-active={isActive}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
            >
              <Icon className="rail-navIcon" strokeWidth={1.8} aria-hidden="true" />
              <span className="rail-navLabel">{item.label}</span>
              {item.badge ? <span className="rail-navBadge">{item.badge}</span> : null}
            </Link>
          );
        })}
      </nav>

      {/* Профиль / гость */}
      {user ? (
        <SkeletonReveal pending={isLoading} skeleton={<RailProfileSkeleton />}>
          <RailProfile name={user.name} id={user.id} level={user.level} xp={user.xp} />
        </SkeletonReveal>
      ) : isLoading ? (
        <RailProfileSkeleton />
      ) : (
        <RailGuestBlock />
      )}

      {/* Баланс */}
      <div className="rail-balance">
        <span className="rail-balanceLabel">Баланс</span>
        <Link
          className="rail-balanceAmount"
          href="/wallet"
          aria-label={user ? `Баланс ${formatBalance(user.balance)}` : 'Баланс'}
        >
          {user ? formatBalance(user.balance) : '0 ₽'}
          <ArrowUpRight aria-hidden="true" />
        </Link>
        <div className="rail-moneyActions">
          <button type="button" onClick={openTopUp}>Пополнить</button>
          <button type="button" onClick={openWithdraw}>Вывести</button>
        </div>
      </div>

      {/* Промо «Колесо наград» */}
      <button type="button" className="rail-wheelPromo" onClick={openWheel}>
        <span className="rail-wheelCopy">
          <strong>Колесо наград</strong>
          <small>Открыть колесо</small>
        </span>
        <span className="rail-wheelArtworkSlot" aria-hidden="true">
          <Image
            className="rail-wheelArtwork"
            width={61}
            height={61}
            alt=""
            src="/newVisual/wheel-of-fortune-object-128w.webp"
          />
        </span>
      </button>

      <div className="rail-footer" aria-label="LITGAME Web">
        <span>© 2026 LITGAME</span>
      </div>
    </aside>
  );
}
