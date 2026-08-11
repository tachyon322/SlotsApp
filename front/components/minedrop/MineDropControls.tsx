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
    <section className="minedrop_controls" aria-label="Ставка">
      <div className="minedrop_betBar">
        <span className="minedrop_betLabel">СТАВКА</span>
        <div className="minedrop_stepper">
          <button
            type="button"
            className="minedrop_stepBtn"
            aria-label="Меньше"
            disabled={locked}
            onClick={() => onStep(-1)}
          >
            <Minus className="minedrop_stepIcon" />
          </button>
          <span className="minedrop_stakeValue">{formatRub(betAmount)}</span>
          <button
            type="button"
            className="minedrop_stepBtn"
            aria-label="Больше"
            disabled={locked}
            onClick={() => onStep(1)}
          >
            <Plus className="minedrop_stepIcon" />
          </button>
        </div>
        <button type="button" className="minedrop_playCta" disabled={spinning} onClick={onPrimary}>
          {ctaLabel}
        </button>
      </div>

      <div className="minedrop_presets" role="group" aria-label="Размер ставки">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="minedrop_preset"
            aria-pressed={betAmount === preset}
            data-active={betAmount === preset ? 'true' : undefined}
            disabled={locked}
            onClick={() => onBet(preset)}
          >
            {formatRub(preset)}
          </button>
        ))}
      </div>

      <div className="minedrop_actions">
        <button
          type="button"
          className="minedrop_actionBtn"
          disabled={!canReceipt}
          onClick={onReceipt}
        >
          <ReceiptText className="minedrop_actionIcon" />
          Чек
        </button>
        <button type="button" className="minedrop_actionBtn" onClick={onRules}>
          <HelpCircle className="minedrop_actionIcon" />
          Как играть
        </button>
      </div>
    </section>
  );
}
