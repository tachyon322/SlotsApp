'use client';

import { useSyncExternalStore } from 'react';
import type { CrashState, PlayerBet, CrashLive } from '@/hooks/useCrashGame';
import { PRESETS } from '@/hooks/useCrashGame';

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
    return { kind: 'waiting', label: 'Подождите…' };
  }
  // betting
  if (player && player.status === 'pending') {
    return { kind: 'cancel', label: 'ОТМЕНИТЬ СТАВКУ' };
  }
  return { kind: 'bet', label: `НА СЛЕД. РАУНД ${formatRub(amount)}` };
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

  return (
    <section className="crash_controls" aria-label="Ставка">
      <div className="crash_autoRow">
        <button
          type="button"
          className="crash_autoToggle"
          role="switch"
          aria-checked={state.autoOn}
          aria-label="Автовывод"
          onClick={() => onToggleAuto(!state.autoOn)}
        >
          <span className="crash_autoKnob" />
        </button>
        <span className="crash_autoLabel">Автовывод</span>
        <div className="crash_autoStepper" data-on={state.autoOn}>
          <button
            type="button"
            className="crash_stepBtn"
            disabled={!state.autoOn}
            aria-label="Меньше"
            onClick={() => onStepAuto(-0.1)}
          >
            −
          </button>
          <span className="crash_autoValue">{state.autoTarget.toFixed(2)}×</span>
          <button
            type="button"
            className="crash_stepBtn"
            disabled={!state.autoOn}
            aria-label="Больше"
            onClick={() => onStepAuto(0.1)}
          >
            +
          </button>
        </div>
      </div>

      <div className="crash_presets" role="group" aria-label="Сумма ставки">
        {PRESETS.map((preset) => (
          <button
            key={preset}
            type="button"
            className="crash_preset"
            aria-pressed={state.betAmount === preset}
            disabled={!!state.player && state.player.status === 'pending'}
            onClick={() => onPreset(preset)}
          >
            {formatRub(preset)}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="crash_betCta"
        data-kind={cta.kind}
        disabled={busy || cta.kind === 'waiting'}
        onClick={onPrimary}
      >
        {cta.label}
      </button>

      {state.error && (
        <p className="text-xs text-red-400 -mt-1">{state.error}</p>
      )}
    </section>
  );
}