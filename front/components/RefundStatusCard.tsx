'use client';

import { useCallback, useEffect, useState } from 'react';
import { CircleCheckBig, Clock3, Undo2, XCircle } from 'lucide-react';
import { useUser } from './UserProvider';
import { walletApi, type RefundRequestItem } from '@/lib/api';

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

  const load = useCallback(async () => {
    if (!user) {
      setRequest(null);
      return;
    }
    try {
      const res = await walletApi.refundStatus();
      setRequest(res.request);
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

  if (!user || !request) return null;

  const isPending = request.status === 'pending';
  const isApproved = request.status === 'approved';

  const tone = isPending ? 'cyan' : isApproved ? 'green' : 'red';
  const Icon = isPending ? Undo2 : isApproved ? CircleCheckBig : XCircle;
  const label = isPending
    ? 'Заявка на возврат'
    : isApproved
      ? 'Возврат одобрен'
      : 'Заявка отклонена';
  const detail = isPending
    ? `Принята · обрабатываем до ${PROCESSING_DAYS} дней`
    : request.adminComment ||
      (isApproved
        ? 'Средства направлены на указанные реквизиты'
        : 'В возврате средств отказано');
  const meta = isPending
    ? request.processingUntil
      ? `до ${formatDate(request.processingUntil)}`
      : ''
    : request.processedAt
      ? `обработана ${formatDate(request.processedAt)}`
      : '';

  return (
    <section className="ref-refund" data-tone={tone} aria-label="Заявка на возврат средств">
      <span className="ref-refundIcon" aria-hidden="true">
        <Icon strokeWidth={2} />
      </span>
      <span className="ref-refundCopy">
        <span className="ref-refundLabel">{label}</span>
        <strong className="ref-refundValue">{formatRub(request.amount)}</strong>
        <span className="ref-refundDetail" title={detail}>
          {detail}
        </span>
      </span>
      {meta ? (
        <span className="ref-refundMeta">
          <Clock3 aria-hidden="true" />
          {meta}
        </span>
      ) : null}
    </section>
  );
}
