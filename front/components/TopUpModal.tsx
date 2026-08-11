'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ChangeEvent, ReactNode } from 'react';
import {
  Gift,
  Star,
  Coins,
  ArrowRight,
  CircleCheckBig,
  Check,
  Smartphone,
  CreditCard,
  ExternalLink,
  Loader2,
  Clock,
  Upload,
  Plus,
  X,
} from 'lucide-react';
import { useUser } from './UserProvider';
import { paymentApi, configApi } from '@/lib/api';
import { useUploadThing } from '@/lib/uploadthing';
import { showError } from '@/lib/toast';
import { ModalShell } from './ModalShell';

type Step = 'amount' | 'method' | 'confirm' | 'pay';
type TopUpMethod = 'card' | 'sbp';

interface TopUpModalContextValue {
  openTopUp: () => void;
}

interface StepperProps {
  step: Step;
}

const MIN_AMOUNT_FALLBACK = 0;

const PAYMENT_TIMEOUT_SECONDS = 15 * 60;
const MAX_RECEIPTS = 2;
const MAX_RECEIPT_SIZE = 5 * 1024 * 1024;

const PRESETS = [
  { amount: 2000 },
  { amount: 5000, popular: true },
  { amount: 7500 },
];

const METHODS: {
  id: TopUpMethod;
  name: string;
  icon: typeof CreditCard;
  badge?: string;
  badgeClassName?: string;
  badgeShadow?: boolean;
  description: string;
}[] = [
  {
    id: 'sbp',
    name: 'СБП',
    icon: Smartphone,
    badge: 'Популярно',
    badgeClassName: 'bg-gradient-to-r from-blue-500 to-blue-600',
    badgeShadow: true,
    description: 'Система быстрых платежей',
  },
  // Оплата картой временно отключена — платёжный сервис не работает для карт
  // {
  //   id: 'card',
  //   name: 'Банковская карта',
  //   icon: CreditCard,
  //   badge: 'БЕЗ КОМИССИИ',
  //   badgeClassName: 'bg-emerald-500/20 text-emerald-400',
  //   badgeShadow: false,
  //   description: 'Visa, MasterCard, МИР',
  // },
];

const TERMINAL_FAILURE = new Set(['EXPIRED', 'CANCELED', 'FAILED']);

const TopUpModalContext = createContext<TopUpModalContextValue>({
  openTopUp: () => {},
});

export function useTopUpModal() {
  return useContext(TopUpModalContext);
}

export function TopUpModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openTopUp = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const contextValue = useMemo<TopUpModalContextValue>(
    () => ({ openTopUp }),
    [openTopUp],
  );

  return (
    <TopUpModalContext.Provider value={contextValue}>
      {children}
      <TopUpModal open={open} onClose={close} />
    </TopUpModalContext.Provider>
  );
}

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function formatTime(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function Stepper({ step }: StepperProps) {
  const stepIndex = step === 'amount' ? 0 : step === 'method' ? 1 : step === 'confirm' ? 2 : 3;

  return (
    <div className="flex items-center justify-center gap-xs mb-xl">
      {[0, 1, 2, 3].map((index) => {
        const done = index < stepIndex;
        const active = index === stepIndex;

        return (
          <div key={index} className="flex items-center">
            <div className="relative">
              <div
                className={`w-8 h-8 rounded-pill flex items-center justify-center text-xs font-bold transition-colors ${
                  done || active ? 'bg-emerald-500 text-white' : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {done ? <Check className="w-4 h-4" strokeWidth={3} /> : index + 1}
              </div>
              {active && (
                <div className="absolute inset-0 rounded-pill border-2 border-emerald-500 opacity-0" />
              )}
            </div>
            {index < 3 && (
              <div className="w-12 h-0.5 mx-2xs overflow-hidden rounded-pill">
                <div
                  className={`h-full bg-emerald-500 origin-left transition-transform duration-300 ${
                    done ? 'scale-x-100' : 'scale-x-0'
                  }`}
                />
                <div className="h-full bg-zinc-800 -mt-0.5" />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface AmountCardProps {
  amount: number;
  popular?: boolean;
  selected: boolean;
  onSelect: () => void;
}

function AmountCard({ amount, popular, selected, onSelect }: AmountCardProps) {
  return (
    <div className="flex-shrink-0 w-[160px]">
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect();
          }
        }}
        className={`relative p-sm rounded-card border-2 cursor-pointer transition-colors h-[130px] flex flex-col mt-sm bg-zinc-900 ${
          selected ? 'border-emerald-500' : 'border-zinc-800 hover:border-zinc-700'
        }`}
      >
        <div className="absolute -top-xs left-md flex gap-xs z-10">
          {popular && (
            <div className="px-xs py-2xs bg-gradient-to-r from-orange-500 to-amber-500 rounded-pill text-[10px] font-bold text-white shadow-lg flex items-center gap-2xs">
              <Star className="w-3 h-3" />
              <span>Популярное</span>
            </div>
          )}
        </div>
        <div className="flex-1 flex flex-col justify-center">
          <div className="flex items-baseline gap-xs mb-xs">
            <span className={`text-2xl font-bold transition-colors`}>
              {formatRub(amount)}
            </span>
          </div>
          <div className="flex items-center gap-2xs mb-xs">
            <Gift className={`w-4 h-4 transition-colors ${selected ? 'text-emerald-500' : 'text-zinc-500'}`} />
            <span className={`text-sm font-semibold transition-colors ${selected ? 'text-money' : 'text-money/70'}`}>
              +{formatRub(amount)} бонус
            </span>
          </div>
          <div className="text-xs transition-colors ">
            Получите: <span className="font-bold">{formatRub(amount * 2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MethodCardProps {
  method: (typeof METHODS)[number];
  selected: boolean;
  onSelect: () => void;
}

function MethodCard({ method, selected, onSelect }: MethodCardProps) {
  const Icon = method.icon;

  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onSelect();
        }
      }}
      className={`relative p-sm rounded-panel border-2 transition-all cursor-pointer bg-zinc-900 ${
        selected ? 'border-emerald-500 hover:border-emerald-500' : 'border-zinc-800 hover:border-zinc-700'
      }`}
    >
      {method.badge && (
        <div
          className={`absolute -top-2 right-sm px-2 py-0.5 rounded-pill text-[10px] font-bold text-white ${method.badgeClassName} ${
            method.badgeShadow ? 'shadow-lg shadow-blue-500/25' : ''
          }`}
        >
          {method.badge}
        </div>
      )}
      <div className="flex items-center gap-sm">
        <div className="p-xs rounded-panel shrink-0 bg-zinc-800">
          <Icon className={`w-6 h-6 ${selected ? 'text-emerald-400' : 'text-zinc-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-2xs">
            <p className="font-bold text-base leading-tight text-zinc-200">{method.name}</p>
          </div>
          <p className="text-xs text-zinc-500">{method.description}</p>
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
}

function TopUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh } = useUser();
  const [step, setStep] = useState<Step>('amount');
  const [minAmount, setMinAmount] = useState(MIN_AMOUNT_FALLBACK);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [amountError, setAmountError] = useState('');
  const [method, setMethod] = useState<TopUpMethod | null>(null);
  const [loading, setLoading] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const [paymentLink, setPaymentLink] = useState('');
  const [polling, setPolling] = useState(false);
  const [paid, setPaid] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(PAYMENT_TIMEOUT_SECONDS);
  const [receipts, setReceipts] = useState<{ file: File; preview: string }[]>([]);
  const [receiptSent, setReceiptSent] = useState(false);

  const { startUpload, isUploading } = useUploadThing('receiptImage', {
    onClientUploadComplete: () => setReceiptSent(true),
    onUploadError: (err) => showError(err.message || 'Не удалось загрузить файл'),
  });

  const amount = selectedPreset ?? (custom ? parseInt(custom, 10) : 0);
  const amountValid = Number.isFinite(amount) && amount >= minAmount;

  const resetPayment = useCallback(() => {
    setPaymentId('');
    setPaymentLink('');
    setPolling(false);
    setPaid(false);
  }, []);

  const confirmPaid = useCallback(async () => {
    for (let i = 0; i < 4; i++) {
      await refresh();
      if (i < 3) await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }, [refresh]);

  useEffect(() => {
    if (open) {
      setStep('amount');
      setSelectedPreset(null);
      setCustom('');
      setAmountError('');
      setMethod(null);
      setLoading(false);
      setSecondsLeft(PAYMENT_TIMEOUT_SECONDS);
      setReceipts((prev) => {
        prev.forEach((r) => URL.revokeObjectURL(r.preview));
        return [];
      });
      setReceiptSent(false);
      resetPayment();

      configApi
        .get()
        .then((res) => setMinAmount(res.minDeposit))
        .catch(() => setMinAmount(MIN_AMOUNT_FALLBACK));
    }
  }, [open, resetPayment]);

  useEffect(() => {
    if (!open || step !== 'pay' || !paymentId || paid || secondsLeft <= 0) return;

    const interval = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(interval);
          setPolling(false);
          showError('Время на оплату истекло. Попробуйте ещё раз.');
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [open, step, paymentId, paid, secondsLeft]);

  useEffect(() => {
    if (!open || !paymentId || paid || !polling) return;

    const interval = setInterval(async () => {
      try {
        const res = await paymentApi.status(paymentId);
        if (res.status === 'PAID') {
          setPaid(true);
          setPolling(false);
          confirmPaid();
        } else if (TERMINAL_FAILURE.has(res.status)) {
          setPolling(false);
          showError('Платёж не был завершён. Попробуйте ещё раз.');
        }
      } catch {
        // Keep polling; the network may be temporarily unavailable
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [open, paymentId, paid, polling, confirmPaid]);

  const handlePay = async () => {
    if (!amountValid || !method || loading) return;
    setLoading(true);
    try {
      const res = await paymentApi.create(amount, method);
      setPaymentId(res.paymentId);
      setPaymentLink(res.link);
      setSecondsLeft(PAYMENT_TIMEOUT_SECONDS);
      setPolling(true);
    } catch (err) {
      showError((err as Error).message || 'Ошибка создания платежа');
    } finally {
      setLoading(false);
    }
  };

  const handleReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    const invalid = files.some(
      (file) => !file.type.startsWith('image/') || file.size > MAX_RECEIPT_SIZE,
    );
    if (invalid) {
      showError('Поддерживаются только изображения PNG, JPG до 5 МБ');
      return;
    }

    const remaining = MAX_RECEIPTS - receipts.length;
    if (remaining <= 0) {
      showError('Можно загрузить до двух изображений');
      return;
    }

    const accepted = files.slice(0, remaining);
    setReceipts((prev) => [
      ...prev,
      ...accepted.map((file) => ({ file, preview: URL.createObjectURL(file) })),
    ]);
    setReceiptSent(false);
  };

  const handleRemoveReceipt = (preview: string) => {
    setReceipts((prev) => prev.filter((r) => r.preview !== preview));
    URL.revokeObjectURL(preview);
    setReceiptSent(false);
  };

  const handleAttachReceipt = async () => {
    if (receipts.length === 0 || isUploading || receiptSent) return;
    try {
      await startUpload(receipts.map((r) => r.file));
    } catch {
      showError('Не удалось загрузить файл. Попробуйте ещё раз.');
    }
  };

  const handleCancelPayment = () => {
    resetPayment();
    setReceipts((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.preview));
      return [];
    });
    setReceiptSent(false);
    goTo('confirm');
  };

  const handlePresetSelect = (presetAmount: number) => {
    setSelectedPreset(presetAmount);
    setCustom('');
    setAmountError('');
  };

  const handleCustomChange = (value: string) => {
    setCustom(value);
    setSelectedPreset(null);
    if (value === '') {
      setAmountError('');
      return;
    }
    const parsed = parseInt(value, 10);
    setAmountError(
      Number.isFinite(parsed) && parsed < minAmount
        ? `Минимальная сумма — ${formatRub(minAmount)}`
        : '',
    );
  };

  const goTo = (next: Step) => {
    setStep(next);
  };

  const continueToConfirm = () => {
    if (amountValid) {
      setAmountError('');
      goTo('method');
    } else {
      setAmountError(`Минимальная сумма — ${formatRub(minAmount)}`);
    }
  };

  const methodLabel = method === 'card' ? 'Банковская карта' : 'СБП';

  const content = (() => {
    switch (step) {
      case 'amount':
        return (
          <div key="amount" className="flex gap-sm flex-col animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
            <div className="text-center space-y-sm">
              <h2 id="topup-modal-title" className="text-2xl font-bold text-white">Выберите сумму</h2>
              <p className="text-sm text-zinc-400">Все пополнения идут с бонусом!</p>
            </div>

            <div className="overflow-x-auto scrollbar-hide -mx-xl px-xl pt-xs">
              <div className="flex gap-sm pb-xs">
                {PRESETS.filter((preset) => preset.amount >= minAmount).map((preset) => (
                  <AmountCard
                    key={preset.amount}
                    amount={preset.amount}
                    popular={preset.popular}
                    selected={selectedPreset === preset.amount}
                    onSelect={() => handlePresetSelect(preset.amount)}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-xs">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Или введите свою сумму
              </label>
              <div className="relative">
                <input
                  placeholder={`От ${formatRub(minAmount)}`}
                  type="number"
                  value={custom}
                  onChange={(event) => handleCustomChange(event.target.value)}
                  className="w-full px-md py-sm pr-12 text-lg font-semibold bg-zinc-900 rounded-control border-2 text-white placeholder:text-zinc-600 focus:outline-none border-zinc-800 focus:border-emerald-500 focus:ring-emerald-500/10"
                />
                <span className="absolute right-md top-1/2 -translate-y-1/2 text-zinc-500 font-bold">
                  ₽
                </span>
              </div>
              {amountError && (
                <p className="text-xs text-red-400">{amountError}</p>
              )}
            </div>

            <div className="flex gap-sm">
              <button
                onClick={continueToConfirm}
                disabled={!amountValid}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 rounded-control px-2xl flex-1 h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
              >
                Продолжить
              </button>
            </div>
          </div>
        );

      case 'method':
        return (
          <div
            key="method"
            className="flex gap-lg flex-col animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]"
          >
            <div className="text-center space-y-sm">
              <h2 id="topup-modal-title" className="text-2xl font-bold text-white">Способ оплаты</h2>
              <p className="text-sm text-zinc-400">Выберите удобный способ пополнения</p>
            </div>

            <div className="space-y-sm" role="radiogroup" aria-label="Способ оплаты">
              {METHODS.map((m) => (
                <MethodCard
                  key={m.id}
                  method={m}
                  selected={method === m.id}
                  onSelect={() => setMethod(m.id)}
                />
              ))}
            </div>

            <div className="flex gap-sm">
              <button
                onClick={() => goTo('amount')}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs flex-1 h-12 border-2 border-zinc-800 hover:border-zinc-700"
              >
                Назад
              </button>
              <button
                onClick={() => goTo('confirm')}
                disabled={!method}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 rounded-control px-2xl flex-1 h-12 text-sm font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
              >
                Продолжить
              </button>
            </div>
          </div>
        );

      case 'confirm':
        return (
          <div key="confirm" className="animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
            <div className="text-center space-y-sm">
              <h2 id="topup-modal-title" className="text-2xl font-bold text-white">Подтверждение</h2>
              <p className="text-sm text-zinc-400">Проверьте детали платежа</p>
            </div>

            <div className="bg-zinc-900 rounded-card p-card-lg border border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wide mb-md">
                Детали платежа
              </h3>
              <div className="space-y-sm mb-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-xs">
                    <Coins className="w-4 h-4 text-zinc-500" />
                    <span className="text-sm text-zinc-300">Сумма пополнения</span>
                  </div>
                  <span className="text-sm font-bold text-money">{formatRub(amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-xs">
                    <Gift className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-zinc-300">Бонус</span>
                  </div>
                  <span className="text-sm font-bold text-money">+{formatRub(amount)}</span>
                </div>
                <div className="flex items-center justify-between pt-xs border-t border-zinc-800">
                  <span className="text-xs text-zinc-500">Способ оплаты</span>
                  <span className="text-xs font-medium text-zinc-300">{methodLabel}</span>
                </div>
              </div>
              <div className="pt-md border-t-2 border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 mb-2xs">Итого на баланс</p>
                    <p className="text-2xl font-bold text-money">{formatRub(amount * 2)}</p>
                  </div>
                  <ArrowRight className="w-6 h-6 text-emerald-500" />
                </div>
              </div>
              <p className="text-xs text-zinc-600 mt-md text-center">
                Средства поступят мгновенно после оплаты
              </p>
            </div>

            <div className="space-y-sm">
              <button
                onClick={() => goTo('pay')}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
              >
                Оплатить {formatRub(amount)}
              </button>
              <button
                onClick={() => goTo('method')}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700"
              >
                Назад
              </button>
              <p className="text-xs text-center text-zinc-600 px-md">
                Нажимая «Оплатить», вы соглашаетесь с условиями обработки платежа
              </p>
            </div>
          </div>
        );

      case 'pay':
        if (paid) {
          return (
            <div
              key="success"
              className="animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both] flex flex-col items-center text-center gap-md"
            >
              <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <CircleCheckBig className="w-10 h-10 text-emerald-400" />
              </div>
              <div className="space-y-xs">
                <h2 id="topup-modal-title" className="text-2xl font-bold text-white">Пополнение успешно!</h2>
                <p className="text-sm text-zinc-400">
                  На баланс зачислено <span className="font-bold text-money">{formatRub(amount * 2)}</span> (включая бонус)
                </p>
              </div>
              <button
                onClick={onClose}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
              >
                Отлично
              </button>
            </div>
          );
        }

        return (
          <div
            key="pay"
            className="animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]"
          >
            <div className="flex items-center justify-between gap-sm mb-sm">
              <h2 id="topup-modal-title" className="text-xl font-bold text-white">Завершите оплату</h2>
              <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-pill bg-zinc-900 border border-zinc-800 text-sm font-bold text-zinc-200 tabular-nums shrink-0">
                <Clock className="w-4 h-4 text-emerald-400" />
                {formatTime(secondsLeft)}
              </div>
            </div>

            <p className="text-sm text-zinc-400 mb-lg">
              Перейдите в окно оплаты и завершите перевод. После оплаты прикрепите чек
            </p>

            <div className="bg-zinc-900 rounded-card border border-zinc-800 p-card-lg mb-md">
              <p className="text-sm font-semibold text-zinc-300 mb-sm">
                Прикрепите чек об оплате — без него платёж не подтвердится
              </p>

              {receipts.length === 0 ? (
                <label className="flex flex-col items-center justify-center gap-2xs border-2 border-dashed border-zinc-700 hover:border-zinc-600 rounded-panel py-lg cursor-pointer transition-colors">
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    multiple
                    className="sr-only"
                    onChange={handleReceiptChange}
                    disabled={isUploading}
                  />
                  <Upload className="w-6 h-6 text-zinc-500" />
                  <span className="text-sm font-medium text-zinc-300">
                    Нажмите, чтобы прикрепить файл
                  </span>
                  <span className="text-xs text-zinc-500">PNG, JPG до 5 МБ</span>
                </label>
              ) : (
                <div className="flex gap-sm flex-wrap">
                  {receipts.map((r, index) => (
                    <div
                      key={r.preview}
                      className="relative w-24 h-24 rounded-panel overflow-hidden border border-zinc-700"
                    >
                      <img
                        src={r.preview}
                        alt={`Чек ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveReceipt(r.preview)}
                        disabled={isUploading}
                        aria-label="Удалить"
                        className="absolute top-1 right-1 p-1 rounded-pill bg-black/70 text-white hover:bg-black transition-colors disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {receipts.length < MAX_RECEIPTS && (
                    <label className="w-24 h-24 rounded-panel border-2 border-dashed border-zinc-700 hover:border-zinc-600 flex items-center justify-center cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        multiple
                        className="sr-only"
                        onChange={handleReceiptChange}
                        disabled={isUploading}
                      />
                      <Plus className="w-5 h-5 text-zinc-500" />
                    </label>
                  )}
                </div>
              )}

              <p className="text-xs text-zinc-600 mt-sm">
                Поддерживаются только скриншоты. Можно загрузить до двух изображений.
              </p>

              {receiptSent && (
                <p className="text-xs text-emerald-400 flex items-center gap-1 mt-sm">
                  <Check className="w-3.5 h-3.5" />
                  Чек отправлен
                </p>
              )}
            </div>

            <div className="flex items-center gap-sm rounded-panel bg-zinc-900 border border-zinc-800 p-md mb-md">
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-zinc-200">Ожидаем оплату…</p>
                <p className="text-xs text-zinc-500">
                  Баланс будет пополнен автоматически после завершения платежа
                </p>
              </div>
            </div>

            <div className="space-y-sm">
              {paymentLink ? (
                <a
                  href={paymentLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
                >
                  <ExternalLink className="w-4 h-4" />
                  Открыть страницу оплаты
                </a>
              ) : (
                <button
                  onClick={handlePay}
                  disabled={loading}
                  className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none disabled:opacity-50 rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Обработка...
                    </>
                  ) : (
                    'Перейти к оплате'
                  )}
                </button>
              )}
              <button
                onClick={handleAttachReceipt}
                disabled={receipts.length === 0 || isUploading || receiptSent}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Загрузка...
                  </>
                ) : receiptSent ? (
                  <>
                    <Check className="w-5 h-5" />
                    Чек отправлен
                  </>
                ) : (
                  'Прикрепите чек'
                )}
              </button>
              <button
                onClick={handleCancelPayment}
                disabled={loading || isUploading}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700 disabled:opacity-50"
              >
                Отменить
              </button>
            </div>
          </div>
        );
    }
  })();

  return (
    <ModalShell open={open} onClose={onClose} titleId="topup-modal-title">
      {step !== 'pay' && <Stepper step={step} />}
      <div className="space-y-xl">{content}</div>
    </ModalShell>
  );
}
