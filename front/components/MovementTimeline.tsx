'use client';

import { useEffect, useState } from 'react';
import { ArrowRight, Check, Clock, Loader2, RefreshCw, X } from 'lucide-react';
import type {
  MovementStep,
  MovementStepState,
  MovementTimeline as MovementTimelineData,
} from '@/lib/withdrawal';
import { formatMovementRemaining } from '@/lib/withdrawal';

interface MovementTimelineProps {
  timeline: MovementTimelineData;
  /** Кнопка «Оформить возврат» в блоке ошибки просроченного вывода. */
  onRefund?: () => void;
  className?: string;
}

const CIRCLE: Record<MovementStepState, string> = {
  done: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-400',
  current: 'border-blue-500/40 bg-blue-500/15 text-blue-400 shadow-[0_0_18px_rgba(59,130,246,0.22)]',
  pending: 'border-white/10 bg-white/[0.03] text-zinc-600',
  failed: 'border-red-500/30 bg-red-500/15 text-red-400',
};

const TITLE: Record<MovementStepState, string> = {
  done: 'text-zinc-300',
  current: 'text-white',
  pending: 'text-zinc-500',
  failed: 'text-red-300',
};

const STATE_LABEL: Record<MovementStepState, string> = {
  done: ' — выполнено',
  current: ' — выполняется',
  pending: ' — ожидает',
  failed: ' — ошибка',
};

function StepIcon({ state }: { state: MovementStepState }) {
  if (state === 'done') return <Check className="h-4 w-4" strokeWidth={3} aria-hidden="true" />;
  if (state === 'current') return <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />;
  if (state === 'failed') return <X className="h-4 w-4" strokeWidth={3} aria-hidden="true" />;
  return <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />;
}

function stepHint(step: MovementStep, now: number): string | null {
  if (step.state !== 'current' || !step.endsAt) return null;
  const remaining = new Date(step.endsAt).getTime() - now;
  if (!Number.isFinite(remaining)) return null;
  return remaining > 0 ? `осталось ${formatMovementRemaining(remaining)}` : 'завершаем…';
}

export function MovementTimeline({ timeline, onRefund, className }: MovementTimelineProps) {
  const [now, setNow] = useState(() => Date.now());
  const ticking = timeline.steps.some((step) => step.state === 'current' && step.endsAt);

  useEffect(() => {
    if (!ticking) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [ticking]);

  const expiredWithdrawal = timeline.expired && timeline.kind === 'withdrawal';

  return (
    <div className={className}>
      <ol className="flex flex-col" aria-label="Движение средств по заявке">
        {timeline.steps.map((step, index) => {
          const isLast = index === timeline.steps.length - 1;
          const hint = stepHint(step, now);
          const isCurrent = step.state === 'current';
          const queueNextUpdateMs =
            isCurrent && step.key === 'queue' && timeline.queue?.nextUpdateAt
              ? new Date(timeline.queue.nextUpdateAt).getTime() - now
              : null;
          const deadlineRemainingMs =
            isCurrent && step.key === 'queue' && step.endsAt
              ? new Date(step.endsAt).getTime() - now
              : null;

          return (
            <li
              key={step.key}
              className="relative flex items-start gap-sm pb-md last:pb-0"
              aria-current={isCurrent ? 'step' : undefined}
            >
              {!isLast && (
                <span
                  className={`absolute left-5 top-10 h-[calc(100%-2.5rem)] w-px -translate-x-1/2 ${
                    step.state === 'done' ? 'bg-emerald-500/25' : 'bg-white/10'
                  }`}
                  aria-hidden="true"
                />
              )}
              <span
                className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border ${CIRCLE[step.state]}`}
                aria-hidden="true"
              >
                <StepIcon state={step.state} />
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <p className={`text-sm font-semibold leading-snug ${TITLE[step.state]}`}>
                  {step.title}
                  <span className="sr-only">{STATE_LABEL[step.state]}</span>
                </p>
                <p
                  className={`mt-0.5 text-xs leading-relaxed ${
                    step.state === 'failed' ? 'text-red-300/80' : 'text-zinc-500'
                  }`}
                >
                  {step.description}
                </p>
                {queueNextUpdateMs !== null ? (
                  <div className="mt-1 flex flex-col gap-0.5">
                    <p className="inline-flex items-center gap-1 text-xs font-medium text-blue-400">
                      <RefreshCw className="h-3 w-3" aria-hidden="true" />
                      {queueNextUpdateMs > 0
                        ? `место обновится через ${formatMovementRemaining(queueNextUpdateMs)}`
                        : 'обновляем место в очереди…'}
                    </p>
                    {deadlineRemainingMs !== null && deadlineRemainingMs > 0 && (
                      <p className="inline-flex items-center gap-1 text-[11px] text-zinc-600">
                        <Clock className="h-3 w-3" aria-hidden="true" />
                        до конца срока {formatMovementRemaining(deadlineRemainingMs)}
                      </p>
                    )}
                  </div>
                ) : (
                  hint && (
                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-blue-400">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      {hint}
                    </p>
                  )
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {expiredWithdrawal && (
        <div className="mt-sm rounded-panel border border-red-500/25 bg-red-500/10 p-md">
          <p className="text-sm font-bold text-red-300">Вывод не выполнен</p>
          <p className="mt-1 text-xs leading-relaxed text-red-200/70">
            Платёжный шлюз не смог провести выплату. Оформите возврат средств — деньги вернутся на
            указанные реквизиты.
          </p>
          {onRefund && (
            <button
              type="button"
              onClick={onRefund}
              className="mt-sm inline-flex h-10 w-full items-center justify-center gap-xs rounded-button bg-red-500/90 px-md text-sm font-bold text-white transition-colors hover:bg-red-500"
            >
              Оформить возврат средств
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
