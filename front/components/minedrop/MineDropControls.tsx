'use client';

import { Minus, Plus, ReceiptText, HelpCircle, Zap } from 'lucide-react';
import { PRESETS, formatRub } from '@/lib/minedrop/engine';
import type { Phase } from '@/hooks/useMinedropGame';

interface MineDropControlsProps {
  phase: Phase;
  betAmount: number;
  turbo: boolean;
  canReceipt: boolean;
  onBet: (amount: number) => void;
  onStep: (delta: 1 | -1) => void;
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
  onStep,
  onPrimary,
  onTurbo,
  onReceipt,
  onRules,
}: MineDropControlsProps) {
  const playing = phase === 'playing';
  const ctaLabel = playing ? 'Копаем…' : phase === 'resolved' ? 'ЕЩЁ РАЗ' : 'ИГРАТЬ';

  return (
    <section className="md-controls" aria-label="Ставка">
      <div className="md-betBar">
        <span className="md-betLabel">СТАВКА</span>
        <div className="md-stepper">
          <button type="button" className="md-stepBtn" aria-label="Меньше" disabled={playing} onClick={() => onStep(-1)}>
            <Minus className="md-stepIcon" />
          </button>
          <span className="md-stakeValue">{formatRub(betAmount)}</span>
          <button type="button" className="md-stepBtn" aria-label="Больше" disabled={playing} onClick={() => onStep(1)}>
            <Plus className="md-stepIcon" />
          </button>
        </div>
        <button type="button" className="md-playCta" disabled={playing} onClick={onPrimary}>
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
            disabled={playing}
            onClick={() => onBet(preset)}
          >
            {formatRub(preset)}
          </button>
        ))}
      </div>

      <div className="md-actions">
        <button type="button" className="md-actionBtn" aria-pressed={turbo} data-active={turbo ? 'true' : undefined} onClick={onTurbo}>
          <Zap className="md-actionIcon" />
          Турбо
        </button>
        <button type="button" className="md-actionBtn" disabled={!canReceipt} onClick={onReceipt}>
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
