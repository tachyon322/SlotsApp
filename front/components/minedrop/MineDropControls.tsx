'use client';

import { BookOpen, ReceiptText, Zap } from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { PRESETS, formatRub } from '@/lib/minedrop/engine';
import type { Phase } from '@/hooks/useMinedropGame';

interface MineDropControlsProps {
  phase: Phase;
  betAmount: number;
  turbo: boolean;
  canReceipt: boolean;
  onBet: (amount: number) => void;
  onPrimary: () => void;
  onTurbo: () => void;
  onReceipt: () => void;
  onRules: () => void;
}

export function MineDropControls({
  phase,
  betAmount,
  turbo,
  canReceipt,
  onBet,
  onPrimary,
  onTurbo,
  onReceipt,
  onRules,
}: MineDropControlsProps) {
  const { user } = useUser();
  const playing = phase === 'playing';
  const insufficient = !playing && !!user && user.balance < betAmount;

  let label = 'ИГРАТЬ';
  let kind = 'start';
  if (playing) {
    label = 'КОПАЕМ…';
    kind = 'busy';
  } else if (insufficient) {
    label = 'НЕ ХВАТАЕТ СРЕДСТВ';
  } else if (phase === 'resolved') {
    label = 'ЕЩЁ РАЗ';
    kind = 'again';
  }

  return (
    <section className="md2-ctl" aria-label="Ставка">
      <div className="md2-bets" role="group" aria-label="Сумма ставки">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={betAmount === preset}
            disabled={playing}
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
        disabled={playing || insufficient}
        onClick={onPrimary}
      >
        {label}
        {!playing && <small>{formatRub(betAmount)}</small>}
      </button>

      <div className="md2-links">
        <button type="button" aria-pressed={turbo} data-active={turbo || undefined} onClick={onTurbo}>
          <Zap aria-hidden="true" />
          Турбо
        </button>
        <button type="button" onClick={onReceipt} disabled={!canReceipt}>
          <ReceiptText aria-hidden="true" />
          Чек раунда
        </button>
        <button type="button" onClick={onRules} disabled={playing}>
          <BookOpen aria-hidden="true" />
          Правила
        </button>
      </div>
    </section>
  );
}
