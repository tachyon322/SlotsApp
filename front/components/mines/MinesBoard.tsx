'use client';

import { formatMultiplier, formatRub, multiplierForReveals } from '@/lib/mines/engine';
import type { CellStatus, Phase } from '@/hooks/useMinesGame';

interface MinesBoardProps {
  phase: Phase;
  cells: CellStatus[];
  mines: number;
  betAmount: number;
  revealed: number;
  freshCell: number | null;
  onReveal: (index: number) => void;
}

const PARTICLES = [
  { dx: -16, dy: -14 },
  { dx: 16, dy: -14 },
  { dx: 0, dy: -21 },
  { dx: -14, dy: 12 },
  { dx: 14, dy: 12 },
];

const STATUS_META: Record<
  Phase,
  { tone: 'idle' | 'info' | 'win' | 'loss'; text: string }
> = {
  idle: { tone: 'idle', text: 'Нажми «Начать» или открой любую клетку' },
  playing: { tone: 'info', text: 'Открывай клетки — каждая находка повышает множитель' },
  won: { tone: 'win', text: '' },
  lost: { tone: 'loss', text: '' },
};

function cellLabel(index: number, status: CellStatus): string {
  const n = index + 1;
  if (status === 'safe') return `клетка ${n}: безопасно`;
  if (status === 'mine') return `клетка ${n}: мина`;
  return `клетка ${n}: закрыта`;
}

export function MinesBoard({
  phase,
  cells,
  mines,
  betAmount,
  revealed,
  freshCell,
  onReveal,
}: MinesBoardProps) {
  const multiplier = multiplierForReveals(mines, revealed);
  const payout = Math.round(betAmount * multiplier);
  const winPayout = phase === 'won' ? payout : null;
  const lostBet = phase === 'lost' ? betAmount : null;

  const status = STATUS_META[phase];
  const statusText =
    phase === 'won'
      ? `Вы забрали +${formatRub(winPayout ?? 0)}`
      : phase === 'lost'
        ? `Подорвался! −${formatRub(lostBet ?? 0)}`
        : status.text;

  return (
    <section className="mines_stage" aria-label="Поле">
      <p className="mines_statusBar" data-tone={status.tone}>
        {statusText}
      </p>

      <div className="mines_panel">
        <div className="mines_multiCard">
          <span className="mines_multiBlock">
            <span className="mines_multiLabel">Множитель</span>
            <span className="mines_multiValue" data-pop="true">
              {formatMultiplier(multiplier)}
            </span>
          </span>
          <span className="mines_payoutBlock">
            <span className="mines_multiLabel">Заберёшь</span>
            <span
              className="mines_payoutValue"
              data-tone={phase === 'idle' ? 'neutral' : 'good'}
            >
              {formatRub(payout)}
            </span>
          </span>
        </div>
      </div>

      <div className="mines_grid" role="grid" aria-label="Поле 5×5">
        {cells.map((cell, i) => {
          const fresh = phase === 'playing' && i === freshCell;
          const icon =
            cell === 'safe' ? '💎' : cell === 'mine' ? '💣' : '';
          return (
            <button
              key={i}
              type="button"
              role="gridcell"
              className="mines_cell"
              data-status={cell}
              data-near={cell === 'safe' ? 'true' : undefined}
              data-fresh={fresh ? 'safe' : undefined}
              aria-label={cellLabel(i, cell)}
              disabled={phase !== 'playing' || cell !== 'hidden'}
              onClick={() => onReveal(i)}
            >
              <span aria-hidden="true">{icon}</span>
              {fresh &&
                PARTICLES.map((p, j) => (
                  <span
                    key={j}
                    className="mines_particle"
                    aria-hidden="true"
                    style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px` } as React.CSSProperties}
                  />
                ))}
            </button>
          );
        })}
      </div>

      {phase === 'won' && (
        <div className="mines_cashoutWin">
          <span className="mines_cashoutWinLabel">Успешный выход</span>
          <span className="mines_cashoutWinAmount">+{formatRub(winPayout ?? 0)}</span>
        </div>
      )}
    </section>
  );
}
