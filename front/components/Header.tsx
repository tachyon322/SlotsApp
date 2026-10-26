'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ArrowUpFromLine, Headphones, Plus } from 'lucide-react';
import { useAuthModal } from './AuthModal';
import { useUser } from './UserProvider';
import { useTopUpModal } from './TopUpModal';
import { useWithdrawModal } from './WithdrawModal';
import { useWheelModal } from './WheelModal';

function formatBalance(balance: number): string {
  return `${balance.toLocaleString('ru-RU')} ₽`;
}

// Верхняя шапка: логотип, «Колесо наград», ссылки, баланс/вход
export function Header() {
  const { user, isLoading } = useUser();
  const { openAuth } = useAuthModal();
  const { openTopUp } = useTopUpModal();
  const { openWithdraw } = useWithdrawModal();
  const { openWheel } = useWheelModal();

  // Прогресс до следующего уровня — заглушка на основе XP
  const progress = user ? Math.min(100, Math.max(4, Math.round(user.xp % 100))) : 0;

  return (
    <header className="lg-hdr">
      <Link className="lg-logo" href="/" aria-label="STARX — лобби">
        <Image className="lg-mark" width={32} height={32} alt="" src="/lg/img/brand-mark.svg" priority />
        <Image className="lg-word" width={110} height={18} alt="STARX" src="/lg/img/wordmark.svg" priority />
      </Link>

      <button className="lg-btn-wheel" type="button" onClick={openWheel}>
        <Image width={56} height={56} alt="" src="/lg/img/wheel.webp" />
        <span>
          Колесо наград
          <small>Крутить бесплатно</small>
        </span>
      </button>

      <nav className="lg-hdr-links" aria-label="Разделы">
        <Link href="/bonuses">Бонусы</Link>
        <Link href="/faq">FAQ</Link>
      </nav>

      <div className="lg-hdr-right">
        {isLoading ? (
          <span className="lg-skel" aria-hidden="true" />
        ) : user ? (
          <>
            <div className="lg-bal">
              <span className="lg-coin" aria-hidden="true" />
              <b className="lg-num">{formatBalance(user.balance)}</b>
              <button className="lg-btn lg-btn-green" type="button" aria-label="Пополнить" onClick={openTopUp}>
                <Plus className="lg-i" aria-hidden="true" />
              </button>
            </div>
            <button
              className="lg-icon-btn"
              type="button"
              aria-label="Вывести"
              title="Вывести"
              onClick={openWithdraw}
            >
              <ArrowUpFromLine className="lg-i" aria-hidden="true" />
            </button>
            <Link className="lg-icon-btn lg-sup" href="/support" aria-label="Поддержка">
              <Headphones className="lg-i" aria-hidden="true" />
              <i className="lg-badge-count">1</i>
            </Link>
            <div className="lg-user">
              <span className="lg-user-meta">
                <b>{user.name}</b>
                <span className="lg-lvl">
                  Ур. {user.level}
                  <i style={{ '--lg-p': `${progress}%` } as React.CSSProperties} />
                </span>
              </span>
            </div>
          </>
        ) : (
          <>
            <button className="lg-btn lg-btn-ghost" type="button" onClick={() => openAuth('signin')}>
              Вход
            </button>
            <button className="lg-btn lg-btn-green" type="button" onClick={() => openAuth('signup')}>
              Регистрация
            </button>
          </>
        )}
      </div>
    </header>
  );
}
