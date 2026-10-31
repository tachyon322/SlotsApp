'use client';

import { BookOpen, ReceiptText } from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { PRESETS, formatRub } from '@/lib/minedrop/engine';
import type { Phase } from '@/hooks/useMinedropGame';

interface MineDropControlsProps {
  phase: Phase;
  betAmount: number;
  canReceipt: boolean;
  onBet: (amount: number) => void;
  onPrimary: () => void;
  onReceipt: () => void;
  onRules: () => void;
}

export function MineDropControls({
  phase,
  betAmount,
  canReceipt,
  onBet,
  onPrimary,
  onReceipt,
  onRules,
}: MineDropControlsProps) {
  const { user } = useUser();
  const locked = phase !== 'idle';
  const spinning = phase === 'spinning';
  const insufficient = phase === 'idle' && !!user && user.balance < betAmount;

  let label = 'ИГРАТЬ';
  let kind = 'start';
  if (spinning) {
    label = 'КОПАЕМ…';
    kind = 'busy';
  } else if (phase === 'resolved') {
    label = 'ЕЩЁ РАЗ';
    kind = 'again';
  } else if (insufficient) {
    label = 'НЕ ХВАТАЕТ СРЕДСТВ';
  }

  return (
    <section className="md2-ctl" aria-label="Ставка">
      <div className="md2-bets" role="group" aria-label="Сумма ставки">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={betAmount === preset}
            disabled={locked}
            onClick={() => onBet(preset)}
          >
            {preset.toLocaleString('ru-RU')}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="md2-cta"
        data-kind={kind}
        disabled={spinning || insufficient}
        onClick={onPrimary}
      >
        {label}
        {!spinning && <small>{formatRub(betAmount)}</small>}
      </button>

      <div className="md2-links">
        <button type="button" onClick={onReceipt} disabled={!canReceipt}>
          <ReceiptText aria-hidden="true" />
          Чек раунда
        </button>
        <button type="button" onClick={onRules} disabled={spinning}>
          <BookOpen aria-hidden="true" />
          Правила
        </button>
      </div>
    </section>
  );
}
