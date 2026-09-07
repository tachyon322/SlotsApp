'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Zap,
  Gift,
  Crown,
  Users,
  ListChecks,
  ArrowRight,
  Check,
  AlertCircle,
} from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useAuthModal } from '@/components/AuthModal';
import {
  bonusApi,
  referralApi,
  type BonusesStatusResponse,
  type ReferralsStatusResponse,
} from '@/lib/api';
import { DailyBonusModal } from '@/components/bonuses/DailyBonusModal';
import { InviteFriendsSheet } from '@/components/bonuses/InviteFriendsSheet';
import { TasksModal } from '@/components/bonuses/TasksModal';

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function pluralRu(n: number, forms: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return forms[1];
  return forms[2];
}

function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
    .map((v) => String(v).padStart(2, '0'))
    .join(':');
}

function secondsToNextMidnight(now: number): number {
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return Math.max(0, (midnight.getTime() - now) / 1000);
}

interface PreviewItem {
  id: string;
  title: string;
  emoji: string;
  reward: number;
  progress: number;
  target: number;
}

// Дефолтные карточки-превью (как в референсе): первый выигрыш / пополнение / раунд
const DEFAULT_PREVIEW: PreviewItem[] = [
  { id: 'first_win', title: 'Первый выигрыш', emoji: '🏆', reward: 250, progress: 0, target: 1 },
  { id: 'first_deposit', title: 'Первое пополнение', emoji: '💎', reward: 500, progress: 0, target: 1 },
  { id: 'first_spin', title: 'Первый раунд', emoji: '🎰', reward: 100, progress: 0, target: 1 },
];

// Маппинг достижения на скачанную арт-иконку референса
function challengeArt(id: string): string | null {
  if (/win|victory/i.test(id)) return 'victory-count-core';
  if (/deposit|попол/i.test(id)) return 'deposit-module';
  if (/spin|round|раунд/i.test(id)) return 'round-activation-core';
  return null;
}

export default function BonusesPage() {
  const { user, refresh: refreshUser } = useUser();
  const { openAuth } = useAuthModal();

  const [status, setStatus] = useState<BonusesStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [claiming, setClaiming] = useState<string | null>(null);
  const [dailyOpen, setDailyOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [referral, setReferral] = useState<ReferralsStatusResponse | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await bonusApi.status();
      setStatus(data);
      setLoadError(false);
    } catch {
      setStatus(null);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      void load();
    } else {
      setStatus(null);
      setLoading(false);
      setLoadError(false);
    }
  }, [user, load]);

  // Статистика приглашений для карточки рефералки
  useEffect(() => {
    if (!user) {
      setReferral(null);
      return;
    }
    let cancelled = false;
    referralApi
      .status()
      .then((data) => {
        if (!cancelled) setReferral(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Тик секундомера (таймер до следующего ежедневного бонуса)
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const handleClaim = async (type: 'daily' | 'welcome' | 'install'): Promise<boolean> => {
    if (!user) {
      openAuth('signin');
      return false;
    }
    if (claiming) return false;
    setClaiming(type);
    try {
      if (type === 'daily') await bonusApi.claimDaily();
      else if (type === 'welcome') await bonusApi.claimWelcome();
      else await bonusApi.claimInstall();
      await refreshUser();
      await load();
      return true;
    } catch {
      await load();
      return false;
    } finally {
      setClaiming(null);
    }
  };

  if (loading) {
    return (
      <div className="bn-surface">
        <div className="bn-loadingHero" aria-hidden="true" />
        <div className="bn-loadingGrid" aria-hidden="true" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="bn-surface">
        <div className="bn-errorPanel">
          <AlertCircle aria-hidden="true" />
          <h1>Не удалось загрузить награды</h1>
          <p>Проверьте соединение и попробуйте ещё раз.</p>
          <button type="button" onClick={() => void load()}>
            Обновить
          </button>
        </div>
      </div>
    );
  }

  const level = status?.level ?? {
    level: 1,
    xp: 0,
    xpToNext: 25,
    progress: 0,
    nextReward: 100,
  };
  const daily = status?.daily ?? { streak: 0, claimedToday: false, amount: 0, cycle: [] };
  const welcome = status?.welcome ?? { amount: 0, claimed: false };
  const install = status?.install ?? { amount: 0, claimed: false };
  const summary = status?.summary ?? {
    total: 60,
    obtained: 0,
    claimable: 0,
    inProgress: 0,
    earnedMoney: 0,
  };

  const preview: PreviewItem[] =
    status && status.preview.length > 0 ? status.preview : DEFAULT_PREVIEW;

  const referralReward = referral?.perFriend ?? 500;
  const friendsCount = referral?.friendsCount ?? 0;
  const referralEarned = referral?.earned ?? 0;

  const tasksTotal = welcome.amount + install.amount;

  // Сумма на карточке ежедневной награды: если сегодня уже забрано —
  // показываем следующую награду цикла (как в референсе), иначе — доступную сегодня.
  const dailyCardAmount = daily.claimedToday
    ? (daily.cycle[daily.streak % Math.max(1, daily.cycle.length)] ?? daily.amount)
    : (daily.amount > 0 ? daily.amount : daily.cycle[Math.max(0, daily.streak - 1)] ?? 0);

  const openDaily = () => {
    if (!user) {
      openAuth('signin');
      return;
    }
    setDailyOpen(true);
  };

  const openTasks = () => {
    if (!user) {
      openAuth('signin');
      return;
    }
    setTasksOpen(true);
  };

  const openInvite = () => {
    if (!user) {
      openAuth('signin');
      return;
    }
    setInviteOpen(true);
  };

  return (
    <div className="bn-surface">
      {/* Хиро: копия + мини-статистика */}
      <section className="bn-vaultHero" data-bonus-block="hero-and-mini-stats">
        <span className="bn-heroGlow" aria-hidden="true" />
        <picture className="bn-heroEnvironment" aria-hidden="true">
          <source
            type="image/avif"
            srcSet="/images/web-hub/v1/pages/bonuses/bonuses-hero-reward-environment-640w.avif 640w, /images/web-hub/v1/pages/bonuses/bonuses-hero-reward-environment-960w.avif 960w, /images/web-hub/v1/pages/bonuses/bonuses-hero-reward-environment-1440w.avif 1440w"
            sizes="(max-width: 760px) calc(100vw - 28px), min(94vw, 1516px)"
          />
          <source
            type="image/webp"
            srcSet="/images/web-hub/v1/pages/bonuses/bonuses-hero-reward-environment-640w.webp 640w, /images/web-hub/v1/pages/bonuses/bonuses-hero-reward-environment-960w.webp 960w, /images/web-hub/v1/pages/bonuses/bonuses-hero-reward-environment-1440w.webp 1440w"
            sizes="(max-width: 760px) calc(100vw - 28px), min(94vw, 1516px)"
          />
          <img
            src="/images/web-hub/v1/pages/bonuses/bonuses-hero-reward-environment-960w.webp"
            width={960}
            height={432}
            sizes="(max-width: 760px) calc(100vw - 28px), min(94vw, 1516px)"
            alt=""
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </picture>
        <picture className="bn-heroRewardObject" aria-hidden="true">
          <source
            type="image/avif"
            srcSet="/images/web-hub/v1/pages/bonuses/bonuses-hero-reward-object-320w.avif 320w, /images/web-hub/v1/pages/bonuses/bonuses-hero-reward-object-480w.avif 480w, /images/web-hub/v1/pages/bonuses/bonuses-hero-reward-object-640w.avif 640w"
            sizes="(max-width: 540px) 210px, (max-width: 1120px) 300px, 390px"
          />
          <source
            type="image/webp"
            srcSet="/images/web-hub/v1/pages/bonuses/bonuses-hero-reward-object-320w.webp 320w, /images/web-hub/v1/pages/bonuses/bonuses-hero-reward-object-480w.webp 480w, /images/web-hub/v1/pages/bonuses/bonuses-hero-reward-object-640w.webp 640w"
            sizes="(max-width: 540px) 210px, (max-width: 1120px) 300px, 390px"
          />
          <img
            src="/images/web-hub/v1/pages/bonuses/bonuses-hero-reward-object-640w.webp"
            width={640}
            height={640}
            sizes="(max-width: 540px) 210px, (max-width: 1120px) 300px, 390px"
            alt=""
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </picture>
        <div className="bn-heroCopy">
          <span className="bn-eyebrow">Бонусы и награды</span>
          <h1>Ваши награды</h1>
          <p>Ежедневные бонусы, достижения и прогресс — в одном месте.</p>
        </div>
        <div className="bn-heroStats">
          <span className="bn-heroStat">
            <i aria-hidden="true">
              <Zap />
            </i>
            <strong>{daily.streak}</strong>
            <small>{pluralRu(daily.streak, ['день серии', 'дня серии', 'дней серии'])}</small>
          </span>
          <span className="bn-heroStat">
            <i aria-hidden="true">
              <Gift />
            </i>
            <strong>{summary.claimable}</strong>
            <small>можно забрать</small>
          </span>
          <span className="bn-heroStat">
            <i aria-hidden="true">
              <Crown />
            </i>
            <strong>{level.level}</strong>
            <small>уровень</small>
          </span>
        </div>
      </section>

      {/* Три карточки наград */}
      <section className="bn-rewardGrid" aria-label="Активные награды" data-bonus-block="three-reward-cards">
        {/* Ежедневная награда */}
        <article className="bn-dailyCard">
          <picture className="bn-cardOverlay" aria-hidden="true">
            <source
              type="image/avif"
              srcSet="/images/web-hub/v1/modals/family-c-daily-rewards/daily-gold-particles-640w.avif 640w"
              sizes="360px"
            />
            <source
              type="image/webp"
              srcSet="/images/web-hub/v1/modals/family-c-daily-rewards/daily-gold-particles-640w.webp 640w"
              sizes="360px"
            />
            <img
              src="/images/web-hub/v1/modals/family-c-daily-rewards/daily-gold-particles-640w.webp"
              width={640}
              height={288}
              sizes="360px"
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </picture>
          <picture className="bn-cardObject" aria-hidden="true">
            <source
              type="image/avif"
              srcSet="/images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-240w.avif 240w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-320w.avif 320w"
              sizes="112px"
            />
            <source
              type="image/webp"
              srcSet="/images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-240w.webp 240w, /images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-320w.webp 320w"
              sizes="112px"
            />
            <img
              src="/images/web-hub/v1/modals/family-c-daily-rewards/daily-reward-token-main-320w.webp"
              width={320}
              height={320}
              sizes="112px"
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </picture>
          <div className="bn-cardTop">
            <span className="bn-rewardIcon" aria-hidden="true">
              <Gift />
            </span>
            {daily.claimedToday ? (
              <span className="bn-claimedBadge">
                <Check aria-hidden="true" />
                Забрано
              </span>
            ) : (
              <span className="bn-liveBadge">Активно</span>
            )}
          </div>
          <span className="bn-cardKicker">Ежедневная награда</span>
          <h2>{formatRub(dailyCardAmount)}</h2>
          <div className="bn-cardMeta">
            <span>
              Серия: {daily.streak} {pluralRu(daily.streak, ['день', 'дня', 'дней'])}
            </span>
          </div>
          <p>
            {daily.claimedToday
              ? `Следующее открытие через ${formatHMS(secondsToNextMidnight(now))}`
              : 'Бонус доступен к получению — откройте колесо наград.'}
          </p>
          <button type="button" onClick={openDaily} aria-label="Открыть ежедневный бонус">
            Открыть бонус
            <ArrowRight aria-hidden="true" />
          </button>
        </article>

        {/* Приглашения */}
        <article className="bn-referralCard">
          <picture className="bn-refOverlay" aria-hidden="true">
            <source
              type="image/avif"
              srcSet="/images/web-hub/v1/modals/family-d-referral/referral-network-overlay-640w.avif 640w"
              sizes="340px"
            />
            <source
              type="image/webp"
              srcSet="/images/web-hub/v1/modals/family-d-referral/referral-network-overlay-640w.webp 640w"
              sizes="340px"
            />
            <img
              src="/images/web-hub/v1/modals/family-d-referral/referral-network-overlay-640w.webp"
              width={640}
              height={288}
              sizes="340px"
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </picture>
          <picture className="bn-refObject" aria-hidden="true">
            <source
              type="image/avif"
              srcSet="/images/web-hub/v1/modals/family-d-referral/referral-header-badge-240w.avif 240w, /images/web-hub/v1/modals/family-d-referral/referral-header-badge-320w.avif 320w"
              sizes="96px"
            />
            <source
              type="image/webp"
              srcSet="/images/web-hub/v1/modals/family-d-referral/referral-header-badge-240w.webp 240w, /images/web-hub/v1/modals/family-d-referral/referral-header-badge-320w.webp 320w"
              sizes="96px"
            />
            <img
              src="/images/web-hub/v1/modals/family-d-referral/referral-header-badge-320w.webp"
              width={320}
              height={320}
              sizes="96px"
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </picture>
          <div className="bn-cardTop">
            <span className="bn-rewardIcon" aria-hidden="true">
              <Users />
            </span>
            <span className="bn-refStatus">{friendsCount} приглашено</span>
          </div>
          <span className="bn-cardKicker">Приглашения</span>
          <h2>{formatRub(referralReward)}</h2>
          <p>За каждого друга с первым пополнением</p>
          <div className="bn-refStats">
            <span>
              <strong>{friendsCount}</strong> приглашено
            </span>
            <span>
              <strong>{formatRub(referralEarned)}</strong> получено
            </span>
          </div>
          <button type="button" onClick={openInvite} aria-label="Открыть приглашения">
            Пригласить
            <ArrowRight aria-hidden="true" />
          </button>
        </article>

        {/* Задания */}
        <article className="bn-welcomeCard" data-bonus-card="tasks">
          <picture className="bn-starterVault" aria-hidden="true">
            <source
              type="image/avif"
              srcSet="/images/web-hub/v1/pages/bonuses/bonuses-starter-vault-320w.avif 320w, /images/web-hub/v1/pages/bonuses/bonuses-starter-vault-480w.avif 480w"
              sizes="150px"
            />
            <source
              type="image/webp"
              srcSet="/images/web-hub/v1/pages/bonuses/bonuses-starter-vault-320w.webp 320w, /images/web-hub/v1/pages/bonuses/bonuses-starter-vault-480w.webp 480w"
              sizes="150px"
            />
            <img
              src="/images/web-hub/v1/pages/bonuses/bonuses-starter-vault-480w.webp"
              width={480}
              height={480}
              sizes="150px"
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </picture>
          <div className="bn-cardTop">
            <span className="bn-rewardIcon" aria-hidden="true">
              <ListChecks />
            </span>
            <span className="bn-liveBadge">{summary.claimable} доступно</span>
          </div>
          <span className="bn-cardKicker">Задания</span>
          <h2>{formatRub(tasksTotal)}</h2>
          <p>Удобный вход, уведомления и возвращения — без обязательных ставок.</p>
          <button type="button" onClick={openTasks} aria-label="Открыть задания">
            Открыть задания
            <ArrowRight aria-hidden="true" />
          </button>
        </article>
      </section>

      {/* Прогресс уровня */}
      <section className="bn-progression" aria-labelledby="level-title" data-bonus-block="level-progress">
        <picture className="bn-levelGlow" aria-hidden="true">
          <source
            type="image/avif"
            srcSet="/images/web-hub/v1/pages/bonuses/bonuses-level-stage-glow-640w.avif 640w, /images/web-hub/v1/pages/bonuses/bonuses-level-stage-glow-960w.avif 960w"
            sizes="min(94vw, 1516px)"
          />
          <source
            type="image/webp"
            srcSet="/images/web-hub/v1/pages/bonuses/bonuses-level-stage-glow-640w.webp 640w, /images/web-hub/v1/pages/bonuses/bonuses-level-stage-glow-960w.webp 960w"
            sizes="min(94vw, 1516px)"
          />
          <img
            src="/images/web-hub/v1/pages/bonuses/bonuses-level-stage-glow-640w.webp"
            width={640}
            height={288}
            sizes="min(94vw, 1516px)"
            alt=""
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </picture>
        <div className="bn-levelMark">
          <Crown aria-hidden="true" />
          <span>LVL</span>
          <strong>{level.level}</strong>
        </div>
        <div className="bn-progressBody">
          <header>
            <div>
              <span className="bn-eyebrow">Прогресс уровня</span>
              <h2 id="level-title">Уровень {level.level}</h2>
            </div>
            <strong>{level.progress}%</strong>
          </header>
          <div
            className="bn-progressTrack"
            role="progressbar"
            aria-label={`Прогресс уровня ${level.progress}%`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={level.progress}
          >
            <span style={{ width: `${Math.min(100, level.progress)}%` }} />
          </div>
          <div className="bn-progressMeta">
            <span>
              {level.xp.toLocaleString('ru-RU')} / {level.xpToNext.toLocaleString('ru-RU')} XP
            </span>
            <span>Следующая награда · {formatRub(level.nextReward)}</span>
          </div>
        </div>
      </section>

      {/* Достижения (превью) */}
      <section className="bn-vault" aria-labelledby="achievement-title" data-bonus-block="achievements-preview">
        <header className="bn-sectionHeader">
          <div>
            <span className="bn-eyebrow">Ваши достижения</span>
            <h2 id="achievement-title">Достижения</h2>
            <p>
              Получено {summary.obtained} из {summary.total}
            </p>
          </div>
          <Link href="/bonuses/achievements">
            Все достижения
            <ArrowRight aria-hidden="true" />
          </Link>
        </header>
        <div className="bn-challengeGrid">
          {preview.map((item) => {
            const art = challengeArt(item.id);
            const pct = item.target > 0 ? Math.min(100, Math.round((item.progress / item.target) * 100)) : 0;
            const completed = item.progress >= item.target;
            return (
              <article key={item.id} className="bn-challengeCard" data-status={completed ? 'completed' : 'locked'}>
                {art ? (
                  <picture className="bn-challengeIcon" aria-hidden="true">
                    <source
                      type="image/avif"
                      srcSet={`/images/web-hub/v1/pages/achievements/achievement-${art}-240w.avif 240w, /images/web-hub/v1/pages/achievements/achievement-${art}-320w.avif 320w`}
                      sizes="84px"
                    />
                    <source
                      type="image/webp"
                      srcSet={`/images/web-hub/v1/pages/achievements/achievement-${art}-240w.webp 240w, /images/web-hub/v1/pages/achievements/achievement-${art}-320w.webp 320w`}
                      sizes="84px"
                    />
                    <img
                      src={`/images/web-hub/v1/pages/achievements/achievement-${art}-320w.webp`}
                      width={320}
                      height={320}
                      sizes="84px"
                      alt=""
                      loading="eager"
                      decoding="async"
                      draggable={false}
                    />
                  </picture>
                ) : (
                  <span className="bn-challengeIcon" aria-hidden="true">
                    {item.emoji}
                  </span>
                )}
                <div className="bn-challengeCopy">
                  <strong>{item.title}</strong>
                  <span>{completed ? 'Завершено' : 'В процессе'}</span>
                </div>
                <span className="bn-challengeReward">{formatRub(item.reward)}</span>
                <div className="bn-challengeTrack" aria-hidden="true">
                  <span style={{ width: `${pct}%` }} />
                </div>
                <span className="bn-challengePct">{pct}%</span>
                {completed && <Link href="/bonuses/achievements">Забрать</Link>}
              </article>
            );
          })}
        </div>
      </section>

      <DailyBonusModal
        open={dailyOpen}
        onClose={() => setDailyOpen(false)}
        cycle={daily.cycle}
        streak={daily.streak}
        claimedToday={daily.claimedToday}
        onClaim={() => handleClaim('daily')}
        claiming={claiming === 'daily'}
      />

      <TasksModal
        open={tasksOpen}
        onClose={() => setTasksOpen(false)}
        welcome={welcome}
        install={install}
        claiming={claiming}
        onClaim={(type) => void handleClaim(type)}
      />

      <InviteFriendsSheet open={inviteOpen} onClose={() => setInviteOpen(false)} />
    </div>
  );
}
