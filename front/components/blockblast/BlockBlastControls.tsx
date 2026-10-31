'use client';

import { useId } from 'react';
import { BookOpen } from 'lucide-react';
import {
  BETS,
  MAX_BET,
  MIN_BET,
  TARGET_PLACEMENTS,
  formatMultiplier,
  formatRub,
} from '@/lib/blockblast/engine';
import type { Phase } from '@/hooks/useBlockBlastGame';
import type { FillZone } from '@/components/blockblast/BlockBlastBoard';

interface BlockBlastControlsProps {
  phase: Phase;
  betAmount: number;
  balance: number | null;
  placements: number;
  cashoutAvailable: boolean;
  take: number;
  multiplier: number;
  zone: FillZone;
  onBet: (amount: number) => void;
  onPlay: () => void;
  onCashout: () => void;
  onAgain: () => void;
  onRules: () => void;
}

export function BlockBlastControls({
  phase,
  betAmount,
  balance,
  placements,
  cashoutAvailable,
  take,
  multiplier,
  zone,
  onBet,
  onPlay,
  onCashout,
  onAgain,
  onRules,
}: BlockBlastControlsProps) {
  const wagerId = useId();

  const rulesLink = (
    <button type="button" className="bx-rulesLink" onClick={onRules}>
      <BookOpen aria-hidden="true" />
      Правила и выплаты
    </button>
  );

  if (phase === 'playing') {
    const left = Math.max(0, TARGET_PLACEMENTS - placements);
    return (
      <section className="bx-ctl" aria-label="Кэшаут">
        <button
          type="button"
          className="bx-cta"
          data-kind="cashout"
          data-zone={cashoutAvailable ? (zone ?? undefined) : undefined}
          disabled={!cashoutAvailable}
          onClick={onCashout}
        >
          {cashoutAvailable ? `ЗАБРАТЬ ${formatRub(take)}` : `ЗАБРАТЬ С ${TARGET_PLACEMENTS}-Й ФИГУРЫ`}
          <small>
            {cashoutAvailable
              ? formatMultiplier(multiplier)
              : `ещё ${left}`}
          </small>
        </button>
      </section>
    );
  }

  if (phase === 'won' || phase === 'lost') {
    return (
      <section className="bx-ctl" aria-label="Новый раунд">
        <button type="button" className="bx-cta" data-kind="again" onClick={onAgain}>
          ЕЩЁ РАЗ
          <small>{formatRub(betAmount)}</small>
        </button>
        {rulesLink}
      </section>
    );
  }

  const maxAmount = Math.min(MAX_BET, Math.floor(balance ?? 0));
  const tooLow = betAmount < MIN_BET;
  const insufficient = balance !== null && balance < betAmount;
  // Поле ввода: только цифры; при блюре прижимаем к допустимому диапазону.
  const handleInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, 6);
    onBet(digits ? Math.min(MAX_BET, Number(digits)) : 0);
  };

  return (
    <section className="bx-ctl" aria-label="Ставка">
      <div className="bx-betHead">
        <label htmlFor={wagerId}>Ставка</label>
        <span id={`${wagerId}-bounds`}>
          {formatRub(MIN_BET)} – {formatRub(MAX_BET)}
        </span>
      </div>
      <div className="bx-betField">
        <input
          id={wagerId}
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          type="text"
          value={betAmount > 0 ? String(betAmount) : ''}
          placeholder={String(MIN_BET)}
          aria-describedby={`${wagerId}-bounds`}
          onChange={(e) => handleInput(e.target.value)}
          onBlur={() => {
            if (betAmount < MIN_BET) onBet(MIN_BET);
          }}
        />
        <span aria-hidden="true">₽</span>
      </div>
      <div className="bx-bets" role="group" aria-label="Быстрая ставка">
        {BETS.map((bet) => (
          <button key={bet} type="button" aria-pressed={betAmount === bet} onClick={() => onBet(bet)}>
            {bet.toLocaleString('ru-RU')}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={maxAmount >= MIN_BET && betAmount === maxAmount}
          disabled={maxAmount < MIN_BET}
          onClick={() => onBet(maxAmount)}
        >
          MAX
        </button>
      </div>

      <button
        type="button"
        className="bx-cta"
        data-kind="start"
        disabled={tooLow || insufficient}
        onClick={onPlay}
      >
        {insufficient ? 'НЕ ХВАТАЕТ СРЕДСТВ' : 'ИГРАТЬ'}
        <small>{formatRub(betAmount)}</small>
      </button>
      {rulesLink}
    </section>
  );
}
