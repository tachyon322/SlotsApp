'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { AlertCircle, ArrowLeft, ChevronDown } from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useAuthModal } from '@/components/AuthModal';
import { bonusApi, type AchievementView, type BonusSummary } from '@/lib/api';
import { formatRub } from '@/lib/format';
import { showError, showSuccess } from '@/lib/toast';
import { AchievementTile, tileStateOf, type TileState } from '@/components/bonuses/AchievementTile';
import { ACHIEVEMENT_GROUPS, EMPTY_ART, OTHER_GROUP, type AchievementGroup } from '@/components/bonuses/art';

type Filter = 'all' | 'ready' | 'progress' | 'done';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Все' },
  { id: 'ready', label: 'Готово' },
  { id: 'progress', label: 'В процессе' },
  { id: 'done', label: 'Получено' },
];

const SEGMENT_ORDER: TileState[] = ['claimed', 'completed', 'progress', 'locked'];

function matchesFilter(item: AchievementView, filter: Filter): boolean {
  if (filter === 'ready') return item.status === 'completed';
  if (filter === 'progress') return item.status === 'in_progress';
  if (filter === 'done') return item.status === 'claimed';
  return true;
}

// Раскладка по группам: каждое достижение попадает в первую подходящую группу
function groupAchievements(list: AchievementView[]): Array<{ group: AchievementGroup; items: AchievementView[] }> {
  const buckets = new Map<string, AchievementView[]>();
  for (const item of list) {
    const group = ACHIEVEMENT_GROUPS.find((g) => g.match(item)) ?? OTHER_GROUP;
    buckets.set(group.key, [...(buckets.get(group.key) ?? []), item]);
  }
  return [...ACHIEVEMENT_GROUPS, OTHER_GROUP]
    .filter((g) => buckets.has(g.key))
    .map((group) => ({ group, items: buckets.get(group.key)! }));
}

function Head() {
  return (
    <header className="pg-head">
      <Link href="/bonuses" className="pg-back">
        <ArrowLeft aria-hidden="true" />
        Бонусы
      </Link>
      <h1>Достижения</h1>
    </header>
  );
}

export default function AchievementsPage() {
  const { user, isLoading: userLoading, refresh: refreshUser } = useUser();
  const { openAuth } = useAuthModal();

  const [achievements, setAchievements] = useState<AchievementView[] | null>(null);
  const [summary, setSummary] = useState<BonusSummary | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [claimingId, setClaimingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await bonusApi.achievements();
      setAchievements(res.achievements);
      setSummary(res.summary);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (user) void load();
  }, [user, load]);

  const handleClaim = async (item: AchievementView) => {
    if (claimingId) return;
    setClaimingId(item.id);
    try {
      const { reward } = await bonusApi.claimAchievement(item.id);
      showSuccess(`${item.title}: +${formatRub(reward)}`);
      await Promise.all([load(), refreshUser()]);
    } catch (e) {
      showError(e instanceof Error && e.message ? e.message : 'Не удалось получить награду');
      await load();
    } finally {
      setClaimingId(null);
    }
  };

  if (!userLoading && !user) {
    return (
      <div className="la">
        <Head />
        <div className="pg-card pg-empty">
          <Image className="pg-empty-art" src={EMPTY_ART} width={240} height={240} alt="" aria-hidden="true" />
          <strong>Войдите, чтобы видеть прогресс</strong>
          <span>Достижения считаются по вашей игре и пополнениям.</span>
          <button type="button" className="pg-btn pg-btn-acc" onClick={() => openAuth('signin')}>
            Войти
          </button>
        </div>
      </div>
    );
  }

  if (loadError && !achievements) {
    return (
      <div className="la">
        <Head />
        <div className="pg-card pg-empty">
          <AlertCircle aria-hidden="true" className="pg-empty-icon" />
          <strong>Не удалось загрузить достижения</strong>
          <span>Проверьте соединение и попробуйте ещё раз.</span>
          <button type="button" className="pg-btn pg-btn-acc" onClick={() => void load()}>
            Обновить
          </button>
        </div>
      </div>
    );
  }

  if (!achievements || !summary) {
    return (
      <div className="la">
        <Head />
        <div className="pg-skel la-skel-total" aria-hidden="true" />
        <div className="pg-skel la-skel-grid" aria-hidden="true" />
      </div>
    );
  }

  const counts: Record<Filter, number> = {
    all: achievements.length,
    ready: achievements.filter((a) => a.status === 'completed').length,
    progress: achievements.filter((a) => a.status === 'in_progress').length,
    done: achievements.filter((a) => a.status === 'claimed').length,
  };
  const ready = achievements.filter((a) => a.status === 'completed');
  const segments = [...achievements]
    .map(tileStateOf)
    .sort((a, b) => SEGMENT_ORDER.indexOf(a) - SEGMENT_ORDER.indexOf(b));

  // «Готово» закреплено сверху во вкладке «Все», поэтому из групп его убираем
  const grouped = groupAchievements(
    achievements.filter((a) => matchesFilter(a, filter) && !(filter === 'all' && a.status === 'completed')),
  );

  const renderTile = (item: AchievementView) => (
    <AchievementTile
      key={item.id}
      item={item}
      claiming={claimingId === item.id}
      onClaim={() => void handleClaim(item)}
    />
  );

  return (
    <div className="la">
      <Head />

      <section className="pg-card la-total" aria-label="Сводка достижений">
        <div>
          <p className="la-total-n">
            <strong>{summary.obtained}</strong>
            <span>из {summary.total} получено</span>
          </p>
          <div className="la-segs" aria-hidden="true">
            {segments.map((state, i) => (
              <i key={i} data-state={state} />
            ))}
          </div>
        </div>
        <div className="la-stats">
          <div className="la-stat" data-tone="live">
            <b>{summary.claimable}</b>
            <span>можно забрать</span>
          </div>
          <div className="la-stat">
            <b>{summary.inProgress}</b>
            <span>в процессе</span>
          </div>
          <div className="la-stat">
            <b>{formatRub(summary.earnedMoney)}</b>
            <span>заработано</span>
          </div>
        </div>
      </section>

      <nav className="la-chips" aria-label="Фильтр достижений">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className="pg-chip"
            data-active={filter === f.id}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <b>{counts[f.id]}</b>
          </button>
        ))}
      </nav>

      {filter === 'all' && ready.length > 0 && (
        <section className="la-group" aria-label="Готово к получению">
          <h2 className="la-ready">
            <i aria-hidden="true" />
            Готово к получению · {ready.length}
          </h2>
          <div className="la-grid">{ready.map(renderTile)}</div>
        </section>
      )}

      {filter === 'ready' ? (
        ready.length > 0 ? (
          <div className="la-grid la-grid-flat">{ready.map(renderTile)}</div>
        ) : (
          <div className="pg-card pg-empty la-empty">
            <Image className="pg-empty-art" src={EMPTY_ART} width={240} height={240} alt="" aria-hidden="true" />
            <strong>Пока нечего забирать</strong>
            <span>Играйте — готовые награды появятся здесь.</span>
          </div>
        )
      ) : (
        grouped.map(({ group, items }) => {
          const all = achievements.filter((a) => (ACHIEVEMENT_GROUPS.find((g) => g.match(a)) ?? OTHER_GROUP).key === group.key);
          const got = all.filter((a) => a.status !== 'in_progress').length;
          const open = !collapsed[group.key];
          return (
            <section key={group.key} className="la-group">
              <button
                type="button"
                className="la-gh"
                aria-expanded={open}
                onClick={() => setCollapsed((prev) => ({ ...prev, [group.key]: !prev[group.key] }))}
              >
                <Image className="la-gh-art" src={group.art} width={64} height={64} alt="" aria-hidden="true" />
                <span className="la-gh-t">
                  <b>{group.label}</b>
                  <span className="pg-bar" aria-hidden="true">
                    <i style={{ width: `${(got / all.length) * 100}%` }} />
                  </span>
                </span>
                <span className="la-gh-n">
                  {got} / {all.length}
                </span>
                <ChevronDown aria-hidden="true" />
              </button>
              {open && <div className="la-grid">{items.map(renderTile)}</div>}
            </section>
          );
        })
      )}
    </div>
  );
}
