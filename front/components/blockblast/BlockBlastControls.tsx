'use client';

import { useId } from 'react';
import {
  BETS,
  MAX_BET,
  MIN_BET,
  formatMultiplier,
  formatRub,
} from '@/lib/blockblast/engine';
import type { Phase } from '@/hooks/useBlockBlastGame';

interface BlockBlastControlsProps {
  phase: Phase;
  betAmount: number;
  balance: number | null;
  cashoutAvailable: boolean;
  take: number;
  multiplier: number;
  zone: 'rising' | 'danger' | 'critical' | null;
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
  zone,
  onBet,
  onPlay,
  onCashout,
  onAgain,
}: BlockBlastControlsProps) {
  const wagerId = useId();

  if (phase === 'playing') {
    return (
      <section className="bb-controls bu-controls">
        <button
          type="button"
          className="bb-cashoutCta"
          data-ready={cashoutAvailable || undefined}
          data-zone={zone ?? undefined}
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
      <section className="bb-controls bu-controls">
        <button type="button" className="bb-primaryCta" onClick={onAgain}>
          Ещё раз
        </button>
      </section>
    );
  }

  const maxAmount = balance ?? 0;
  // Поле ввода: только цифры; при блюре прижимаем к допустимому диапазону.
  const handleInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    onBet(digits ? Math.min(MAX_BET, Number(digits)) : 0);
  };
  const handleBlur = () => {
    if (betAmount < MIN_BET) onBet(MIN_BET);
  };

  return (
    <section className="bb-controls bu-controls">
      <p className="bb-preStatus">Выберите ставку и начните раунд</p>

      <div className="wg-root" data-wager-control="true">
        <div className="wg-heading">
          <label htmlFor={wagerId}>Сумма ставки</label>
          <span id={`${wagerId}-bounds`}>
            {formatRub(MIN_BET)} — {formatRub(MAX_BET)}
          </span>
        </div>
        <div className="wg-entry">
          <div className="wg-field">
            <input
              id={wagerId}
              inputMode="decimal"
              autoComplete="off"
              spellCheck={false}
              type="text"
              value={betAmount > 0 ? String(betAmount) : ''}
              aria-invalid="false"
              aria-describedby={`${wagerId}-bounds`}
              onChange={(e) => handleInput(e.target.value)}
              onBlur={handleBlur}
            />
            <span aria-hidden="true">₽</span>
          </div>
        </div>
        <div className="wg-presets" role="group" aria-label="Быстрая ставка">
          {BETS.map((bet) => (
            <button
              key={bet}
              type="button"
              aria-pressed={betAmount === bet}
              onClick={() => onBet(bet)}
            >
              {formatRub(bet)}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        className="bb-betChip"
        data-max="true"
        aria-pressed={betAmount === maxAmount && maxAmount > 0}
        onClick={() => onBet(maxAmount)}
      >
        MAX · {formatRub(maxAmount)}
      </button>

      <p className="bb-betHint">
        После 10 фигур: <strong>×1</strong> · до 10 — возврат <strong>×0.N</strong>
      </p>

      <button type="button" className="bb-primaryCta" onClick={onPlay}>
        Играть · {formatRub(betAmount)}
      </button>
    </section>
  );
}
