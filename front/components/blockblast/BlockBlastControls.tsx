'use client';

import { BETS, formatMultiplier, formatRub } from '@/lib/blockblast/engine';
import type { Phase } from '@/hooks/useBlockBlastGame';

interface BlockBlastControlsProps {
  phase: Phase;
  betAmount: number;
  balance: number | null;
  cashoutAvailable: boolean;
  take: number;
  multiplier: number;
  onBet: (amount: number) => void;
  onPlay: () => void;
  onCashout: () => void;
  onAgain: () => void;
}

export function BlockBlastControls({
  phase,
  betAmount,
  balance,
  cashoutAvailable,
  take,
  multiplier,
  onBet,
  onPlay,
  onCashout,
  onAgain,
}: BlockBlastControlsProps) {
  if (phase === 'playing') {
    return (
      <section className="blockblast_controls">
        <button
          type="button"
          className="blockblast_cashoutCta"
          disabled={!cashoutAvailable}
          onClick={onCashout}
        >
          {cashoutAvailable
            ? `Забрать ${formatRub(take)} · ${formatMultiplier(multiplier)}`
            : 'Доступно после 15 размещений'}
        </button>
      </section>
    );
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <section className="blockblast_controls">
        <button type="button" className="blockblast_primaryCta" onClick={onAgain}>
          🔁 Ещё раз
        </button>
      </section>
    );
  }

  const maxAmount = balance ?? 0;

  return (
    <section className="blockblast_controls">
      <p className="blockblast_preStatus">Выбери ставку и начни раунд</p>

      <div className="blockblast_bets" role="group" aria-label="Ставка">
        {BETS.map((bet) => (
          <button
            key={bet}
            type="button"
            className="blockblast_betChip"
            aria-pressed={betAmount === bet}
            onClick={() => onBet(bet)}
          >
            {formatRub(bet)}
          </button>
        ))}
        <button
          type="button"
          className="blockblast_betChip"
          data-max="true"
          aria-pressed={betAmount === maxAmount && maxAmount > 0}
          onClick={() => onBet(maxAmount)}
        >
          MAX · {formatRub(maxAmount)}
        </button>
      </div>

      <p className="blockblast_betHint">
        После 10 фигур: <strong>×1</strong> · до 10 — возврат <strong>×0.N</strong>
      </p>

      <button type="button" className="blockblast_primaryCta" onClick={onPlay}>
        Играть · {formatRub(betAmount)}
      </button>
    </section>
  );
}
