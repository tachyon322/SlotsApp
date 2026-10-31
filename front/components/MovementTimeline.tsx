'use client';

import { useEffect, useState } from 'react';
import { Check, Clock, Loader2, RefreshCw, X } from 'lucide-react';
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

const STATE_LABEL: Record<MovementStepState, string> = {
  done: ' — выполнено',
  current: ' — выполняется',
  pending: ' — ожидает',
  failed: ' — ошибка',
};

function StepIcon({ state }: { state: MovementStepState }) {
  if (state === 'done') return <Check strokeWidth={3} aria-hidden="true" />;
  if (state === 'current') return <Loader2 className="lw-tl-spin" aria-hidden="true" />;
  if (state === 'failed') return <X strokeWidth={3} aria-hidden="true" />;
  return <span className="lw-tl-dot" aria-hidden="true" />;
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
    <div className={['lw-tl', className].filter(Boolean).join(' ')}>
      <ol className="lw-tl-list" aria-label="Движение средств по заявке">
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
              className="lw-tl-step"
              data-state={step.state}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {!isLast && <span className="lw-tl-line" aria-hidden="true" />}
              <span className="lw-tl-ico" data-state={step.state} aria-hidden="true">
                <StepIcon state={step.state} />
              </span>
              <div className="lw-tl-body">
                <p className="lw-tl-title">
                  {step.title}
                  <span className="sr-only">{STATE_LABEL[step.state]}</span>
                </p>
                <p className="lw-tl-desc">{step.description}</p>
                {queueNextUpdateMs !== null ? (
                  <>
                    <p className="lw-tl-hint">
                      <RefreshCw aria-hidden="true" />
                      {queueNextUpdateMs > 0
                        ? `место обновится через ${formatMovementRemaining(queueNextUpdateMs)}`
                        : 'обновляем место в очереди…'}
                    </p>
                    {deadlineRemainingMs !== null && deadlineRemainingMs > 0 && (
                      <p className="lw-tl-hint" data-muted="true">
                        <Clock aria-hidden="true" />
                        до конца срока {formatMovementRemaining(deadlineRemainingMs)}
                      </p>
                    )}
                  </>
                ) : (
                  hint && (
                    <p className="lw-tl-hint">
                      <Clock aria-hidden="true" />
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
        <div className="lw-tl-fail">
          <p className="lw-tl-fail-text">
            Оформите возврат — деньги вернутся на указанные реквизиты.
          </p>
          {onRefund && (
            <button
              type="button"
              onClick={onRefund}
              className="pg-btn pg-btn-acc pg-btn-wide lw-tl-refund"
            >
              Оформить возврат средств
            </button>
          )}
        </div>
      )}
    </div>
  );
}
