'use client';

import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { Minus, Plus, X } from 'lucide-react';
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
  | { kind: 'bet'; label: string; sub: string }
  | { kind: 'cancel'; label: string; sub: string }
  | { kind: 'cashout'; label: string; sub: string }
  | { kind: 'waiting'; label: string; sub: string };

function nextCta(phase: CrashState['phase'], player: PlayerBet | null, amount: number, liveMultiplier: number): Cta {
  if (phase === 'flying') {
    if (player && player.status === 'in') {
      const win = Math.round(player.amount * liveMultiplier);
      return { kind: 'cashout', label: `ЗАБРАТЬ +${formatRub(win)}`, sub: `${liveMultiplier.toFixed(2)}×` };
    }
    return { kind: 'waiting', label: 'ИДЁТ РАУНД', sub: 'ставка — в следующем' };
  }
  if (phase === 'crashed') {
    if (player && player.status === 'pending') {
      return { kind: 'cancel', label: 'ОТМЕНИТЬ СТАВКУ', sub: formatRub(amount) };
    }
    // В паузе после краша ставки не принимаются (хук ставит только в фазе betting).
    return { kind: 'waiting', label: 'СЛЕДУЮЩИЙ РАУНД', sub: 'сейчас начнётся' };
  }
  // betting
  if (player && player.status === 'pending') {
    return { kind: 'cancel', label: 'ОТМЕНИТЬ СТАВКУ', sub: formatRub(amount) };
  }
  return { kind: 'bet', label: 'ПОСТАВИТЬ', sub: formatRub(amount) };
}

export function CrashControls({ state, live, onPreset, onToggleAuto, onStepAuto, onPrimary, busy }: CrashControlsProps) {
  const fieldId = useId();
  const liveMultiplier = useSyncExternalStore(live.subscribe, live.getSnapshot, live.getSnapshot);
  const cta = nextCta(state.phase, state.player, state.player?.amount ?? state.betAmount, liveMultiplier);

  // Свободный ввод суммы: локальный текст, валидные значения коммитим в хук.
  const [text, setText] = useState(() => String(state.betAmount));
  useEffect(() => {
    setText(String(state.betAmount));
  }, [state.betAmount]);

  const parsed = Number.parseInt(text.replace(/\s/g, ''), 10);
  const invalid = text.trim() === '' || Number.isNaN(parsed) || parsed < MIN_BET || parsed > MAX_BET;

  const handleChange = (raw: string) => {
    const cleaned = raw.replace(/[^\d]/g, '').slice(0, 16);
    setText(cleaned);
    const n = Number.parseInt(cleaned, 10);
    if (!Number.isNaN(n) && n >= MIN_BET && n <= MAX_BET) onPreset(n);
  };

  const betLocked = !!state.player && state.player.status === 'pending';

  return (
    <section id="crash-bet-console" className="cr-ctl" aria-label="Ставка">
      <div className="cr-amount" data-invalid={invalid && text.trim() !== ''}>
        <label htmlFor={fieldId}>
          <small>Ставка</small>
          <span className="cr-amount-val">
            <span className="cr-fit" data-value={text || '0'}>
              <input
                id={fieldId}
                inputMode="numeric"
                autoComplete="off"
                maxLength={16}
                size={1}
                placeholder="0"
                aria-invalid={invalid}
                aria-describedby={`${fieldId}-help`}
                type="text"
                value={text}
                disabled={betLocked}
                onChange={(e) => handleChange(e.target.value)}
              />
            </span>
            ₽
          </span>
        </label>
        {text !== '' && !betLocked && (
          <button type="button" className="cr-clear" aria-label="Очистить сумму" onClick={() => setText('')}>
            <X aria-hidden="true" />
          </button>
        )}
        <span id={`${fieldId}-help`} className="cr-range">
          {invalid && text.trim() !== '' ? 'Допустимо' : 'от'} {formatRub(MIN_BET)} до {formatRub(MAX_BET)}
        </span>
      </div>

      <div className="cr-presets" role="group" aria-label="Быстрые суммы ставки">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            aria-pressed={state.betAmount === preset}
            disabled={betLocked}
            onClick={() => onPreset(preset)}
          >
            {preset.toLocaleString('ru-RU')}
          </button>
        ))}
      </div>

      <div className="cr-auto" data-on={state.autoOn}>
        <button
          type="button"
          className="cr-switch"
          role="switch"
          aria-checked={state.autoOn}
          onClick={() => onToggleAuto(!state.autoOn)}
        >
          <i aria-hidden="true" />
          <span>
            Автовывод
            <small>{state.autoOn ? `заберём на ${state.autoTarget.toFixed(2)}×` : 'выключен'}</small>
          </span>
        </button>
        <div className="cr-auto-step">
          <button type="button" disabled={!state.autoOn} aria-label="Уменьшить автовывод" onClick={() => onStepAuto(-0.1)}>
            <Minus aria-hidden="true" />
          </button>
          <b>{state.autoTarget.toFixed(2)}×</b>
          <button type="button" disabled={!state.autoOn} aria-label="Увеличить автовывод" onClick={() => onStepAuto(0.1)}>
            <Plus aria-hidden="true" />
          </button>
        </div>
      </div>

      <button
        type="button"
        className="cr-cta"
        data-kind={cta.kind}
        data-heat={cta.kind === 'cashout' ? heat(liveMultiplier) : undefined}
        disabled={busy || cta.kind === 'waiting'}
        onClick={onPrimary}
      >
        {cta.label}
        <small>{cta.sub}</small>
      </button>

      {state.error && <p className="cr-error">{state.error}</p>}
    </section>
  );
}
