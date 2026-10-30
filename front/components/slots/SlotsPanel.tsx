'use client';

import { useId } from 'react';
import { Minus, Plus } from 'lucide-react';
import type { SlotMode } from '@/hooks/useSlotsGame';
import { useUser } from '@/components/UserProvider';
import { formatRub } from '@/components/slots/symbols';
import { paylinesFor, PaylineGlyph } from '@/components/slots/paylines';

interface SlotsPanelProps {
  mode: SlotMode;
  activeLines: number;
  lineBet: number;
  disabled?: boolean;
  onActiveLinesChange: (lines: number) => void;
  onLineBetChange: (bet: number) => void;
}

const PRESET_BETS = [10, 50, 100, 500, 1000];
const MIN_LINE_BET = 1;
const MAX_LINE_BET = 100_000;
const MAX_INPUT_LENGTH = 6;

export function SlotsPanel({
  mode,
  activeLines,
  lineBet,
  disabled = false,
  onActiveLinesChange,
  onLineBetChange,
}: SlotsPanelProps) {
  const wagerId = useId();
  const { user } = useUser();
  const lines = paylinesFor(mode);

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
    <section className="sg-ctl" aria-label="Ставка">
      <div className="sg-lines" role="group" aria-label="Число линий выплат">
        <span className="sg-lbl">Линии</span>
        {lines.map((line) => (
          <button
            key={line.id}
            type="button"
            aria-pressed={line.id <= activeLines}
            aria-label={`${line.id} ${line.id === 1 ? 'линия' : 'линии'}`}
            disabled={disabled}
            onClick={() => onActiveLinesChange(line.id)}
          >
            <PaylineGlyph line={line} />
            {line.id}
          </button>
        ))}
      </div>

      <div className="sg-bet">
        <div className="sg-step">
          <button
            type="button"
            aria-label="Уменьшить ставку"
            disabled={disabled || lineBet <= MIN_LINE_BET}
            onClick={() => handleStep(-10)}
          >
            <Minus aria-hidden="true" />
          </button>
          <label htmlFor={wagerId}>
            <small>За линию</small>
            <span className="sg-step-val">
              <span className="sg-fit" data-value={lineBet > 0 ? String(lineBet) : '0'}>
                <input
                  id={wagerId}
                  inputMode="numeric"
                  autoComplete="off"
                  spellCheck={false}
                  type="text"
                  size={1}
                  placeholder="0"
                  value={lineBet > 0 ? String(lineBet) : ''}
                  aria-describedby={`${wagerId}-bounds`}
                  disabled={disabled}
                  onChange={(e) => handleInput(e.target.value)}
                  onBlur={handleBlur}
                />
              </span>
              ₽
            </span>
          </label>
          <button type="button" aria-label="Увеличить ставку" disabled={disabled} onClick={() => handleStep(10)}>
            <Plus aria-hidden="true" />
          </button>
        </div>
        <button type="button" className="sg-q" disabled={disabled} onClick={handleMultiply}>
          ×2
        </button>
        <button type="button" className="sg-q" disabled={disabled} onClick={handleMax}>
          MAX
        </button>
      </div>
      <span id={`${wagerId}-bounds`} className="sr-only">
        от {formatRub(MIN_LINE_BET)} до {formatRub(MAX_LINE_BET)} за линию
      </span>

      <div className="sg-presets" role="group" aria-label="Быстрая ставка">
        {PRESET_BETS.map((bet) => (
          <button
            key={bet}
            type="button"
            aria-pressed={lineBet === bet}
            disabled={disabled}
            onClick={() => onLineBetChange(bet)}
          >
            {bet.toLocaleString('ru-RU')}
          </button>
        ))}
      </div>
    </section>
  );
}
