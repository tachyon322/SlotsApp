'use client';

import Image from 'next/image';
import type { BonusesStatusResponse } from '@/lib/api';
import { formatRub } from '@/lib/format';
import { LEVEL_ART } from './art';

const RING_R = 52;
const RING_C = 2 * Math.PI * RING_R;

// Уровень: кольцо прогресса XP и награда за следующий уровень
export function LevelCard({ level }: { level: BonusesStatusResponse['level'] }) {
  const share = level.xpToNext > 0 ? Math.min(1, level.xp / level.xpToNext) : 1;
  const left = Math.max(0, level.xpToNext - level.xp);

  return (
    <section className="pg-card lb-level" aria-labelledby="lb-level-title">
      <div
        className="lb-ring"
        role="progressbar"
        aria-label="Прогресс уровня"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(share * 100)}
      >
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle className="lb-ring-bg" cx="60" cy="60" r={RING_R} />
          <circle
            className="lb-ring-fg"
            cx="60"
            cy="60"
            r={RING_R}
            strokeDasharray={RING_C}
            strokeDashoffset={RING_C * (1 - share)}
          />
        </svg>
        <span className="lb-ring-num">
          <small>LVL</small>
          <b>{level.level}</b>
        </span>
      </div>
      <div className="lb-level-copy">
        <span className="pg-eyebrow">Уровень</span>
        <h2 id="lb-level-title">{level.level} уровень</h2>
        <p>
          <b>{level.xp.toLocaleString('ru-RU')}</b> / {level.xpToNext.toLocaleString('ru-RU')} XP
          <br />
          ещё {left.toLocaleString('ru-RU')} XP до {level.level + 1}-го
        </p>
      </div>
      <div className="lb-next">
        <Image className="lb-next-art" src={LEVEL_ART} width={80} height={92} alt="" aria-hidden="true" />
        <span className="lb-next-t">
          <b>Награда за {level.level + 1} уровень</b>
          XP — за раунды, победы и бонусы
        </span>
        <strong>{formatRub(level.nextReward)}</strong>
      </div>
    </section>
  );
}
