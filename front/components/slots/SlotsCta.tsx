'use client';

import React from 'react';
import { Sparkles, Info } from 'lucide-react';

interface SlotsCtaProps {
  totalBet: number;
  spinning: boolean;
  disabled?: boolean;
  onSpin: () => void;
  onOpenRules: () => void;
}

export function SlotsCta({
  totalBet,
  spinning,
  disabled = false,
  onSpin,
  onOpenRules,
}: SlotsCtaProps) {
  return (
    <div className="flex flex-col gap-3 w-full items-center">
      <button
        type="button"
        className="slots_spinCta__w0ZOj"
        disabled={disabled || spinning}
        onClick={onSpin}
      >
        <span className="slots_spinCtaLabel__N9dD4">
          <Sparkles className="slots_spinCtaIcon__2HsLE" aria-hidden="true" />
          {spinning ? 'ВРАЩЕНИЕ...' : 'КРУТИТЬ'}
        </span>
        <span className="slots_spinCtaCost__c_JsP">{totalBet} ₽</span>
      </button>

      <button
        type="button"
        className="slots_rulesBtn__ywHob"
        onClick={onOpenRules}
      >
        <Info className="slots_rulesIcon__MtVC1" aria-hidden="true" />
        Правила
      </button>
    </div>
  );
}
