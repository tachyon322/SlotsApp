'use client';

import Image from 'next/image';
import { Check, LockKeyhole } from 'lucide-react';
import type { AchievementView } from '@/lib/api';
import { formatRub, formatShort } from '@/lib/format';
import { achievementArt } from './art';

export type TileState = 'locked' | 'progress' | 'completed' | 'claimed';

export function tileStateOf(item: AchievementView): TileState {
  if (item.status === 'claimed') return 'claimed';
  if (item.status === 'completed') return 'completed';
  return item.progress > 0 ? 'progress' : 'locked';
}

interface AchievementTileProps {
  item: AchievementView;
  claiming?: boolean;
  onClaim?: () => void;
}

// Карточка достижения — одна и для ленты на /bonuses, и для страницы достижений
export function AchievementTile({ item, claiming = false, onClaim }: AchievementTileProps) {
  const state = tileStateOf(item);
  const percent = state === 'completed' || state === 'claimed' ? 100 : Math.min(100, item.percent);

  return (
    <article className="lb-tile" data-state={state}>
      <div className="lb-tile-top">
        <span className="lb-tile-art">
          <Image src={achievementArt(item)} width={120} height={120} sizes="60px" alt="" aria-hidden="true" />
          {state === 'locked' && (
            <span className="lb-tile-lock" aria-label="Закрыто">
              <LockKeyhole aria-hidden="true" />
            </span>
          )}
        </span>
        {state === 'claimed' ? (
          <span className="pg-pill">
            <Check aria-hidden="true" />
            Получено
          </span>
        ) : state === 'completed' ? (
          <span className="pg-pill pg-pill-live">Готово</span>
        ) : state === 'progress' ? (
          <span className="pg-pill">{percent}%</span>
        ) : null}
      </div>
      <div className="lb-tile-copy">
        <h3>{item.title}</h3>
        <p>{item.description}</p>
      </div>
      {(state === 'progress' || state === 'locked') && (
        <div className="lb-tile-prog">
          <span className="pg-bar" aria-hidden="true">
            <i style={{ width: `${percent}%` }} />
          </span>
          <small>
            {formatShort(item.progress)} / {formatShort(item.target)}
          </small>
        </div>
      )}
      <footer className="lb-tile-foot">
        <span className="lb-tile-rew">
          <small>Награда</small>
          <strong>{formatRub(item.reward)}</strong>
        </span>
        {state === 'completed' && onClaim && (
          <button type="button" className="pg-btn pg-btn-acc pg-btn-sm" onClick={onClaim} disabled={claiming}>
            {claiming && <span className="pg-spin" aria-hidden="true" />}
            Забрать
          </button>
        )}
      </footer>
    </article>
  );
}
