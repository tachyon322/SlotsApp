'use client';

import React from 'react';
import { Sparkles, Info } from 'lucide-react';
import { formatRub } from '@/components/slots/symbols';

interface SlotsCtaProps {
  totalBet: number;
  spinning: boolean;
  insufficient?: boolean;
  disabled?: boolean;
  onSpin: () => void;
  onOpenRules: () => void;
}

export function SlotsCta({
  totalBet,
  spinning,
  insufficient = false,
  disabled = false,
  onSpin,
  onOpenRules,
}: SlotsCtaProps) {
  const label = spinning ? 'ВРАЩЕНИЕ...' : insufficient ? 'Недостаточно средств' : 'КРУТИТЬ';

  return (
    <div className="slv2-actionRow">
      <button
        type="button"
        className="sl-spinCta slv2-spinCta"
        disabled={disabled || spinning || insufficient}
        onClick={onSpin}
      >
        <span className="sl-spinCtaLabel">
          <Sparkles className="sl-spinCtaIcon" data-spin={spinning} aria-hidden="true" />
          {label}
        </span>
        {!spinning && !insufficient && (
          <span className="sl-spinCtaCost">{formatRub(totalBet)}</span>
        )}
      </button>

      <button type="button" className="sl-rulesBtn slv2-rulesBtn" onClick={onOpenRules}>
        <Info className="sl-rulesIcon" aria-hidden="true" />
        Правила
      </button>
    </div>
  );
}
