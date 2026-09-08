'use client';

import React from 'react';
import { Coins, Trophy, Package } from 'lucide-react';
import { CASES_LIST } from '@/lib/cases/engine';
import { useUser } from '@/components/UserProvider';
import { formatMoney } from '@/components/cases/drops';

interface CasesControlsProps {
  activeCaseId: string;
  activeLines: number;
  totalBet: number;
  maxPayout: number;
  spinning: boolean;
  onSelectCase: (caseId: string) => void;
  onSelectLines: (lines: number) => void;
  onSpin: () => void;
  onOpenContents: () => void;
}

export function CasesControls({
  activeCaseId,
  activeLines,
  totalBet,
  maxPayout,
  spinning,
  onSelectCase,
  onSelectLines,
  onSpin,
  onOpenContents,
}: CasesControlsProps) {
  const { user } = useUser();
  const activeCase = CASES_LIST.find((c) => c.id === activeCaseId) || CASES_LIST[0];
  const insufficient = !!user && user.balance < totalBet;

  return (
    <section className="cs-controlsPanel" aria-label="Параметры открытия">
      <div className="cs-betBlock">
        {/* Readout tiles */}
        <div className="cs-betTiles">
          <div className="cs-betTile">
            <span className="cs-betLabel">
              <Coins className="cs-readoutIcon" aria-hidden="true" />
              Ставка за линию
            </span>
            <span className="cs-betValue">{formatMoney(activeCase.price)}</span>
          </div>
          <div className="cs-betTile">
            <span className="cs-betLabel">Итого</span>
            <span className="cs-betValue">{formatMoney(totalBet)}</span>
            <span className="cs-betSub">до {formatMoney(maxPayout)} по таблице</span>
          </div>
        </div>

        {/* Lines selection */}
        <div className="cs-lineSelect">
          <span className="cs-lineSelectLabel">Линии</span>
          <div className="cs-lineTabs" role="group" aria-label="Количество линий">
            {[1, 2, 3].map((num) => (
              <button
                key={num}
                type="button"
                className="cs-lineTab"
                data-active={activeLines === num}
                aria-label={`${num} ${num === 1 ? 'линия' : num < 5 ? 'линии' : 'линий'}`}
                aria-pressed={activeLines === num}
                disabled={spinning}
                onClick={() => onSelectLines(num)}
              >
                {num}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Case chips */}
      <div className="cs-chips" role="group" aria-label="Выбор кейса">
        {CASES_LIST.map((c) => {
          const isActive = activeCaseId === c.id;
          const displayPrice = c.price >= 1000 ? `${c.price / 1000}k ₽` : `${c.price} ₽`;

          return (
            <button
              key={c.id}
              type="button"
              className="cs-chip"
              data-active={isActive}
              data-case={c.id}
              aria-label={c.ariaLabel}
              aria-pressed={isActive}
              disabled={spinning}
              onClick={() => onSelectCase(c.id)}
            >
              {isActive && <span className="cs-chipDot" aria-hidden="true" />}
              <span className="cs-chipIcon" aria-hidden="true" />
              <span className="cs-chipName">{c.name.replace(' кейс', '')}</span>
              <span className="cs-chipPrice">{displayPrice}</span>
            </button>
          );
        })}
      </div>

      {/* Action row: main CTA + contents */}
      <div className="cs-actionRow">
        <button
          type="button"
          className="cs-openCta"
          data-pulse={false}
          disabled={spinning || insufficient}
          onClick={onSpin}
        >
          <Trophy className="cs-openCtaIcon" data-spin={spinning} aria-hidden="true" />
          {spinning ? 'ОТКРЫВАЕМ...' : insufficient ? 'Недостаточно средств' : 'ОТКРЫТЬ КЕЙС'}
        </button>

        <div className="cs-secondary">
          <button type="button" className="cs-linkBtn" onClick={onOpenContents}>
            <Package className="cs-linkIcon" aria-hidden="true" />
            Содержимое
          </button>
        </div>
      </div>
    </section>
  );
}
