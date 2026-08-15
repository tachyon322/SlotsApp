'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wallet, Crown, Zap, Clock } from 'lucide-react';
import { useUser } from './UserProvider';
import { usePaymentGate } from './PaymentGateModal';
import { SkeletonReveal } from './SkeletonReveal';
import { walletApi, type WithdrawActiveResponse } from '@/lib/api';

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
  const { user } = useUser();
  const { openGate } = usePaymentGate();

  const [data, setData] = useState<WithdrawActiveResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!user) {
      setData(null);
      setLoading(false);
      return;
    }
    try {
      const res = await walletApi.withdrawActive();
      setData(res);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    load();
  }, [user, load]);

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

  const handleBuyPremium = async () => {
    const ok = await openGate('premium');
    if (ok) load();
  };

  if (!user) return null;
  if (!loading && (!data || !data.request)) return null;

  const request = data?.request ?? null;
  const priority = Boolean(data?.premiumActive);

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
            {priority && (
              <span className="ml-auto shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-pill bg-amber-500/15 text-amber-400 text-[10px] font-bold">
                <Crown className="w-3 h-3" />
                ПРИОРИТЕТ
              </span>
            )}
          </div>

          <div className="mt-md h-1 rounded-pill overflow-hidden bg-zinc-800" aria-hidden="true">
            <span
              className={`block h-full rounded-pill transition-all ${
                priority
                  ? 'bg-gradient-to-r from-amber-500 to-orange-600'
                  : 'bg-gradient-to-r from-blue-500 to-blue-600'
              }`}
              style={{ width: '100%' }}
            />
          </div>

          <p className="mt-sm text-xs leading-relaxed text-zinc-500 flex items-center gap-xs">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            {priority
              ? 'Приоритетный статус: автоматический вывод денег на карту'
              : 'Вывод будет произведен в течении 28 рабочих дней'}
          </p>

          {!priority && (
            <>
                <p className="text-xs leading-relaxed text-amber-300/90 flex items-center gap-xs">
                  С премиум подпиской все заявки будут обработаны автоматически, без ожидания
                </p>
              <button
                type="button"
                onClick={handleBuyPremium}
                className="mt-md inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-button px-md py-xs h-12 text-sm font-bold transition-all w-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/25"
              >
                <Crown className="w-4 h-4" strokeWidth={2.5} />
                Купить Премиум (2000₽)
              </button>
            </>
          )}

          {priority && (
            <div className="mt-md inline-flex items-center gap-xs w-full justify-center rounded-button px-md py-xs h-12 text-sm font-bold bg-amber-500/10 border border-amber-500/25 text-amber-400">
              <Zap className="w-4 h-4" strokeWidth={2.5} />
              Заявка обрабатывается автоматически
            </div>
          )}
        </section>
      )}
    </SkeletonReveal>
  );
}
