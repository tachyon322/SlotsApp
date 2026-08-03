'use client';

import React from 'react';
import { Coins, Trophy, Package } from 'lucide-react';
import { CASES_LIST } from '@/lib/cases/engine';

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
  const lineBet = CASES_LIST.find((c) => c.id === activeCaseId)?.price || 100;

  return (
    <>
      <div className="cases_betBlock__X5L7Z">
        {/* Readout tiles */}
        <div className="cases_betTiles__zr82P">
          <div className="cases_betTile__IO2to">
            <span className="cases_betLabel___PQ5G">
              <Coins className="cases_readoutIcon__dlEex" aria-hidden="true" />
              Ставка за линию
            </span>
            <span className="cases_betValue__elzMm">{lineBet.toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="cases_betTile__IO2to">
            <span className="cases_betLabel___PQ5G">
              {activeLines > 1 ? `Итого · ${activeLines} лин.` : 'Итого'}
            </span>
            <span className="cases_betValue__elzMm">{totalBet.toLocaleString('ru-RU')} ₽</span>
            <span className="cases_betSub__pY9k3">
              макс. {maxPayout.toLocaleString('ru-RU')} ₽
            </span>
          </div>
        </div>

        {/* Lines selection */}
        <div className="cases_lineSelect__7hTsz">
          <span className="cases_lineSelectLabel__CmzSY">Линии</span>
          <div className="cases_lineTabs__hhFGU" role="group" aria-label="Количество линий">
            {[1, 2, 3].map((num) => (
              <button
                key={num}
                type="button"
                className="cases_lineTab__UVxEe"
                data-active={activeLines === num ? "true" : "false"}
                aria-label={`${num} ${num === 1 ? 'линия' : 'линии'}`}
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
      <div className="cases_chips__EgHF_" role="group" aria-label="Выбор кейса">
        {CASES_LIST.map((c) => {
          const isActive = activeCaseId === c.id;
          const displayPrice = c.price >= 1000 ? `${c.price / 1000}k ₽` : `${c.price} ₽`;

          return (
            <button
              key={c.id}
              type="button"
              className="cases_chip__d943C"
              data-active={isActive ? "true" : "false"}
              aria-label={c.ariaLabel}
              disabled={spinning}
              onClick={() => onSelectCase(c.id)}
            >
              {isActive && <span className="cases_chipDot__RDN0F" aria-hidden="true" />}
              <span className="cases_chipIcon__FWB2l" aria-hidden="true">
                {c.icon}
              </span>
              <span className="cases_chipPrice__6hSgh">{displayPrice}</span>
            </button>
          );
        })}
      </div>

      {/* Main Spin CTA Button */}
      <button
        type="button"
        className="cases_openCta__inYtL"
        data-pulse={!spinning ? "true" : "false"}
        disabled={spinning}
        onClick={onSpin}
      >
        <Trophy className="cases_openCtaIcon___Y2qH" aria-hidden="true" />
        {spinning ? 'Вращение...' : `Крутить за ${totalBet.toLocaleString('ru-RU')} ₽`}
      </button>

      {/* Secondary Button: Contents */}
      <div className="cases_secondary__yqtS1">
        <button
          type="button"
          className="cases_linkBtn__onE_U"
          onClick={onOpenContents}
        >
          <Package className="cases_linkIcon__Duk6X" aria-hidden="true" />
          Содержимое
        </button>
      </div>
    </>
  );
}
