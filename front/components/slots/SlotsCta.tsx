'use client';

import { formatRub } from '@/components/slots/symbols';

interface SlotsCtaProps {
  totalBet: number;
  spinning: boolean;
  insufficient?: boolean;
  disabled?: boolean;
  onSpin: () => void;
}

export function SlotsCta({ totalBet, spinning, insufficient = false, disabled = false, onSpin }: SlotsCtaProps) {
  const label = spinning ? 'ВРАЩЕНИЕ…' : insufficient ? 'Недостаточно средств' : 'КРУТИТЬ';

  return (
    <button
      type="button"
      className="sg-cta"
      data-spinning={spinning}
      disabled={disabled || spinning || insufficient}
      onClick={onSpin}
    >
      {label}
      {!spinning && !insufficient && (
        <small data-testid="slots-total-stake">{formatRub(totalBet)}</small>
      )}
    </button>
  );
}
