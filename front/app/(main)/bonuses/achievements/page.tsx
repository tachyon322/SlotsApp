'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  Clock3,
  Loader2,
  LockKeyhole,
  Medal,
  Sparkles,
  Trophy,
  Zap,
} from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useAuthModal } from '@/components/AuthModal';
import { bonusApi, type AchievementView, type BonusSummary } from '@/lib/api';

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

type Filter = 'all' | 'claim' | 'progress' | 'done';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'claim', label: 'Можно забрать' },
  { id: 'progress', label: 'В процессе' },
  { id: 'done', label: 'Получено' },
];

// Маппинг достижения на скачанный арт-иконку референса (по id и названию)
const ART_RULES: Array<[RegExp, string]> = [
  [/deposit|попол/i, 'deposit-module'],
  [/slot|слот/i, 'game-slots-object'],
  [/crash|пилот|взл[её]т/i, 'game-crash-object'],
  [/case|кейс/i, 'game-cases-object'],
  [/minedrop|шахт/i, 'game-minedrop-object'],
  [/mines|сап[её]р|мин/i, 'game-mines-object'],
  [/blockblast|блок|подрыв/i, 'game-blockblast-object'],
  [/referral|friend|друг|приглаш/i, 'referral-network-node'],
  [/promo|промокод/i, 'promo-ticket'],
  [/withdraw|вывод/i, 'withdrawal-transfer-node'],
  [/streak|серия/i, 'win-streak-chain'],
  [/multiplier|множ|big_win|mega/i, 'multiplier-breakthrough-core'],
  [/orbit|rounds_|try_|осмотр/i, 'round-volume-orbit'],
  [/spin|round|раунд|вращ/i, 'round-activation-core'],
  [/win|victory|побед/i, 'victory-count-core'],
  [/diversity|игр/i, 'game-diversity-constellation'],
  [/wager|став/i, 'wager-volume-core'],
  [/comeback|возвращ/i, 'comeback-return-arc'],
];

function achievementArt(id: string, title: string): string | null {
  for (const [re, art] of ART_RULES) {
    if (re.test(id) || re.test(title)) return art;
  }
  return null;
}

const ASSET_BASE = '/images/web-hub/v1/pages/achievements';

type CardStatus = 'locked' | 'in_progress' | 'completed' | 'claimed';

function cardStatusOf(item: AchievementView): CardStatus {
  if (item.status === 'claimed') return 'claimed';
  if (item.status === 'completed') return 'completed';
  return item.percent > 0 ? 'in_progress' : 'locked';
}

function badgeTextOf(status: CardStatus): string {
  if (status === 'claimed') return 'Получено';
  if (status === 'completed') return 'Готово';
  if (status === 'locked') return 'Закрыто';
  return 'В процессе';
}

interface ItemCardProps {
  item: AchievementView;
  claiming: boolean;
  onClaim: () => void;
}

function ItemCard({ item, claiming, onClaim }: ItemCardProps) {
  const status = cardStatusOf(item);
  const art = achievementArt(item.id, item.title);
  const showProgress = status !== 'locked';
  const percent = status === 'completed' || status === 'claimed' ? 100 : item.percent;

  return (
    <article className="av-card" data-status={status}>
      <span className="av-cardAccent" aria-hidden="true" />
      <header>
        <span className="av-cardIcon" aria-hidden="true">
          <picture className="av-cardPedestal">
            <source
              type="image/avif"
              srcSet={`${ASSET_BASE}/achievement-reward-pedestal-640w.avif 640w`}
              sizes="96px"
            />
            <source
              type="image/webp"
              srcSet={`${ASSET_BASE}/achievement-reward-pedestal-640w.webp 640w`}
              sizes="96px"
            />
            <img
              src={`${ASSET_BASE}/achievement-reward-pedestal-640w.webp`}
              width={640}
              height={288}
              sizes="96px"
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </picture>
          {art ? (
            <picture className="av-cardSemanticArt">
              <source
                type="image/avif"
                srcSet={`${ASSET_BASE}/achievement-${art}-240w.avif 240w, ${ASSET_BASE}/achievement-${art}-320w.avif 320w`}
                sizes="84px"
              />
              <source
                type="image/webp"
                srcSet={`${ASSET_BASE}/achievement-${art}-240w.webp 240w, ${ASSET_BASE}/achievement-${art}-320w.webp 320w`}
                sizes="84px"
              />
              <img
                src={`${ASSET_BASE}/achievement-${art}-320w.webp`}
                width={320}
                height={320}
                sizes="84px"
                alt=""
                loading="lazy"
                decoding="async"
                draggable={false}
              />
            </picture>
          ) : (
            <span className="av-cardSemanticArt" style={{ display: 'grid', placeItems: 'center', fontSize: 30 }}>
              {item.emoji}
            </span>
          )}
          {status === 'locked' && <LockKeyhole className="av-lockOverlay" />}
        </span>
        <span className="av-statusBadge">{badgeTextOf(status)}</span>
      </header>
      <div className="av-cardCopy">
        <h2>{item.title}</h2>
        <p>{item.description}</p>
      </div>
      {showProgress && (
        <div className="av-cardProgress">
          <div>
            <span style={{ width: `${percent}%` }} />
          </div>
          <p>
            <span>
              {item.progress} / {item.target}
            </span>
            <strong>{percent}%</strong>
          </p>
        </div>
      )}
      <footer>
        {status === 'claimed' ? (
          <span className="av-claimed">
            <Check aria-hidden="true" />
            Получено
          </span>
        ) : status === 'locked' ? (
          <span />
        ) : (
          <span className="av-reward">
            <small>Награда</small>
            <strong>{formatRub(item.reward)}</strong>
          </span>
        )}
        {status === 'completed' && (
          <button type="button" onClick={onClaim} disabled={claiming}>
            {claiming && <Loader2 aria-hidden="true" />}
            Забрать
          </button>
        )}
      </footer>
    </article>
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
      <div className="av-surface">
        <header className="av-hero">
          <span className="av-heroGlow" aria-hidden="true" />
          <div className="av-heroCopy">
            <Link href="/bonuses" className="av-back">
              <ArrowLeft aria-hidden="true" /> Бонусы
            </Link>
            <span className="av-eyebrow">Ваш прогресс</span>
            <h1>Достижения</h1>
            <p>Войдите, чтобы смотреть достижения</p>
          </div>
          <div className="av-heroMedal" aria-hidden="true">
            <picture className="av-heroTrophy">
              <source
                type="image/avif"
                srcSet={`${ASSET_BASE}/achievements-hero-trophy-320w.avif 320w, ${ASSET_BASE}/achievements-hero-trophy-480w.avif 480w, ${ASSET_BASE}/achievements-hero-trophy-640w.avif 640w`}
                sizes="(max-width: 570px) 112px, 190px"
              />
              <source
                type="image/webp"
                srcSet={`${ASSET_BASE}/achievements-hero-trophy-320w.webp 320w, ${ASSET_BASE}/achievements-hero-trophy-480w.webp 480w, ${ASSET_BASE}/achievements-hero-trophy-640w.webp 640w`}
                sizes="(max-width: 570px) 112px, 190px"
              />
              <img
                src={`${ASSET_BASE}/achievements-hero-trophy-640w.webp`}
                width={640}
                height={640}
                sizes="(max-width: 570px) 112px, 190px"
                alt=""
                loading="eager"
                decoding="async"
                draggable={false}
              />
            </picture>
          </div>
        </header>
        <section className="av-collection">
          <div className="av-empty">
            <Trophy aria-hidden="true" />
            <strong>Требуется вход</strong>
            <span>Войдите в аккаунт, чтобы видеть прогресс достижений.</span>
          </div>
        </section>
      </div>
    );
  }

  const loading = summary === null;

  const obtained = summary?.obtained ?? 0;
  const earned = summary?.earnedMoney ?? 0;
  const inProgressCount = summary?.inProgress ?? 0;
  const claimable = summary?.claimable ?? 0;

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
    <div className="av-surface">
      {/* Хиро: атмосферный арт, копия, кубок */}
      <header className="av-hero">
        <span className="av-heroGlow" aria-hidden="true" />
        <picture className="av-heroAtmosphere" aria-hidden="true">
          <source
            type="image/avif"
            srcSet={`${ASSET_BASE}/achievements-hero-atmosphere-640w.avif 640w, ${ASSET_BASE}/achievements-hero-atmosphere-960w.avif 960w, ${ASSET_BASE}/achievements-hero-atmosphere-1440w.avif 1440w`}
            sizes="(max-width: 570px) calc(100vw - 28px), min(94vw, 1516px)"
          />
          <source
            type="image/webp"
            srcSet={`${ASSET_BASE}/achievements-hero-atmosphere-640w.webp 640w, ${ASSET_BASE}/achievements-hero-atmosphere-960w.webp 960w, ${ASSET_BASE}/achievements-hero-atmosphere-1440w.webp 1440w`}
            sizes="(max-width: 570px) calc(100vw - 28px), min(94vw, 1516px)"
          />
          <img
            src={`${ASSET_BASE}/achievements-hero-atmosphere-960w.webp`}
            width={960}
            height={432}
            sizes="(max-width: 570px) calc(100vw - 28px), min(94vw, 1516px)"
            alt=""
            loading="eager"
            decoding="async"
            draggable={false}
          />
        </picture>
        <div className="av-heroCopy">
          <Link href="/bonuses" className="av-back">
            <ArrowLeft aria-hidden="true" /> Бонусы
          </Link>
          <span className="av-eyebrow">Ваш прогресс</span>
          <h1>Достижения</h1>
          <p>
            Получено {obtained} из {total}
          </p>
        </div>
        <div className="av-heroMedal" aria-hidden="true">
          <picture className="av-heroTrophy">
            <source
              type="image/avif"
              srcSet={`${ASSET_BASE}/achievements-hero-trophy-320w.avif 320w, ${ASSET_BASE}/achievements-hero-trophy-480w.avif 480w, ${ASSET_BASE}/achievements-hero-trophy-640w.avif 640w`}
              sizes="(max-width: 570px) 112px, 190px"
            />
            <source
              type="image/webp"
              srcSet={`${ASSET_BASE}/achievements-hero-trophy-320w.webp 320w, ${ASSET_BASE}/achievements-hero-trophy-480w.webp 480w, ${ASSET_BASE}/achievements-hero-trophy-640w.webp 640w`}
              sizes="(max-width: 570px) 112px, 190px"
            />
            <img
              src={`${ASSET_BASE}/achievements-hero-trophy-640w.webp`}
              width={640}
              height={640}
              sizes="(max-width: 570px) 112px, 190px"
              alt=""
              loading="eager"
              decoding="async"
              draggable={false}
            />
          </picture>
        </div>
      </header>

      {/* Сводка */}
      <section className="av-stats" aria-label="Сводка достижений">
        <article data-tone="cyan">
          <i aria-hidden="true">
            <Zap />
          </i>
          <strong>{claimable}</strong>
          <span>Можно забрать</span>
        </article>
        <article data-tone="green">
          <i aria-hidden="true">
            <Medal />
          </i>
          <strong>{obtained}</strong>
          <span>Получено</span>
        </article>
        <article data-tone="gold">
          <i aria-hidden="true">
            <Sparkles />
          </i>
          <strong>{formatRub(earned)}</strong>
          <span>Заработано</span>
        </article>
        <article data-tone="violet">
          <i aria-hidden="true">
            <Clock3 />
          </i>
          <strong>{inProgressCount}</strong>
          <span>В процессе</span>
        </article>
      </section>

      {/* Табы и фильтры */}
      <section className="av-controls" aria-label="Навигация достижений">
        <div className="av-tabs" role="tablist" aria-label="Тип достижений">
          <button
            id="achievement-tab-progress"
            type="button"
            role="tab"
            aria-controls="achievement-panel"
            aria-selected={tab === 'progress'}
            data-active={tab === 'progress'}
            onClick={() => setTab('progress')}
          >
            Прогресс
          </button>
          <button
            id="achievement-tab-challenges"
            type="button"
            role="tab"
            aria-controls="achievement-panel"
            aria-selected={tab === 'challenges'}
            data-active={tab === 'challenges'}
            onClick={() => setTab('challenges')}
          >
            Испытания
          </button>
        </div>
        {tab === 'progress' && (
          <div className="av-filters" role="group" aria-label="Фильтр статуса">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                type="button"
                aria-pressed={filter === f.id}
                data-active={filter === f.id}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Коллекция */}
      <section
        id="achievement-panel"
        role="tabpanel"
        aria-labelledby={`achievement-tab-${tab}`}
        className={loading ? 'av-loading' : 'av-collection'}
      >
        {loading ? (
          <>
            <span />
            <span />
            <span />
          </>
        ) : (
          <>
            {visible.map((item) => (
              <ItemCard
                key={`${tab}-${item.id}`}
                item={item}
                claiming={claimingId === item.id}
                onClaim={() => void handleClaim(item)}
              />
            ))}
            {visible.length === 0 && (
              <div className="av-empty">
                <Trophy aria-hidden="true" />
                <strong>{tab === 'challenges' ? 'Испытаний нет' : 'Здесь пока пусто'}</strong>
                <span>
                  {tab === 'challenges'
                    ? 'Сегодня заданий нет — загляните позже.'
                    : 'Прогресс появится по мере игры.'}
                </span>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
