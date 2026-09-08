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
  onDifficulty: (mines: number) => void;
  onBet: (amount: number) => void;
  onPrimary: () => void;
}

export function MinesControls({
  phase,
  mines,
  betAmount,
  revealed,
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
    <div className="mn-controlsPanel">
      <section className="mn-picker" role="group" aria-label="Сложность">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.risk}
            type="button"
            className="mn-diffChip"
            data-risk={d.risk}
            aria-pressed={mines === d.mines}
            disabled={locked}
            onClick={() => onDifficulty(d.mines)}
          >
            <span className="mn-diffMines">{d.mines}💣</span>
            <span className="mn-diffName">{d.name}</span>
          </button>
        ))}
      </section>
      <div className="mn-diffDetail">
        <p className="mn-diffDetailBlurb">Баланс риска и выигрыша</p>
        <p className="mn-diffDetailMeta">
          {difficulty.mines} мин · {safeCount} безопасных · до {formatMultiplier(maxMult)}
        </p>
      </div>

      <section className="mn-controls" aria-label="Ставка">
        <div className="mn-bets" role="group" aria-label="Сумма ставки">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              className="mn-betChip"
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
          className="mn-primaryCta"
          data-kind={ctaKind}
          disabled={phase === 'playing' ? revealed < 1 : false}
          onClick={onPrimary}
        >
          {ctaLabel}
        </button>
      </section>
    </div>
  );
}
