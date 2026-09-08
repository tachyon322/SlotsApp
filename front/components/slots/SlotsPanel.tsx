'use client';

import React, { useId } from 'react';
import { Layers, Coins } from 'lucide-react';
import type { SlotMode } from '@/hooks/useSlotsGame';
import { useUser } from '@/components/UserProvider';
import { formatRub } from '@/components/slots/symbols';

interface SlotsPanelProps {
  mode: SlotMode;
  activeLines: number;
  lineBet: number;
  totalBet: number;
  disabled?: boolean;
  onActiveLinesChange: (lines: number) => void;
  onLineBetChange: (bet: number) => void;
}

const PRESET_BETS = [10, 50, 100, 500, 1000];
const MIN_LINE_BET = 1;
const MAX_INPUT_LENGTH = 6;

export function SlotsPanel({
  mode,
  activeLines,
  lineBet,
  totalBet,
  disabled = false,
  onActiveLinesChange,
  onLineBetChange,
}: SlotsPanelProps) {
  const wagerId = useId();
  const { user } = useUser();
  const maxAvailableLines = mode === 'mega' ? 5 : 3;
  const rows = Array.from({ length: maxAvailableLines }, (_, i) => i + 1);

  // Поле ввода: только цифры; при блюре прижимаем к минимуму.
  const handleInput = (raw: string) => {
    const digits = raw.replace(/\D/g, '').slice(0, MAX_INPUT_LENGTH);
    onLineBetChange(digits ? Number(digits) : 0);
  };
  const handleBlur = () => {
    if (lineBet < MIN_LINE_BET) onLineBetChange(MIN_LINE_BET);
  };

  const handleStep = (delta: number) => {
    onLineBetChange(Math.max(MIN_LINE_BET, lineBet + delta));
  };

  const handleMultiply = () => {
    onLineBetChange(lineBet * 2);
  };

  const handleMax = () => {
    const userBalance = user?.balance ?? 1000;
    onLineBetChange(Math.max(MIN_LINE_BET, Math.floor(userBalance / activeLines)));
  };

  return (
    <section className="sl-panel slv2-betPanel" aria-label="Ставка">
      <div className="slv2-rowControl">
        <span className="slv2-controlLabel">Множитель ставки</span>
        <div className="sl-rows slv2-rowSelector" role="group" aria-label="Множитель стоимости раунда">
          {rows.map((rowNum) => {
            const isActive = activeLines === rowNum;
            return (
              <button
                key={rowNum}
                type="button"
                className="sl-rowChip"
                data-row={rowNum}
                data-active={isActive}
                aria-pressed={isActive}
                disabled={disabled}
                onClick={() => onActiveLinesChange(rowNum)}
              >
                {isActive && <span className="sl-rowChipDot" aria-hidden="true" />}
                <span className="sl-rowChipNum">
                  {!isActive && (
                    <span className="sl-rowBars" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  )}
                  {rowNum}
                </span>
                <span className="sl-rowChipMult">×{rowNum}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="sl-stepperWrap slv2-betStepper">
        <div className="wg-root" data-wager-control="true">
          <div className="wg-heading">
            <label htmlFor={wagerId}>Ставка за ряд</label>
            <span id={`${wagerId}-bounds`}>
              {formatRub(MIN_LINE_BET)} — {formatRub(100_000)}
            </span>
          </div>
          <div className="wg-entry">
            <div className="wg-field">
              <input
                id={wagerId}
                inputMode="decimal"
                autoComplete="off"
                spellCheck={false}
                type="text"
                value={lineBet > 0 ? String(lineBet) : ''}
                aria-invalid="false"
                aria-describedby={`${wagerId}-bounds`}
                disabled={disabled}
                onChange={(e) => handleInput(e.target.value)}
                onBlur={handleBlur}
              />
              <span aria-hidden="true">₽</span>
            </div>
          </div>
          <div className="wg-presets" role="group" aria-label="Быстрая ставка">
            {PRESET_BETS.map((bet) => (
              <button
                key={bet}
                type="button"
                aria-pressed={lineBet === bet}
                disabled={disabled}
                onClick={() => onLineBetChange(bet)}
              >
                {formatRub(bet)}
              </button>
            ))}
          </div>
        </div>

        <div className="slv2-betShortcuts" role="group" aria-label="Изменить ставку">
          <button
            type="button"
            className="sl-stepBtn sl-stepMinus"
            aria-label="Уменьшить ставку"
            disabled={disabled || lineBet <= MIN_LINE_BET}
            onClick={() => handleStep(-10)}
          >
            −
          </button>
          <button
            type="button"
            className="sl-stepBtn sl-stepPlus"
            aria-label="Увеличить ставку"
            disabled={disabled}
            onClick={() => handleStep(10)}
          >
            +
          </button>
          <button
            type="button"
            className="sl-chip sl-chipX2 slv2-betChip"
            disabled={disabled}
            onClick={handleMultiply}
          >
            ×2
          </button>
          <button
            type="button"
            className="sl-chip sl-chipMax slv2-betChip"
            disabled={disabled}
            onClick={handleMax}
          >
            MAX
          </button>
        </div>
      </div>

      <div className="slv2-betSummary" role="region" aria-label="Расчёт стоимости раунда">
        <dl className="sl-panelStats slv2-betStats">
          <div className="sl-statRow">
            <dt className="sl-statLabel">
              <Layers className="sl-statIcon" aria-hidden="true" />
              Стоимость раунда
            </dt>
            <dd className="sl-statValueGold" data-testid="slots-total-stake">
              {formatRub(totalBet)}
            </dd>
          </div>
          <div className="sl-statRow">
            <dt className="sl-statLabel">
              <Coins className="sl-statIcon" aria-hidden="true" />
              Ставка за ряд
            </dt>
            <dd className="sl-statValueGreen">{formatRub(lineBet)}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
