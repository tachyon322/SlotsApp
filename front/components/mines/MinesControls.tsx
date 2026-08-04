'use client';

import {
  DIFFICULTIES,
  PRESETS,
  formatMultiplier,
  formatRub,
  maxMultiplier,
  multiplierForReveals,
} from '@/lib/mines/engine';
import type { Phase } from '@/hooks/useMinesGame';

interface MinesControlsProps {
  phase: Phase;
  mines: number;
  betAmount: number;
  revealed: number;
  error: string | null;
  onDifficulty: (mines: number) => void;
  onBet: (amount: number) => void;
  onPrimary: () => void;
}

export function MinesControls({
  phase,
  mines,
  betAmount,
  revealed,
  error,
  onDifficulty,
  onBet,
  onPrimary,
}: MinesControlsProps) {
  const locked = phase !== 'idle';
  const difficulty = DIFFICULTIES.find((d) => d.mines === mines) ?? DIFFICULTIES[1];
  const maxMult = maxMultiplier(mines);
  const safeCount = 25 - mines;

  let ctaLabel = 'Начать игру';
  let ctaKind = 'start';
  if (phase === 'playing') {
    const mult = multiplierForReveals(mines, revealed);
    const payout = Math.round(betAmount * mult);
    ctaLabel = `ЗАБРАТЬ ${formatRub(payout)}`;
    ctaKind = 'cashout';
  } else if (phase === 'won' || phase === 'lost') {
    ctaLabel = '🔁 Ещё раз';
    ctaKind = 'again';
  }

  return (
    <div className="mines_controlsPanel">
      <section className="mines_picker" role="group" aria-label="Сложность">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.risk}
            type="button"
            className="mines_diffChip"
            data-risk={d.risk}
            aria-pressed={mines === d.mines}
            disabled={locked}
            onClick={() => onDifficulty(d.mines)}
          >
            <span className="mines_diffMines">{d.mines}💣</span>
            <span className="mines_diffName">{d.name}</span>
          </button>
        ))}
      </section>
      <div className="mines_diffDetail">
        <p className="mines_diffDetailBlurb">Баланс риска и выигрыша</p>
        <p className="mines_diffDetailMeta">
          {difficulty.mines} мин · {safeCount} безопасных · до {formatMultiplier(maxMult)}
        </p>
      </div>

      <section className="mines_controls" aria-label="Ставка">
        <div className="mines_bets" role="group" aria-label="Сумма ставки">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="mines_betChip"
              aria-pressed={betAmount === preset}
              disabled={locked}
              onClick={() => onBet(preset)}
            >
              {formatRub(preset)}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="mines_primaryCta"
          data-kind={ctaKind}
          disabled={phase === 'playing' ? revealed < 1 : false}
          onClick={onPrimary}
        >
          {ctaLabel}
        </button>

        {error && <p className="mines_error">{error}</p>}
      </section>
    </div>
  );
}
