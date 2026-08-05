'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import {
  CircleCheckBig,
  Crown,
  Loader2,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Coins,
  Check,
} from 'lucide-react';
import { paymentApi, type PaymentPurpose } from '@/lib/api';
import { ModalShell } from './ModalShell';

const GATE_AMOUNT = 2000;
const TERMINAL_FAILURE = new Set(['EXPIRED', 'CANCELED', 'FAILED']);

type GatePurpose = Exclude<PaymentPurpose, 'deposit'>;
type GateMethod = 'card' | 'sbp';

const GATE_COPY: Record<GatePurpose, {
  icon: typeof ShieldCheck;
  accent: string;
  gradient: string;
  title: string;
  subtitle: string;
  itemLabel: string;
  successTitle: string;
  successText: string;
}> = {
  verification: {
    icon: ShieldCheck,
    accent: 'text-emerald-400',
    gradient: 'from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700',
    title: 'Верификация реквизитов',
    subtitle: 'Оплатите 2000₽ для верификации реквизитов. Сумма не зачисляется на баланс',
    itemLabel: 'Верификация реквизитов',
    successTitle: 'Оплата принята!',
    successText: 'Реквизиты находятся на проверке. Далее оформите Премиум',
  },
  premium: {
    icon: Crown,
    accent: 'text-amber-400',
    gradient: 'from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700',
    title: 'Премиум подписка',
    subtitle: 'Бессрочный доступ к выводу средств за 2000₽',
    itemLabel: 'Премиум (бессрочно)',
    successTitle: 'Премиум активирован!',
    successText: 'Доступ к выводу средств открыт',
  },
};

interface PaymentGateContextValue {
  openGate: (purpose: GatePurpose) => Promise<boolean>;
}

const PaymentGateContext = createContext<PaymentGateContextValue>({
  openGate: async () => false,
});

export function usePaymentGate() {
  return useContext(PaymentGateContext);
}

export function PaymentGateModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [purpose, setPurpose] = useState<GatePurpose | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const openGate = useCallback((p: GatePurpose) => {
    setPurpose(p);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    setOpen(false);
    const resolve = resolveRef.current;
    resolveRef.current = null;
    if (resolve) resolve(ok);
  }, []);

  const contextValue = useMemo<PaymentGateContextValue>(
    () => ({ openGate }),
    [openGate],
  );

  return (
    <PaymentGateContext.Provider value={contextValue}>
      {children}
      {purpose && (
        <PaymentGateModal open={open} purpose={purpose} onClose={() => close(false)} onDone={() => close(true)} />
      )}
    </PaymentGateContext.Provider>
  );
}

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function PaymentGateModal({
  open,
  purpose,
  onClose,
  onDone,
}: {
  open: boolean;
  purpose: GatePurpose;
  onClose: () => void;
  onDone: () => void;
}) {
  const copy = GATE_COPY[purpose];
  const Icon = copy.icon;

  const [step, setStep] = useState<'pay' | 'success'>('pay');
  const [method, setMethod] = useState<GateMethod>('sbp');
  const [loading, setLoading] = useState(false);
  const [payError, setPayError] = useState('');
  const [paymentId, setPaymentId] = useState('');
  const [paymentLink, setPaymentLink] = useState('');
  const [polling, setPolling] = useState(false);
  const [paid, setPaid] = useState(false);

  useEffect(() => {
    if (open) {
      setStep('pay');
      setMethod('sbp');
      setLoading(false);
      setPayError('');
      setPaymentId('');
      setPaymentLink('');
      setPolling(false);
      setPaid(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !paymentId || paid || !polling) return;

    const interval = setInterval(async () => {
      try {
        const res = await paymentApi.status(paymentId);
        if (res.status === 'PAID') {
          setPaid(true);
          setPolling(false);
          setStep('success');
        } else if (TERMINAL_FAILURE.has(res.status)) {
          setPolling(false);
          setPayError('Платёж не был завершён. Попробуйте ещё раз.');
        }
      } catch {
        // Keep polling; the network may be temporarily unavailable
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [open, paymentId, paid, polling]);

  const handlePay = async () => {
    if (loading) return;
    setLoading(true);
    setPayError('');
    try {
      const res = await paymentApi.create(GATE_AMOUNT, method, purpose);
      setPaymentId(res.paymentId);
      setPaymentLink(res.link);
      setPolling(true);
      window.open(res.link, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setPayError((err as Error).message || 'Ошибка создания платежа');
    } finally {
      setLoading(false);
    }
  };

  const resetPayment = () => {
    setPaymentId('');
    setPaymentLink('');
    setPolling(false);
    setPaid(false);
    setPayError('');
    setStep('pay');
  };

  if (step === 'success') {
    return (
      <ModalShell open={open} onClose={onClose} titleId="gate-modal-title">
        <div className="flex flex-col items-center text-center gap-md animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CircleCheckBig className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="space-y-xs">
            <h2 id="gate-modal-title" className="text-2xl font-bold text-white">
              {copy.successTitle}
            </h2>
            <p className="text-sm text-zinc-400">{copy.successText}</p>
          </div>
          <button
            onClick={onDone}
            className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
          >
            Продолжить
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell open={open} onClose={onClose} titleId="gate-modal-title">
      <div className="flex gap-lg flex-col animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
        <div className="text-center space-y-sm">
          <div className="mx-auto w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center mb-md">
            <Icon className={`w-7 h-7 ${copy.accent}`} />
          </div>
          <h2 id="gate-modal-title" className="text-2xl font-bold text-white">{copy.title}</h2>
          <p className="text-sm text-zinc-400">{copy.subtitle}</p>
        </div>

        <div className="bg-zinc-900 rounded-card p-card-lg border border-zinc-800">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-xs">
              <Coins className="w-4 h-4 text-zinc-500" />
              <span className="text-sm text-zinc-300">{copy.itemLabel}</span>
            </div>
            <span className="text-sm font-bold text-white">{formatRub(GATE_AMOUNT)}</span>
          </div>
        </div>

        <div className="space-y-sm" role="radiogroup" aria-label="Способ оплаты">
          <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
            Способ оплаты
          </label>
          {[
            { id: 'sbp' as GateMethod, name: 'СБП', icon: Smartphone },
            // Оплата картой временно отключена — платёжный сервис не работает для карт
            // { id: 'card' as GateMethod, name: 'Банковская карта', icon: CreditCard },
          ].map((m) => {
            const MIcon = m.icon;
            const selected = method === m.id;
            return (
              <div
                key={m.id}
                role="radio"
                aria-checked={selected}
                tabIndex={0}
                onClick={() => setMethod(m.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setMethod(m.id);
                  }
                }}
                className={`relative p-sm rounded-panel border-2 transition-all cursor-pointer bg-zinc-900 ${
                  selected ? 'border-emerald-500 hover:border-emerald-500' : 'border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className="flex items-center gap-sm">
                  <div className="p-xs rounded-panel shrink-0 bg-zinc-800">
                    <MIcon className={`w-6 h-6 ${selected ? 'text-emerald-400' : 'text-zinc-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-base leading-tight text-zinc-200">{m.name}</p>
                  </div>
                  <div className="shrink-0">
                    <div
                      className={`w-6 h-6 rounded-pill border-2 flex items-center justify-center transition-colors ${
                        selected ? 'border-emerald-500' : 'border-zinc-600'
                      }`}
                    >
                      {selected && <div className="w-3 h-3 rounded-pill bg-emerald-500" />}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {paymentLink && (
          <div className="space-y-xs">
            <a
              href={paymentLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              {polling ? 'Открыть страницу оплаты' : 'Открыть страницу оплаты ещё раз'}
            </a>
            {polling && (
              <p className="text-xs text-zinc-500 flex items-center gap-xs">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Ожидаем оплату...
              </p>
            )}
          </div>
        )}

        {payError && (
          <p className="text-xs text-red-400 text-center">{payError}</p>
        )}

        <div className="space-y-sm">
          <button
            onClick={handlePay}
            disabled={loading}
            className={`inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none disabled:opacity-50 rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r ${copy.gradient} text-white`}
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Обработка...
              </>
            ) : paymentId ? (
              'Продолжить оплату'
            ) : (
              <>
                <Check className="w-5 h-5" />
                Оплатить {formatRub(GATE_AMOUNT)}
              </>
            )}
          </button>
          <button
            onClick={paymentId ? resetPayment : onClose}
            disabled={loading}
            className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700"
          >
            {paymentId ? 'Начать заново' : 'Отмена'}
          </button>
          <p className="text-xs text-center text-zinc-600 px-md">
            Сумма оплаты не зачисляется на игровой баланс
          </p>
        </div>
      </div>
    </ModalShell>
  );
}
