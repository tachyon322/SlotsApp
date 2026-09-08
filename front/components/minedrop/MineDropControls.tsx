'use client';

import { Minus, Plus, ReceiptText, HelpCircle } from 'lucide-react';
import { PRESETS, formatRub } from '@/lib/minedrop/engine';
import type { Phase } from '@/hooks/useMinedropGame';

interface MineDropControlsProps {
  phase: Phase;
  betAmount: number;
  canReceipt: boolean;
  onBet: (amount: number) => void;
  onStep: (delta: 1 | -1) => void;
  onPrimary: () => void;
  onReceipt: () => void;
  onRules: () => void;
}

export function MineDropControls({
  phase,
  betAmount,
  canReceipt,
  onBet,
  onStep,
  onPrimary,
  onReceipt,
  onRules,
}: MineDropControlsProps) {
  const locked = phase !== 'idle';
  const spinning = phase === 'spinning';

  const ctaLabel = spinning ? 'Крутим…' : phase === 'resolved' ? '🔁 Ещё раз' : 'ИГРАТЬ';

  return (
    <section className="md-controls" aria-label="Ставка">
      <div className="md-betBar">
        <span className="md-betLabel">СТАВКА</span>
        <div className="md-stepper">
          <button
            type="button"
            className="md-stepBtn"
            aria-label="Меньше"
            disabled={locked}
            onClick={() => onStep(-1)}
          >
            <Minus className="md-stepIcon" />
          </button>
          <span className="md-stakeValue">{formatRub(betAmount)}</span>
          <button
            type="button"
            className="md-stepBtn"
            aria-label="Больше"
            disabled={locked}
            onClick={() => onStep(1)}
          >
            <Plus className="md-stepIcon" />
          </button>
        </div>
        <button type="button" className="md-playCta" disabled={spinning} onClick={onPrimary}>
          {ctaLabel}
        </button>
      </div>

      <div className="md-presets" role="group" aria-label="Размер ставки">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="md-preset"
            aria-pressed={betAmount === preset}
            data-active={betAmount === preset ? 'true' : undefined}
            disabled={locked}
            onClick={() => onBet(preset)}
          >
            {formatRub(preset)}
          </button>
        ))}
      </div>

      <div className="md-actions">
        <button
          type="button"
          className="md-actionBtn"
          disabled={!canReceipt}
          onClick={onReceipt}
        >
          <ReceiptText className="md-actionIcon" />
          Чек
        </button>
        <button type="button" className="md-actionBtn" onClick={onRules}>
          <HelpCircle className="md-actionIcon" />
          Как играть
        </button>
      </div>
    </section>
  );
}
