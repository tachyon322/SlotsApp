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
import { pluralRu } from '@/lib/format';

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

  let label = 'ИГРАТЬ';
  let sub = formatRub(betAmount);
  let kind = 'start';
  if (phase === 'playing') {
    kind = 'cashout';
    if (revealed < 1) {
      label = 'ОТКРОЙТЕ КЛЕТКУ';
      sub = 'чтобы забрать';
    } else {
      label = `ЗАБРАТЬ ${formatRub(Math.round(betAmount * multiplierForReveals(mines, revealed)))}`;
      sub = formatMultiplier(multiplierForReveals(mines, revealed));
    }
  } else if (phase === 'won' || phase === 'lost') {
    label = 'ЕЩЁ РАЗ';
    kind = 'again';
  }

  return (
    <section className="mn2-ctl" aria-label="Ставка">
      <div className="mn2-diff" role="group" aria-label="Число мин">
        {DIFFICULTIES.map((d) => (
          <button
            key={d.risk}
            type="button"
            data-risk={d.risk}
            aria-pressed={mines === d.mines}
            disabled={locked}
            onClick={() => onDifficulty(d.mines)}
          >
            <b>
              {d.mines}
              <i className="mn2-ico" data-kind="bomb" aria-hidden="true" />
            </b>
            <small>{d.name}</small>
          </button>
        ))}
      </div>
      <p className="mn2-diffMeta">
        {mines} {pluralRu(mines, ['мина', 'мины', 'мин'])} · {25 - mines}{' '}
        {pluralRu(25 - mines, ['кристалл', 'кристалла', 'кристаллов'])} · до ×{Math.floor(maxMultiplier(mines)).toLocaleString('ru-RU')}
      </p>

      <div className="mn2-bets" role="group" aria-label="Сумма ставки">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
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
        className="mn2-cta"
        data-kind={kind}
        disabled={phase === 'playing' ? revealed < 1 : false}
        onClick={onPrimary}
      >
        {label}
        <small>{sub}</small>
      </button>
    </section>
  );
}
