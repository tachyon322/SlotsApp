'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Gift,
  Flame,
  Trophy,
  LayoutGrid,
  ChevronRight,
  Check,
  Loader2,
  Clock,
  LogIn,
} from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useAuthModal } from '@/components/AuthModal';
import { bonusApi, type BonusesStatusResponse } from '@/lib/api';
import { ProgressBar } from '@/components/bonuses/ProgressBar';
import { DailyBonusModal } from '@/components/bonuses/DailyBonusModal';

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function ClaimButton({
  label,
  tone = 'green',
  onClick,
  loading,
  disabled,
}: {
  label: string;
  tone?: 'green' | 'ghost';
  onClick: () => void;
  loading?: boolean;
  disabled?: boolean;
}) {
  const base =
    'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-button px-3.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const cls =
    tone === 'green'
      ? `${base} bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow`
      : `${base} border border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/5`;
  return (
    <button type="button" onClick={onClick} disabled={disabled || loading} className={cls}>
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {label}
    </button>
  );
}

function DonePill() {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-semibold text-emerald-400">
      <Check className="h-3.5 w-3.5" />
      Получено
    </span>
  );
}

export default function BonusesPage() {
  const { user, refresh: refreshUser } = useUser();
  const { openAuth } = useAuthModal();

  const [status, setStatus] = useState<BonusesStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await bonusApi.status();
      setStatus(data);
    } catch {
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void load();
    } else {
      setLoading(false);
    }
  }, [user, load]);

  const handleClaim = async (type: 'daily' | 'welcome' | 'install') => {
    if (!user) {
      openAuth('signin');
      return;
    }
    if (claiming) return;
    setClaiming(type);
    try {
      if (type === 'daily') await bonusApi.claimDaily();
      else if (type === 'welcome') await bonusApi.claimWelcome();
      else await bonusApi.claimInstall();
      await refreshUser();
      await load();
    } catch {
      await load();
    } finally {
      setClaiming(null);
    }
  };

  if (!user) {
    return (
      <main className="px-page max-[399px]:px-xs md:px-2xl pt-md md:pt-xl pb-2xl w-full">
        <div className="">
          <h1 className="text-2xl font-bold text-white">Бонусы</h1>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-panel border border-white/10 bg-white/[0.02] p-8 text-center">
            <Gift className="h-10 w-10 text-blue-400" />
            <p className="text-sm text-muted-foreground">
              Войдите, чтобы получать бонусы и награды за задания
            </p>
            <button
              type="button"
              onClick={() => openAuth('signin')}
              className="inline-flex items-center gap-1 rounded-button bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2 text-sm font-semibold text-white shadow"
            >
              <LogIn className="h-4 w-4" />
              Войти
            </button>
          </div>
        </div>
      </main>
    );
  }

  if (loading || !status) {
    return (
      <main className="px-page max-[399px]:px-xs md:px-2xl pt-md md:pt-xl pb-2xl w-full">
        <div className=" space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-panel bg-white/5" />
          ))}
        </div>
      </main>
    );
  }

  const { level, daily, welcome, install, preview } = status;

  return (
    <main className="px-page max-[399px]:px-xs md:px-2xl pt-md md:pt-xl pb-2xl w-full">
      <div className="">
        <div className="flex items-center gap-xs">
          <Gift className="h-5 w-5 text-blue-400" />
          <h1 className="text-xl font-bold text-white">Бонусы</h1>
        </div>

        <div className="mt-4 space-y-3">
          {/* Уровень */}
          <section className="bonus-card bonus-card__column" data-accent="orange" aria-label={`Уровень ${level.level}`}>
            <span className="bonus-accent-line" data-accent="orange" aria-hidden="true" />
            <div className="flex items-center gap-sm">
              <span className="bonus-icon-square" data-accent="orange" aria-hidden="true">
                <Trophy />
              </span>
              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="bonus-title">Уровень {level.level}</span>
                  <span className="text-xs font-semibold text-white/70">
                    {level.xp.toLocaleString('ru-RU')} / {level.xpToNext.toLocaleString('ru-RU')} XP
                  </span>
                </div>
                <ProgressBar percent={level.progress} tone="orange" />
                <div className="flex items-center justify-between">
                  <span className="bonus-subtitle">Прогресс: {level.progress}%</span>
                  <span className="text-xs font-bold text-orange-400">
                    Награда: {formatRub(level.nextReward)}
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* Ежедневный бонус */}
          <section className="bonus-card" data-accent="blue" aria-label="Ежедневный бонус">
            <span className="bonus-accent-line" data-accent="blue" aria-hidden="true" />
            <span className="bonus-icon-square" data-accent="blue" aria-hidden="true">
              <Gift />
            </span>
            <div className="flex flex-1 flex-col min-w-0">
              <span className="flex items-center gap-1.5">
                <span className="bonus-title">Ежедневный бонус</span>
                {daily.streak > 0 && (
                  <span className="inline-flex items-center gap-0.5 rounded-pill bg-orange-500/10 border border-orange-500/25 px-1.5 py-0.5 text-[11px] font-bold text-orange-400">
                    <Flame className="h-3 w-3" />
                    {daily.streak}
                  </span>
                )}
              </span>
              <span
                className={`bonus-subtitle inline-flex items-center gap-1 ${
                  daily.claimedToday ? '' : 'text-emerald-400'
                }`}
              >
                {daily.claimedToday ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Бонус за сегодня получен
                  </>
                ) : (
                  <>
                    <Clock className="h-3.5 w-3.5" />
                    Бонус доступен: {formatRub(daily.amount)}
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => setDailyOpen(true)}
                className="rounded-button border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/5 transition-colors"
              >
                Просмотр
              </button>
              <ClaimButton
                label={daily.claimedToday ? 'Получено' : 'Забрать'}
                tone={daily.claimedToday ? 'ghost' : 'green'}
                onClick={() => handleClaim('daily')}
                loading={claiming === 'daily'}
                disabled={daily.claimedToday}
              />
            </div>
          </section>

          {/* Приветственный бонус */}
          <section className="bonus-card" data-accent="violet" aria-label="Приветственный бонус">
            <span className="bonus-accent-line" data-accent="violet" aria-hidden="true" />
            <span className="bonus-icon-square" data-accent="violet" aria-hidden="true">
              <Gift />
            </span>
            <div className="flex flex-1 flex-col min-w-0">
              <span className="bonus-title">Приветственный бонус</span>
              <span className="bonus-subtitle">Для новых игроков</span>
              <span className="mt-0.5 text-sm font-bold text-violet-400">
                {formatRub(welcome.amount)}
              </span>
            </div>
            <div className="flex-shrink-0">
              {welcome.claimed ? (
                <DonePill />
              ) : (
                <ClaimButton
                  label="Забрать"
                  onClick={() => handleClaim('welcome')}
                  loading={claiming === 'welcome'}
                />
              )}
            </div>
          </section>

          {/* Установите приложение */}
          <section className="bonus-card" data-accent="slate" aria-label="Установите приложение">
            <span className="bonus-accent-line" data-accent="slate" aria-hidden="true" />
            <span className="bonus-icon-square" data-accent="slate" aria-hidden="true">
              <LayoutGrid />
            </span>
            <div className="flex flex-1 flex-col min-w-0">
              <span className="bonus-title">Установите приложение</span>
              <span className="bonus-subtitle">Добавьте иконку на экран</span>
              <span className="mt-0.5 text-sm font-bold text-emerald-400">
                +{formatRub(install.amount)}
              </span>
            </div>
            <div className="flex-shrink-0">
              {install.claimed ? (
                <DonePill />
              ) : (
                <ClaimButton
                  label="Забрать"
                  onClick={() => handleClaim('install')}
                  loading={claiming === 'install'}
                />
              )}
            </div>
          </section>

          {/* Достижения */}
          <section className="rounded-panel border border-white/8 bg-white/[0.02] p-4" aria-label="Достижения">
            <header className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-400" />
              <h2 className="text-base font-bold text-white">Достижения</h2>
            </header>
            <p className="mt-1 text-xs text-muted-foreground">
              Выполняйте задания и получайте награды
            </p>

            {preview.length > 0 ? (
              <div className="mt-3 space-y-2">
                {preview.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center gap-2.5 rounded-button border border-white/8 bg-white/[0.02] p-2.5"
                  >
                    <span className="text-xl" aria-hidden="true">
                      {a.emoji}
                    </span>
                    <div className="flex flex-1 flex-col min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-white">{a.title}</span>
                        <span className="rounded-pill bg-amber-400/10 border border-amber-400/25 px-1.5 py-0.5 text-[11px] font-semibold text-amber-300">
                          {formatRub(a.reward)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1">
                          <ProgressBar percent={100} tone="gold" />
                        </div>
                        <span className="text-[11px] text-muted-foreground">
                          {a.progress} / {a.target}
                        </span>
                      </div>
                    </div>
                    <Link
                      href="/bonuses/achievements"
                      className="inline-flex items-center gap-1 rounded-button bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow"
                    >
                      Забрать
                    </Link>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-3 rounded-button border border-dashed border-white/10 p-3 text-center text-xs text-muted-foreground">
                Пока нет выполненных достижений — играйте и возвращайтесь!
              </p>
            )}

            <Link
              href="/bonuses/achievements"
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300"
            >
              Все достижения
              <ChevronRight className="h-4 w-4" />
            </Link>
          </section>
        </div>
      </div>

      <DailyBonusModal
        open={dailyOpen}
        onClose={() => setDailyOpen(false)}
        cycle={daily.cycle}
        streak={daily.streak}
        claimedToday={daily.claimedToday}
      />
    </main>
  );
}
