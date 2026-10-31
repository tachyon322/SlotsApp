'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { AlertCircle, ChevronRight, Flame, Gift, Sparkles } from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useAuthModal } from '@/components/AuthModal';
import {
  bonusApi,
  referralApi,
  type AchievementView,
  type BonusesStatusResponse,
  type ReferralsStatusResponse,
} from '@/lib/api';
import { formatRub, pluralRu } from '@/lib/format';
import { showError, showSuccess } from '@/lib/toast';
import { track } from '@/lib/analytics';
import { DailyTrack } from '@/components/bonuses/DailyTrack';
import { LevelCard } from '@/components/bonuses/LevelCard';
import { InviteCard } from '@/components/bonuses/InviteCard';
import { TaskList, type TaskKey } from '@/components/bonuses/TaskList';
import { AchievementTile } from '@/components/bonuses/AchievementTile';
import { InviteFriendsSheet } from '@/components/bonuses/InviteFriendsSheet';

const GUEST_LEVEL: BonusesStatusResponse['level'] = { level: 1, xp: 0, xpToNext: 100, progress: 0, nextReward: 150 };

type ClaimKey = 'daily' | TaskKey | `achievement:${string}`;

function errorText(e: unknown): string {
  return e instanceof Error && e.message ? e.message : 'Не удалось получить награду';
}

// Лента достижений: сначала готовые к получению, затем ближайшие к выполнению
function stripOf(list: AchievementView[]): AchievementView[] {
  const rank = (a: AchievementView) => (a.status === 'completed' ? 0 : a.status === 'in_progress' ? 1 : 2);
  return [...list].sort((a, b) => rank(a) - rank(b) || b.percent - a.percent).slice(0, 8);
}

export default function BonusesPage() {
  const { user, isLoading: userLoading, refresh: refreshUser } = useUser();
  const { openAuth } = useAuthModal();

  const [status, setStatus] = useState<BonusesStatusResponse | null>(null);
  const [challenges, setChallenges] = useState<AchievementView[] | null>(null);
  const [achievements, setAchievements] = useState<AchievementView[] | null>(null);
  const [referral, setReferral] = useState<ReferralsStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [claiming, setClaiming] = useState<ClaimKey | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const load = useCallback(async () => {
    const [st, ch, ach, ref] = await Promise.allSettled([
      bonusApi.status(),
      bonusApi.challenges(),
      bonusApi.achievements(),
      referralApi.status(),
    ]);
    if (st.status === 'fulfilled') {
      setStatus(st.value);
      setLoadError(false);
    } else {
      setLoadError(true);
    }
    if (ch.status === 'fulfilled') setChallenges(ch.value.challenges);
    if (ach.status === 'fulfilled') setAchievements(ach.value.achievements);
    if (ref.status === 'fulfilled') setReferral(ref.value);
  }, []);

  // Зависим от id, а не от объекта: refreshUser() после получения награды отдаёт новый
  // объект пользователя, и перезагрузка со скелетоном сбросила бы анимацию бонуса дня
  const userId = user?.id ?? null;
  useEffect(() => {
    if (userLoading) return;
    if (!userId) {
      setStatus(null);
      setChallenges(null);
      setAchievements(null);
      setReferral(null);
      setLoadError(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    void load().finally(() => setLoading(false));
  }, [userId, userLoading, load]);

  const login = () => openAuth('signin');

  // Общий сценарий получения награды: запрос → тост → баланс и статусы заново
  const runClaim = async (key: ClaimKey, request: () => Promise<{ reward: number }>, label: string) => {
    if (!user) {
      login();
      return null;
    }
    if (claiming) return null;
    setClaiming(key);
    try {
      const { reward } = await request();
      track('bonus_claim', { type: key });
      showSuccess(`${label}: +${formatRub(reward)}`);
      await Promise.all([refreshUser(), load()]);
      return reward;
    } catch (e) {
      showError(errorText(e));
      await load();
      return null;
    } finally {
      setClaiming(null);
    }
  };

  const claimDaily = () => runClaim('daily', bonusApi.claimDaily, 'Ежедневный бонус');

  const claimTask = (key: TaskKey) => {
    if (key === 'welcome') return void runClaim(key, () => bonusApi.claimWelcome(), 'Приветственный бонус');
    if (key === 'install') return void runClaim(key, bonusApi.claimInstall, 'Задание выполнено');
    const id = key.slice('challenge:'.length);
    void runClaim(key, () => bonusApi.claimChallenge(id), 'Задание дня');
  };

  const claimAchievement = (item: AchievementView) =>
    void runClaim(`achievement:${item.id}`, () => bonusApi.claimAchievement(item.id), item.title);

  if (userLoading || (user && loading)) {
    return (
      <div className="lb">
        <header className="pg-head">
          <h1>Бонусы</h1>
        </header>
        <div className="lb-grid" aria-hidden="true">
          <div className="lb-col lb-col-side">
            <div className="pg-skel lb-skel-side" />
          </div>
          <div className="lb-col">
            <div className="pg-skel lb-skel-main" />
          </div>
        </div>
      </div>
    );
  }

  if (user && loadError) {
    return (
      <div className="lb">
        <header className="pg-head">
          <h1>Бонусы</h1>
        </header>
        <div className="pg-card pg-empty">
          <AlertCircle aria-hidden="true" className="pg-empty-icon" />
          <strong>Не удалось загрузить награды</strong>
          <span>Проверьте соединение и попробуйте ещё раз.</span>
          <button
            type="button"
            className="pg-btn pg-btn-acc"
            onClick={() => {
              setLoading(true);
              void load().finally(() => setLoading(false));
            }}
          >
            Обновить
          </button>
        </div>
      </div>
    );
  }

  const guest = !user;
  const daily = status?.daily ?? null;
  const streak = daily?.streak ?? 0;
  const welcome = status?.welcome ?? { amount: 0, claimed: false };
  const install = status?.install ?? { amount: 0, claimed: false };
  const summary = status?.summary;

  const claimable = guest
    ? 0
    : (daily && !daily.claimedToday ? 1 : 0) +
      (welcome.claimed ? 0 : 1) +
      (install.claimed ? 0 : 1) +
      (challenges ?? []).filter((c) => c.status === 'completed').length +
      (summary?.claimable ?? 0);

  return (
    <div className="lb">
      <header className="pg-head">
        <h1>Бонусы</h1>
        <div className="lb-chips">
          <span className="lb-chip">
            <Flame aria-hidden="true" />
            <b>{streak}</b> {pluralRu(streak, ['день', 'дня', 'дней'])} серии
          </span>
          <span className="lb-chip">
            <Gift aria-hidden="true" />
            <b>{claimable}</b> можно забрать
          </span>
          <span className="lb-chip">
            <Sparkles aria-hidden="true" />
            <b>{formatRub(summary?.earnedMoney ?? 0)}</b> за достижения
          </span>
        </div>
      </header>

      <div className="lb-grid">
        <div className="lb-col lb-col-side">
          <LevelCard level={status?.level ?? GUEST_LEVEL} />
          <InviteCard referral={referral} guest={guest} onLogin={login} onDetails={() => setInviteOpen(true)} />
        </div>

        <div className="lb-col">
          <DailyTrack daily={daily} onClaim={claimDaily} onLogin={login} />

          <TaskList
            welcome={welcome}
            install={install}
            challenges={challenges}
            guest={guest}
            claiming={claiming === 'daily' || claiming?.startsWith('achievement:') ? null : (claiming as TaskKey | null)}
            onClaim={claimTask}
            onLogin={login}
          />

          {achievements && achievements.length > 0 && (
            <section className="lb-ach" aria-labelledby="lb-ach-title">
              <header className="pg-sec-head">
                <div>
                  <span className="pg-eyebrow">
                    Достижения · {summary?.obtained ?? 0} из {summary?.total ?? achievements.length}
                  </span>
                  <h2 id="lb-ach-title">Ближе всего к награде</h2>
                </div>
                <Link href="/bonuses/achievements" className="pg-sec-link">
                  Все
                  <ChevronRight aria-hidden="true" />
                </Link>
              </header>
              <div className="lb-strip">
                {stripOf(achievements).map((item) => (
                  <AchievementTile
                    key={item.id}
                    item={item}
                    claiming={claiming === `achievement:${item.id}`}
                    onClaim={() => claimAchievement(item)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      <InviteFriendsSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
