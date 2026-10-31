'use client';

import type { CSSProperties } from 'react';
import { Zap } from 'lucide-react';
import { FIELD_LAYOUT, FIELD_ROWS, formatMultiplier, formatRub } from '@/lib/minedrop/engine';
import type { Phase, ReelState } from '@/hooks/useMinedropGame';
import {
  BLOCK_NAME,
  DEMO_REELS,
  MAX_ROUND_MULT,
  SPIN_STRIP,
  blockArt,
  columnPoints,
  toolArt,
} from '@/components/minedrop/art';

interface MineDropStageProps {
  phase: Phase;
  reels: string[][];
  reelState: ReelState[];
  destroyed: number[];
  jackpots: boolean[];
  payout: number;
  betAmount: number;
  multiplier: number;
  outcome: 'win' | 'loss' | null;
}

const SPIN_CELLS = [...SPIN_STRIP, ...SPIN_STRIP];

export function Tool({ id, className = 'md2-tool' }: { id: string; className?: string }) {
  const art = toolArt(id);
  if (!art) return <i className={className} data-empty="true" aria-hidden="true" />;
  return (
    <i
      className={className}
      data-eye={id === 'eye' || undefined}
      style={{ backgroundImage: `url(${art})` }}
      aria-hidden="true"
    />
  );
}

export function MineDropStage({
  phase,
  reels,
  reelState,
  destroyed,
  jackpots,
  payout,
  betAmount,
  multiplier,
  outcome,
}: MineDropStageProps) {
  const idle = phase === 'idle';
  const resolved = phase === 'resolved';
  const frame = idle ? DEMO_REELS : reels;

  const points = reelState.reduce(
    (sum, st, c) => (st === 'crashed' ? sum + columnPoints(c, destroyed[c], jackpots[c]) : sum),
    0,
  );
  const settled = resolved && outcome !== null;
  const net = payout - betAmount;
  const big = settled && multiplier >= 5;
  const anyJackpot = jackpots.some((j, c) => j && reelState[c] !== 'spinning');

  return (
    <section className="md2-board" data-phase={phase} aria-label="Поле MineDrop">
      <div className="md2-stats">
        <div>
          <small>Очки</small>
          <b data-tone={points > 0 ? undefined : 'dim'} key={points}>
            {points}
          </b>
        </div>
        <div>
          <small>Множитель</small>
          {settled ? (
            <b data-tone={big ? 'gold' : undefined}>{formatMultiplier(multiplier)}</b>
          ) : (
            <b data-tone="dim">{idle ? `до ×${Math.floor(MAX_ROUND_MULT)}` : resolved ? '—' : '…'}</b>
          )}
        </div>
        <div>
          <small>Выигрыш</small>
          {settled ? (
            <b data-tone={outcome === 'win' ? 'pos' : undefined}>{formatRub(payout)}</b>
          ) : (
            <b data-tone="dim">—</b>
          )}
        </div>
      </div>

      <div className="md2-card" data-outcome={settled ? outcome : undefined} data-big={big || undefined}>
        {/* Рамка: 5 колонн по 3 инструмента */}
        <div className="md2-frame" aria-hidden="true">
          {frame.map((col, c) => {
            const st = idle ? 'stopped' : reelState[c];
            return (
              <div key={c} className="md2-reel" data-state={st} data-eye={(!idle && jackpots[c] && st !== 'spinning') || undefined}>
                {st === 'spinning' ? (
                  <div className="md2-spin" style={{ animationDelay: `${-c * 90}ms` } as CSSProperties}>
                    {SPIN_CELLS.map((id, i) => (
                      <Tool key={i} id={id} />
                    ))}
                  </div>
                ) : (
                  col.map((id, r) => (
                    <span key={r} className="md2-slot" style={{ '--d': `${r * 60}ms` } as CSSProperties}>
                      <Tool id={id} />
                    </span>
                  ))
                )}
              </div>
            );
          })}
        </div>

        {/* Поле 6×5: чем глубже, тем дороже */}
        <div className="md2-field" role="img" aria-label="Поле блоков 5 колонн по 6 блоков">
          {FIELD_LAYOUT[0].map((_, c) => {
            const st = idle ? 'stopped' : reelState[c];
            const broken = st === 'falling' || st === 'crashed';
            const eye = !idle && jackpots[c];
            const count = eye ? FIELD_ROWS : destroyed[c];
            const colPoints = columnPoints(c, destroyed[c], jackpots[c]);
            return (
              <div key={c} className="md2-col" data-state={st} data-eye={(eye && broken) || undefined}>
                {FIELD_LAYOUT.map((row, r) => {
                  const block = row[c];
                  const gone = broken && r < count;
                  return (
                    <span
                      key={r}
                      className="md2-block"
                      data-block={block}
                      data-gone={gone || undefined}
                      title={BLOCK_NAME[block]}
                      style={{ '--d': `${r * 70}ms` } as CSSProperties}
                    >
                      <i style={{ backgroundImage: `url(${blockArt(block)})` }} />
                    </span>
                  );
                })}
                {eye && broken && (
                  <span className="md2-bolt" aria-hidden="true">
                    <Zap />
                  </span>
                )}
                {st === 'crashed' && (
                  <span className="md2-colPts" data-tone={eye ? 'gold' : colPoints > 0 ? 'on' : 'zero'}>
                    {colPoints > 0 ? `+${colPoints}` : '0'}
                  </span>
                )}
              </div>
            );
          })}
          {anyJackpot && phase === 'spinning' && <span className="md2-banner" data-tone="gold">СУНДУК!</span>}
          {settled && (
            <span className="md2-banner" data-tone={outcome === 'win' ? (big ? 'gold' : 'win') : 'loss'}>
              {net > 0 ? `+${formatRub(net)}` : net < 0 ? `−${formatRub(-net)}` : '±0 ₽'}
            </span>
          )}
        </div>
      </div>
    </section>
  );
}
