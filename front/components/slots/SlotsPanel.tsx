'use client';

import React from 'react';
import { Layers, Coins } from 'lucide-react';
import type { SlotMode } from '@/hooks/useSlotsGame';
import { useUser } from '@/components/UserProvider';

interface SlotsPanelProps {
  mode: SlotMode;
  activeLines: number;
  lineBet: number;
  totalBet: number;
  disabled?: boolean;
  onActiveLinesChange: (lines: number) => void;
  onLineBetChange: (bet: number) => void;
}

const PRESET_BETS = [10, 50, 100, 500];

export function SlotsPanel({
  mode,
  activeLines,
  lineBet,
  totalBet,
  disabled = false,
  onActiveLinesChange,
  onLineBetChange,
}: SlotsPanelProps) {
  const { user } = useUser();
  const maxAvailableLines = mode === 'mega' ? 5 : 3;
  const availableLinesList = Array.from({ length: maxAvailableLines }, (_, i) => i + 1);

  const handleStep = (delta: number) => {
    const next = Math.max(1, lineBet + delta);
    onLineBetChange(next);
  };

  const handleMultiply = () => {
    onLineBetChange(lineBet * 2);
  };

  const handleMax = () => {
    const userBalance = user?.balance ?? 1000;
    const maxLineBet = Math.max(1, Math.floor(userBalance / activeLines));
    onLineBetChange(maxLineBet);
  };

  return (
    <section className="slots_panel___wK8R" aria-label="Ставка">
      <div className="slots_panelStats__IVjXr">
        <div className="slots_statRow__KE_P2">
          <span className="slots_statLabel__X_N3j">
            <Layers className="slots_statIcon__2wWUW" aria-hidden="true" />
            Ряды
          </span>
          <span className="slots_statValueGold__ek9BQ">{totalBet} ₽</span>
        </div>
        <div className="slots_statRow__KE_P2">
          <span className="slots_statLabel__X_N3j">
            <Coins className="slots_statIcon__2wWUW" aria-hidden="true" />
            Ставка
          </span>
          <span className="slots_statValueGreen__m2NuF">{lineBet} ₽</span>
        </div>
      </div>

      <div className="slots_controls__vsCxN">
        {/* Row count chip selector */}
        <div className="slots_rows__u_rx_" role="group" aria-label="Активные ряды">
          {availableLinesList.map((rowNum) => {
            const isActive = activeLines === rowNum;
            return (
              <button
                key={rowNum}
                type="button"
                className="slots_rowChip__0QtwF"
                data-row={rowNum}
                data-active={isActive}
                aria-pressed={isActive}
                disabled={disabled}
                onClick={() => onActiveLinesChange(rowNum)}
              >
                {isActive ? (
                  <span className="slots_rowChipDot__zuRby" aria-hidden="true" />
                ) : (
                  <span className="slots_rowChipNum__7h77g">
                    <span className="slots_rowBars__rvVGN" aria-hidden="true">
                      <i /><i /><i />
                    </span>
                  </span>
                )}
                <span className="slots_rowChipNum__7h77g">{rowNum}</span>
                <span className="slots_rowChipMult__37Fbi">×{rowNum}</span>
              </button>
            );
          })}
        </div>

        {/* Stepper + Quick Bet Chips */}
        <div className="slots_stepperWrap__951TO">
          <div className="slots_stepper__4Jyt7">
            <button
              type="button"
              className="slots_stepBtn__QILgr slots_stepMinus__XLmWA"
              aria-label="Уменьшить ставку"
              disabled={disabled || lineBet <= 1}
              onClick={() => handleStep(-10)}
            >
              −
            </button>
            <span className="slots_stepValue__BSMGX" aria-live="polite">
              {lineBet}
            </span>
            <button
              type="button"
              className="slots_stepBtn__QILgr slots_stepPlus__NlgBO"
              aria-label="Увеличить ставку"
              disabled={disabled}
              onClick={() => handleStep(10)}
            >
              +
            </button>
          </div>

          <div className="slots_chips__mrZGU" role="group" aria-label="Быстрая ставка">
            {PRESET_BETS.map((val) => (
              <button
                key={val}
                type="button"
                className="slots_chip__w8UrO"
                data-active={lineBet === val}
                disabled={disabled}
                onClick={() => onLineBetChange(val)}
              >
                {val}
              </button>
            ))}
            <button
              type="button"
              className="slots_chip__w8UrO slots_chipX2__DS2Xm"
              disabled={disabled}
              onClick={handleMultiply}
            >
              ×2
            </button>
            <button
              type="button"
              className="slots_chip__w8UrO slots_chipMax__p1o1X"
              disabled={disabled}
              onClick={handleMax}
            >
              MAX
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
