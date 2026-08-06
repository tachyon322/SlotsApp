'use client';

import { useCallback, useEffect, useState } from 'react';
import { Wallet, ArrowRight, Loader2 } from 'lucide-react';
import { useUser } from './UserProvider';
import { useTopUpModal } from './TopUpModal';
import { usePaymentGate } from './PaymentGateModal';
import { SkeletonReveal } from './SkeletonReveal';
import { walletApi, type WithdrawRequestItem, type WithdrawRequestCode } from '@/lib/api';

interface ToneStyle {
  tone: string;
  icon: string;
  cta: string;
}

const TONE: Record<WithdrawRequestCode, ToneStyle> = {
  need_deposit: {
    tone: 'blue',
    icon: 'bg-blue-500/15 text-blue-400',
    cta: 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg shadow-blue-500/25',
  },
  need_verification: {
    tone: 'emerald',
    icon: 'bg-emerald-500/15 text-emerald-400',
    cta: 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg shadow-emerald-500/25',
  },
  need_premium: {
    tone: 'amber',
    icon: 'bg-amber-500/15 text-amber-400',
    cta: 'bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white shadow-lg shadow-amber-500/25',
  },
  verification_pending: {
    tone: 'zinc',
    icon: 'bg-zinc-500/15 text-zinc-300',
    cta: 'bg-gradient-to-r from-zinc-600 to-zinc-700 hover:from-zinc-500 hover:to-zinc-700 text-white shadow-lg shadow-zinc-900/25',
  },
};

const COPY: Record<WithdrawRequestCode, { status: string; wait: string; cta: string }> = {
  need_deposit: {
    status: 'Сделайте первый депозит',
    wait: 'Создать выплату можно после первого депозита — это защищает выплаты от мультиаккаунтинга и спама.',
    cta: 'Внести депозит',
  },
  need_verification: {
    status: 'Пройдите верификацию реквизитов',
    wait: 'Оплатите 2 000 ₽ для верификации реквизитов. Сумма не зачисляется на игровой баланс.',
    cta: 'Пройти верификацию',
  },
  need_premium: {
    status: 'Оформите Премиум',
    wait: 'Премиум открывает бессрочный доступ к выводу средств — 2 000 ₽.',
    cta: 'Купить Премиум',
  },
  verification_pending: {
    status: 'Реквизиты на проверке',
    wait: 'Реквизиты ещё проверяются службой безопасности. Попробуйте позже.',
    cta: 'Проверить статус',
  },
};

const PROGRESS: Record<WithdrawRequestCode, number> = {
  need_deposit: 6,
  need_verification: 30,
  need_premium: 60,
  verification_pending: 85,
};

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function WithdrawRequestsSkeleton() {
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
      <div className="mt-2 h-10 rounded-button bg-white/5" />
    </section>
  );
}

export function WithdrawRequests() {
  const { user } = useUser();
  const { openTopUp } = useTopUpModal();
  const { openGate } = usePaymentGate();

  const [requests, setRequests] = useState<WithdrawRequestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) {
      setRequests([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await walletApi.withdrawRequests();
      setRequests(res.items);
    } catch {
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCta = async (code: WithdrawRequestCode) => {
    if (code === 'need_deposit') {
      openTopUp();
      return;
    }
    if (code === 'need_verification' || code === 'need_premium') {
      const ok = await openGate(code === 'need_verification' ? 'verification' : 'premium');
      if (ok) load();
      return;
    }
    load();
  };

  const handleCancel = async (id: string) => {
    if (cancellingId) return;
    setCancellingId(id);
    try {
      await walletApi.cancelWithdrawRequest(id);
      setRequests((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // keep the request; the user can retry
    } finally {
      setCancellingId(null);
    }
  };

  if (!user) return null;
  if (!loading && requests.length === 0) return null;

  return (
    <SkeletonReveal pending={loading} skeleton={<WithdrawRequestsSkeleton />} className="mt-xl">
      <div className="space-y-sm">
        {requests.map((request) => {
          const tone = TONE[request.code];
          const copy = COPY[request.code];
          const progress = PROGRESS[request.code];
          const cancelling = cancellingId === request.id;

          return (
            <section
              key={request.id}
              data-tone={tone.tone}
              aria-label="Заявка на вывод"
              className="rounded-card border border-zinc-800 bg-zinc-900/60 p-card"
            >
              <div className="flex items-center gap-sm">
                <span
                  className={`p-sm rounded-panel shrink-0 flex items-center justify-center ${tone.icon}`}
                  aria-hidden="true"
                >
                  <Wallet className="w-6 h-6" strokeWidth={2.2} />
                </span>
                <div className="flex flex-col min-w-0 gap-2xs">
                  <span className="text-base font-bold text-white truncate">
                    Заявка на вывод · <span className="text-money">{formatRub(request.amount)}</span>
                  </span>
                  <span className="text-sm font-medium text-zinc-400">{copy.status}</span>
                </div>
              </div>

              <div className="mt-md h-1 rounded-pill overflow-hidden bg-zinc-800" aria-hidden="true">
                <span
                  className="block h-full rounded-pill bg-gradient-to-r from-blue-500 to-blue-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>

              <p className="mt-sm text-xs leading-relaxed text-zinc-500">{copy.wait}</p>

              <div className="mt-md flex flex-col gap-xs">
                <button
                  type="button"
                  onClick={() => handleCta(request.code)}
                  className={`inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-button px-md py-xs h-12 text-sm font-bold transition-all w-full ${tone.cta}`}
                >
                  {copy.cta}
                  <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                </button>
                <button
                  type="button"
                  onClick={() => handleCancel(request.id)}
                  disabled={cancelling}
                  className="inline-flex items-center justify-center gap-xs whitespace-nowrap text-sm font-medium transition-colors px-md py-xs h-10 text-zinc-500 hover:text-zinc-300 disabled:opacity-50"
                >
                  {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Отменить заявку'}
                </button>
              </div>
            </section>
          );
        })}
      </div>
    </SkeletonReveal>
  );
}
