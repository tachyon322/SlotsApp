'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleCheckBig, Clock3, Undo2, XCircle } from 'lucide-react';
import { useUser } from './UserProvider';
import { walletApi, type RefundRequestItem } from '@/lib/api';
import {
  formatMovementRemaining,
  formatQueuePosition,
  movementCurrentStep,
  movementStageName,
} from '@/lib/withdrawal';

const PROCESSING_DAYS = 30;

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}

export function RefundStatusCard() {
  const { user } = useUser();
  const [request, setRequest] = useState<RefundRequestItem | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    if (!user) {
      setRequest(null);
      return;
    }
    try {
      const res = await walletApi.refundStatus();
      setRequest(res.request);
      setNow(Date.now());
    } catch {
      setRequest(null);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const reload = () => void load();
    window.addEventListener('refund-created', reload);
    window.addEventListener('focus', reload);
    return () => {
      window.removeEventListener('refund-created', reload);
      window.removeEventListener('focus', reload);
    };
  }, [user, load]);

  // Пока заявка в очереди/на проверке — держим обратный отсчёт живым.
  useEffect(() => {
    if (!request || request.status !== 'pending') return;
    const interval = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(interval);
  }, [request]);

  if (!user || !request) return null;

  const isPending = request.status === 'pending';
  const isApproved = request.status === 'approved';
  const movement = request.movement ?? null;
  const currentStep = movement ? movementCurrentStep(movement) : null;
  const currentRemainingMs =
    currentStep?.state === 'current' && currentStep.endsAt
      ? new Date(currentStep.endsAt).getTime() - now
      : null;

  const tone = isPending ? 'cyan' : isApproved ? 'green' : 'red';
  const Icon = isPending ? Undo2 : isApproved ? CircleCheckBig : XCircle;
  const label = isPending
    ? 'Заявка на возврат'
    : isApproved
      ? 'Возврат одобрен'
      : 'Заявка отклонена';
  const detail = isPending
    ? movement
      ? movementStageName(movement)
      : `Принята · обрабатываем до ${PROCESSING_DAYS} дней`
    : request.adminComment ||
      (isApproved
        ? 'Средства направлены на указанные реквизиты'
        : 'В возврате средств отказано');
  const meta = isPending
    ? movement?.expired
      ? ''
      : movement?.queue
        ? `место ${formatQueuePosition(movement.queue.position)}`
        : currentRemainingMs !== null && currentRemainingMs > 0
          ? `осталось ${formatMovementRemaining(currentRemainingMs)}`
          : request.processingUntil
            ? `до ${formatDate(request.processingUntil)}`
            : ''
    : request.processedAt
      ? `обработана ${formatDate(request.processedAt)}`
      : '';

  return (
    <section className="lg-refund" data-tone={tone} aria-label="Заявка на возврат средств">
      <span className="lg-refund-icon" aria-hidden="true">
        <Icon strokeWidth={2} />
      </span>
      <span className="lg-refund-copy">
        <span className="lg-refund-label">{label}</span>
        <strong className="lg-refund-value">{formatRub(request.amount)}</strong>
        <span className="lg-refund-detail" title={detail}>
          {detail}
        </span>
      </span>
      {meta ? (
        <span className="lg-refund-meta">
          <Clock3 aria-hidden="true" />
          {meta}
        </span>
      ) : null}
    </section>
  );
}
