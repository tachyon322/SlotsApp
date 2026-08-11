'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, Trophy, Star, TrendingUp, Check, Loader2 } from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useAuthModal } from '@/components/AuthModal';
import { bonusApi, type AchievementView, type BonusSummary } from '@/lib/api';
import { ProgressBar } from '@/components/bonuses/ProgressBar';
import { StatusBadge } from '@/components/bonuses/StatusBadge';

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

type Filter = 'all' | 'claim' | 'progress' | 'done';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'claim', label: 'Забрать' },
  { id: 'progress', label: 'В процессе' },
  { id: 'done', label: 'Получено' },
];

interface ItemCardProps {
  item: AchievementView;
  isChallenge?: boolean;
  claiming: boolean;
  onClaim: () => void;
}

function ItemCard({ item, isChallenge, claiming, onClaim }: ItemCardProps) {
  const done = item.status === 'claimed';
  const canClaim = item.status === 'completed';
  const tone = done ? 'green' : isChallenge ? 'violet' : 'gold';

  return (
    <li
      className="rounded-button border border-white/8 bg-white/[0.02] p-3"
      data-status={item.status}
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {item.emoji}
        </span>
        <div className="flex flex-1 flex-col min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-white">{item.title}</span>
            <StatusBadge status={item.status} claiming={claiming} />
          </div>
          <span className="mt-0.5 text-xs text-muted-foreground">{item.description}</span>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <span className="text-sm font-bold text-amber-300">{formatRub(item.reward)}</span>
          {canClaim ? (
            <button
              type="button"
              onClick={onClaim}
              disabled={claiming}
              className="inline-flex items-center justify-center gap-1 rounded-button bg-gradient-to-r from-emerald-500 to-emerald-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow hover:from-emerald-600 hover:to-emerald-700 transition-colors disabled:opacity-60"
            >
              {claiming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Забрать
            </button>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              {done ? 'Награда получена' : `Осталось: ${Math.max(0, item.target - item.progress)}`}
            </span>
          )}
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex-1">
          <ProgressBar percent={item.percent} tone={tone} />
        </div>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {isChallenge ? '' : `${item.progress} / ${item.target}  •  `}
          {item.percent}%
        </span>
      </div>
    </li>
  );
}

export default function AchievementsPage() {
  const { user, refresh: refreshUser } = useUser();
  const { openAuth } = useAuthModal();

  const [tab, setTab] = useState<'progress' | 'challenges'>('progress');
  const [filter, setFilter] = useState<Filter>('all');
  const [achievements, setAchievements] = useState<AchievementView[]>([]);
  const [challenges, setChallenges] = useState<AchievementView[]>([]);
  const [summary, setSummary] = useState<BonusSummary | null>(null);
  const [total, setTotal] = useState(0);
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const loadAchievements = useCallback(async () => {
    const res = await bonusApi.achievements();
    setAchievements(res.achievements);
    setSummary(res.summary);
    setTotal(res.total);
  }, []);

  const loadChallenges = useCallback(async () => {
    const res = await bonusApi.challenges();
    setChallenges(res.challenges);
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadAchievements();
    void loadChallenges();
  }, [user, loadAchievements, loadChallenges]);

  const handleClaim = async (item: AchievementView) => {
    if (!user) {
      openAuth('signin');
      return;
    }
    if (claimingId) return;
    setClaimingId(item.id);
    try {
      if (tab === 'challenges') {
        await bonusApi.claimChallenge(item.id);
        await loadChallenges();
      } else {
        await bonusApi.claimAchievement(item.id);
        await loadAchievements();
      }
      await refreshUser();
    } catch {
      // Ignore claim errors (e.g. already claimed elsewhere)
    } finally {
      setClaimingId(null);
    }
  };

  if (!user) {
    return (
      <main className="px-page max-[399px]:px-xs md:px-2xl pt-md md:pt-xl pb-2xl w-full">
        <div className="">
          <Link href="/bonuses" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-white">
            <ChevronLeft className="h-4 w-4" />
            Назад
          </Link>
          <div className="mt-4 rounded-panel border border-white/10 bg-white/[0.02] p-8 text-center text-sm text-muted-foreground">
            Войдите, чтобы смотреть достижения
          </div>
        </div>
      </main>
    );
  }

  const obtained = summary?.obtained ?? 0;
  const earned = summary?.earnedMoney ?? 0;
  const inProgress = summary?.inProgress ?? 0;

  const visible =
    tab === 'challenges'
      ? challenges
      : achievements.filter((a) => {
          if (filter === 'all') return true;
          if (filter === 'claim') return a.status === 'completed';
          if (filter === 'progress') return a.status === 'in_progress';
          return a.status === 'claimed';
        });

  return (
    <main className="px-page max-[399px]:px-xs md:px-2xl pt-md md:pt-xl pb-2xl w-full">
      <div className="">
        <Link
          href="/bonuses"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Назад
        </Link>

        <header className="mt-2 flex items-center gap-xs">
          <Trophy className="h-6 w-6 text-amber-400" />
          <h1 className="text-xl font-bold text-white">
            {tab === 'challenges' ? 'Челленджи' : 'Все достижения'}
          </h1>
        </header>
        <p className="mt-1 text-sm text-muted-foreground">
          {tab === 'challenges' ? 'Ежедневные задания — выполняй и забирай награды' : `${obtained} из ${total} получено`}
        </p>

        {/* Статистика */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="flex flex-col items-center gap-1 rounded-button border border-white/8 bg-white/[0.02] p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-button bg-emerald-500/10 text-emerald-400">
              <Check className="h-4 w-4" />
            </span>
            <span className="text-lg font-bold text-white">{obtained}</span>
            <span className="text-[11px] text-muted-foreground">Получено</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-button border border-white/8 bg-white/[0.02] p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-button bg-amber-400/10 text-amber-300">
              <Star className="h-4 w-4" />
            </span>
            <span className="text-lg font-bold text-white">{formatRub(earned)}</span>
            <span className="text-[11px] text-muted-foreground">Заработано</span>
          </div>
          <div className="flex flex-col items-center gap-1 rounded-button border border-white/8 bg-white/[0.02] p-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-button bg-blue-500/10 text-blue-400">
              <TrendingUp className="h-4 w-4" />
            </span>
            <span className="text-lg font-bold text-white">{inProgress}</span>
            <span className="text-[11px] text-muted-foreground">В процессе</span>
          </div>
        </div>

        {/* Вкладки */}
        <div className="mt-4 flex gap-1 rounded-button border border-white/8 bg-white/[0.02] p-1" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'progress'}
            onClick={() => setTab('progress')}
            className={`flex-1 rounded-button px-3 py-2 text-sm font-semibold transition-colors ${
              tab === 'progress' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'
            }`}
          >
            Прогресс
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === 'challenges'}
            onClick={() => setTab('challenges')}
            className={`flex-1 rounded-button px-3 py-2 text-sm font-semibold transition-colors ${
              tab === 'challenges' ? 'bg-white/10 text-white' : 'text-muted-foreground hover:text-white'
            }`}
          >
            Челленджи
          </button>
        </div>

        {/* Чипы-фильтры (только для достижений) */}
        {tab === 'progress' && (
          <div className="mt-3 flex gap-1.5 overflow-x-auto scrollbar-hide">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`whitespace-nowrap rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f.id
                    ? 'border-blue-400/40 bg-blue-500/10 text-blue-300'
                    : 'border-white/10 bg-white/[0.02] text-muted-foreground hover:text-white'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}

        {/* Список */}
        <ul className="mt-3 space-y-2">
          {visible.map((item) => (
            <ItemCard
              key={`${tab}-${item.id}`}
              item={item}
              isChallenge={tab === 'challenges'}
              claiming={claimingId === item.id}
              onClaim={() => handleClaim(item)}
            />
          ))}
          {visible.length === 0 && (
            <li className="rounded-button border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
              {tab === 'challenges' ? 'Сегодня заданий нет — загляните позже' : 'Здесь пока пусто'}
            </li>
          )}
        </ul>
      </div>
    </main>
  );
}
