'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Wallet, Clock } from 'lucide-react';
import { useUser } from './UserProvider';
import { SkeletonReveal } from './SkeletonReveal';
import { walletApi, type WithdrawActiveResponse } from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

const WITHDRAWAL_PROCESSING_MS = 10 * 1000;

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function ActiveWithdrawalSkeleton() {
  return (
    <section className="rounded-card border border-zinc-800 bg-zinc-900/60 p-card animate-pulse">
      <div className="flex items-center gap-sm">
        <div className="p-sm rounded-panel shrink-0 h-12 w-12 bg-white/5" />
        <div className="flex flex-col flex-1 gap-2xs">
          <div className="h-4 w-48 max-w-full rounded bg-white/5" />
          <div className="h-3 w-36 max-w-full rounded bg-white/5" />
        </div>
      </div>
      <div className="mt-md h-1 rounded-pill bg-white/5" />
      <div className="mt-sm h-3 w-4/5 rounded bg-white/5" />
      <div className="mt-md h-12 rounded-button bg-white/5" />
    </section>
  );
}

export function ActiveWithdrawalCard() {
  const { user, refresh } = useUser();

  const [data, setData] = useState<WithdrawActiveResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const previousRequestId = useRef<string | null>(null);
  const activeRequest = data?.request;

  const load = useCallback(async () => {
    if (!user) {
      setData(null);
      setLoading(false);
      previousRequestId.current = null;
      return;
    }
    try {
      const res = await walletApi.withdrawActive();
      setData(res);
      setNow(Date.now());
      const hadRequest = previousRequestId.current !== null;
      previousRequestId.current = res.request?.id ?? null;
      if (hadRequest && !res.request) {
        await refresh();
        window.dispatchEvent(new CustomEvent('withdraw-settled'));
        if (res.verifiedForPayment) {
          showSuccess('Вывод обработан');
        } else {
          showError('Верификация реквизитов не подтверждена. Пройдите верификацию');
        }
      }
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user, refresh]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load();
  }, [user, load]);

  useEffect(() => {
    const request = activeRequest;
    const processingUntil = request?.processingUntil;
    if (!user || !request) return;

    const interval = window.setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (processingUntil && current >= new Date(processingUntil).getTime()) {
        void load();
      }
    }, 1000);

    return () => window.clearInterval(interval);
  }, [user, activeRequest, load]);

  useEffect(() => {
    if (!user) return;
    const onCreated = () => load();
    const onFocus = () => load();
    window.addEventListener('withdraw-created', onCreated);
    window.addEventListener('focus', onFocus);
    return () => {
      window.removeEventListener('withdraw-created', onCreated);
      window.removeEventListener('focus', onFocus);
    };
  }, [user, load]);

  if (!user) return null;
  if (!loading && (!data || !data.request)) return null;

  const request = activeRequest;
  const deadline = request?.processingUntil ? new Date(request.processingUntil).getTime() : null;
  const remainingMs = deadline === null ? null : Math.max(0, deadline - now);
  const remainingSeconds = remainingMs === null ? null : Math.ceil(remainingMs / 1000);
  const progress =
    remainingMs === null
      ? 100
      : Math.min(100, Math.max(0, ((WITHDRAWAL_PROCESSING_MS - remainingMs) / WITHDRAWAL_PROCESSING_MS) * 100));
  const timerLabel =
    remainingSeconds === null
      ? null
      : `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;

  return (
    <SkeletonReveal pending={loading || !request} skeleton={<ActiveWithdrawalSkeleton />} className="mt-xl">
      {request && (
        <section
          aria-label="Заявка на вывод"
          className="rounded-card border border-zinc-800 bg-zinc-900/60 p-card"
        >
          <div className="flex items-center gap-sm">
            <span className="p-sm rounded-panel shrink-0 flex items-center justify-center bg-blue-500/15 text-blue-400">
              <Wallet className="w-6 h-6" strokeWidth={2.2} />
            </span>
            <div className="flex flex-col min-w-0 gap-2xs">
              <span className="text-base font-bold text-white truncate">
                Заявка на вывод · <span className="text-money">{formatRub(request.amount)}</span>
              </span>
              <span className="text-sm font-medium text-zinc-400">
                {[request.method, request.details].filter(Boolean).join(' · ')}
              </span>
            </div>
          </div>

          <div className="mt-md h-1 rounded-pill overflow-hidden bg-zinc-800" aria-hidden="true">
            <span
              className="block h-full rounded-pill bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <p className="mt-sm text-xs leading-relaxed text-zinc-500 flex items-center gap-xs">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {timerLabel
              ? `Проверка реквизитов · осталось ${timerLabel}`
              : 'Заявка находится на проверке'}
          </p>
        </section>
      )}
    </SkeletonReveal>
  );
}
