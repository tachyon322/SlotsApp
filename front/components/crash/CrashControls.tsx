'use client';

import { useEffect, useSyncExternalStore, useState } from 'react';
import { heat } from '@/lib/crash/engine';
import type { CrashState, PlayerBet, CrashLive } from '@/hooks/useCrashGame';
import { PRESETS } from '@/hooks/useCrashGame';

const MIN_BET = 10;
const MAX_BET = 10_000;

interface CrashControlsProps {
  state: CrashState;
  live: CrashLive;
  onPreset: (amount: number) => void;
  onToggleAuto: (on: boolean) => void;
  onStepAuto: (delta: number) => void;
  onPrimary: () => void;
  busy: boolean;
}

function formatRub(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

type Cta =
  | { kind: 'bet'; label: string }
  | { kind: 'cancel'; label: string }
  | { kind: 'cashout'; label: string }
  | { kind: 'waiting'; label: string };

function nextCta(
  phase: CrashState['phase'],
  player: PlayerBet | null,
  amount: number,
  liveMultiplier: number,
): Cta {
  if (phase === 'flying') {
    if (player && player.status === 'in') {
      const win = Math.round(player.amount * liveMultiplier);
      return {
        kind: 'cashout',
        label: `ЗАБРАТЬ ${liveMultiplier.toFixed(2)}× · +${formatRub(win)}`,
      };
    }
    return { kind: 'waiting', label: 'Идёт раунд…' };
  }
  if (phase === 'crashed') {
    if (player && player.status === 'pending') {
      return { kind: 'cancel', label: 'ОТМЕНИТЬ СТАВКУ' };
    }
    return { kind: 'bet', label: `НА СЛЕДУЮЩИЙ РАУНД · ${formatRub(amount)}` };
  }
  // betting
  if (player && player.status === 'pending') {
    return { kind: 'cancel', label: 'ОТМЕНИТЬ СТАВКУ' };
  }
  return { kind: 'bet', label: `СТАВКА · ${formatRub(amount)}` };
}

export function CrashControls({
  state,
  live,
  onPreset,
  onToggleAuto,
  onStepAuto,
  onPrimary,
  busy,
}: CrashControlsProps) {
  const liveMultiplier = useSyncExternalStore(
    live.subscribe,
    live.getSnapshot,
    live.getSnapshot,
  );
  const cta = nextCta(
    state.phase,
    state.player,
    state.player?.amount ?? state.betAmount,
    liveMultiplier,
  );

  // Свободный ввод суммы: локальный текст, валидные значения коммитим в хук.
  const [text, setText] = useState(() => String(state.betAmount));
  useEffect(() => {
    setText(String(state.betAmount));
  }, [state.betAmount]);

  const parsed = Number.parseInt(text.replace(/\s/g, ''), 10);
  const invalid =
    text.trim() === '' || Number.isNaN(parsed) || parsed < MIN_BET || parsed > MAX_BET;

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, '').slice(0, 16);
    setText(cleaned);
    const n = Number.parseInt(cleaned, 10);
    if (!Number.isNaN(n) && n >= MIN_BET && n <= MAX_BET) onPreset(n);
  };

  const betLocked = !!state.player && state.player.status === 'pending';

  return (
    <section id="crash-bet-console" className="cg-controls" aria-label="Ставка">
      <header className="cg-panelHead">
        <span>
          Ваша ставка
          <small>Любая сумма в действующем диапазоне</small>
        </span>
        <span className="cg-stakeSummary">
          <strong>{formatRub(state.player?.amount ?? state.betAmount)}</strong>
          <small>Макс. {formatRub(MAX_BET)}</small>
        </span>
      </header>

      <div className="cg-amountRow">
        <label className="cg-amountField" data-invalid={invalid}>
          <span>Своя сумма</span>
          <span className="cg-inputWrap">
            <input
              className="cg-input"
              inputMode="decimal"
              autoComplete="off"
              maxLength={16}
              aria-invalid={invalid}
              aria-describedby="crash-amount-help"
              type="text"
              value={text}
              disabled={betLocked}
              onChange={(e) => handleChange(e.target.value)}
            />
            <span className="cg-currency" aria-hidden="true">
              ₽
            </span>
          </span>
        </label>
        <button type="button" className="cg-clearBtn" onClick={() => setText('')}>
          Очистить
        </button>
      </div>
      <p id="crash-amount-help" className="cg-amountHelp" data-error={invalid}>
        {invalid && text.trim() !== ''
          ? `Допустимый диапазон: ${formatRub(MIN_BET)} — ${formatRub(MAX_BET)}.`
          : `Доступный диапазон: ${formatRub(MIN_BET)} — ${formatRub(MAX_BET)}.`}
      </p>

      <div className="cg-presets" role="group" aria-label="Быстрые суммы ставки">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="cg-preset"
            aria-pressed={state.betAmount === preset}
            disabled={betLocked}
            onClick={() => onPreset(preset)}
          >
            {formatRub(preset)}
          </button>
        ))}
      </div>

      <div className="cg-autoRow">
        <button
          type="button"
          className="cg-autoToggle"
          role="switch"
          aria-checked={state.autoOn}
          aria-label="Автовывод"
          onClick={() => onToggleAuto(!state.autoOn)}
        >
          <span className="cg-autoKnob" />
        </button>
        <span className="cg-autoLabel">Автовывод</span>
        <div className="cg-autoStepper" data-on={state.autoOn}>
          <button
            type="button"
            className="cg-stepBtn"
            disabled={!state.autoOn}
            aria-label="Уменьшить автовывод"
            onClick={() => onStepAuto(-0.1)}
          >
            −
          </button>
          <span className="cg-autoValue">{state.autoTarget.toFixed(2)}×</span>
          <button
            type="button"
            className="cg-stepBtn"
            disabled={!state.autoOn}
            aria-label="Увеличить автовывод"
            onClick={() => onStepAuto(0.1)}
          >
            +
          </button>
        </div>
      </div>

      <div className="cg-primaryAction">
        {cta.kind === 'cashout' ? (
          <button
            type="button"
            className="cg-cashoutCta"
            data-heat={heat(liveMultiplier)}
            disabled={busy}
            onClick={onPrimary}
          >
            {cta.label}
          </button>
        ) : cta.kind === 'cancel' ? (
          <button
            type="button"
            className="cg-armedCta"
            disabled={busy}
            onClick={onPrimary}
          >
            {cta.label}
          </button>
        ) : (
          <button
            type="button"
            className="cg-betCta"
            disabled={busy || cta.kind === 'waiting'}
            onClick={onPrimary}
          >
            {cta.label}
          </button>
        )}
      </div>

      {state.error && <p className="cg-error">{state.error}</p>}
    </section>
  );
}
