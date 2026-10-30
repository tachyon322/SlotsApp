'use client';

import { Info } from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { formatMoney } from '@/components/cases/drops';

interface CasesControlsProps {
  linePrice: number;
  activeLines: number;
  totalBet: number;
  spinning: boolean;
  onSelectLines: (lines: number) => void;
  onSpin: () => void;
  onOpenContents: () => void;
}

export function CasesControls({
  linePrice,
  activeLines,
  totalBet,
  spinning,
  onSelectLines,
  onSpin,
  onOpenContents,
}: CasesControlsProps) {
  const { user } = useUser();
  const insufficient = !!user && user.balance < totalBet;

  return (
    <section className="kc-ctl" aria-label="Параметры открытия">
      <div className="kc-lines" role="group" aria-label="Количество линий">
        {[1, 2, 3].map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={activeLines === n}
            disabled={spinning}
            onClick={() => onSelectLines(n)}
          >
            <b>
              {n} {n === 1 ? 'линия' : 'линии'}
            </b>
            <small>{formatMoney(linePrice * n)}</small>
          </button>
        ))}
      </div>

      <button
        type="button"
        className="kc-cta"
        data-kind={insufficient ? 'poor' : spinning ? 'busy' : 'open'}
        disabled={spinning || insufficient}
        onClick={onSpin}
      >
        {spinning ? 'ОТКРЫВАЕМ…' : insufficient ? 'НЕ ХВАТАЕТ СРЕДСТВ' : 'ОТКРЫТЬ'}
        {!spinning && <small>{formatMoney(totalBet)}</small>}
      </button>

      <button type="button" className="kc-info" onClick={onOpenContents}>
        <Info aria-hidden="true" />
        Что внутри и шансы
      </button>
    </section>
  );
}
