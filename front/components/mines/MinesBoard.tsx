'use client';

import { formatMultiplier, formatRub, GRID_SIZE, multiplierForReveals } from '@/lib/mines/engine';
import type { CellStatus, Phase } from '@/hooks/useMinesGame';
import { pluralRu } from '@/lib/format';

interface MinesBoardProps {
  phase: Phase;
  cells: CellStatus[];
  mines: number;
  betAmount: number;
  revealed: number;
  freshCell: number | null;
  onReveal: (index: number) => void;
}

function cellLabel(index: number, status: CellStatus): string {
  const n = index + 1;
  if (status === 'safe') return `клетка ${n}: кристалл`;
  if (status === 'mine') return `клетка ${n}: мина`;
  return `клетка ${n}: закрыта`;
}

export function MinesBoard({ phase, cells, mines, betAmount, revealed, freshCell, onReveal }: MinesBoardProps) {
  const multiplier = multiplierForReveals(mines, revealed);
  const safeLeft = GRID_SIZE - mines - revealed;
  const next = safeLeft > 0 ? multiplierForReveals(mines, revealed + 1) : null;
  const payout = Math.round(betAmount * multiplier);
  const playing = phase === 'playing';
  const over = phase === 'won' || phase === 'lost';

  return (
    <section className="mn2-board" data-phase={phase} aria-label="Поле">
      <div className="mn2-stats">
        <div>
          <small>Множитель</small>
          <b key={revealed} data-on={revealed > 0}>
            {formatMultiplier(multiplier)}
          </b>
        </div>
        <div>
          <small>Следующая</small>
          <b data-tone="next">{next !== null && !over ? formatMultiplier(next) : '—'}</b>
        </div>
        <div>
          <small>{phase === 'won' ? 'Забрали' : phase === 'lost' ? 'Потеряно' : 'Заберёте'}</small>
          <b data-tone={phase === 'lost' ? 'neg' : revealed > 0 ? 'pos' : undefined}>
            {phase === 'lost' ? `−${formatRub(betAmount)}` : formatRub(payout)}
          </b>
        </div>
      </div>

      <div className="mn2-gridWrap">
        <div className="mn2-grid" role="grid" aria-label="Поле 5×5">
          {cells.map((cell, i) => (
            <button
              key={i}
              type="button"
              role="gridcell"
              className="mn2-cell"
              data-status={cell}
              data-fresh={playing && i === freshCell ? 'true' : undefined}
              data-dim={over && cell === 'hidden' ? 'true' : undefined}
              aria-label={cellLabel(i, cell)}
              disabled={!playing || cell !== 'hidden'}
              onClick={() => onReveal(i)}
            >
              {cell !== 'hidden' && <i className="mn2-ico" data-kind={cell === 'mine' ? 'bomb' : 'gem'} aria-hidden="true" />}
            </button>
          ))}
        </div>

        {over && (
          <div className="mn2-result" data-tone={phase === 'won' ? 'win' : 'loss'} role="status">
            <small>{phase === 'won' ? 'Вы забрали' : 'Мина!'}</small>
            <b>{phase === 'won' ? `+${formatRub(payout)}` : `−${formatRub(betAmount)}`}</b>
            {phase === 'won' && <span>{formatMultiplier(multiplier)}</span>}
          </div>
        )}
      </div>

      <p className="mn2-hint">
        {playing
          ? `Осталось ${safeLeft} ${pluralRu(safeLeft, ['кристалл', 'кристалла', 'кристаллов'])} и ${mines} ${pluralRu(mines, ['мина', 'мины', 'мин'])}`
          : phase === 'idle'
            ? 'Выберите число мин и ставку, затем нажмите «Играть»'
            : `Открыто клеток: ${revealed}`}
      </p>
    </section>
  );
}
