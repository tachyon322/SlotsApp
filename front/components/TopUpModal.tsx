'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { Gift, Star, Coins, ArrowRight, Link2, Wallet, CircleCheckBig, Check } from 'lucide-react';
import { useUser } from './UserProvider';
import { walletApi } from '@/lib/api';
import { ModalShell } from './ModalShell';

type Step = 'amount' | 'confirm' | 'pay';

interface TopUpModalContextValue {
  openTopUp: () => void;
}

interface StepperProps {
  step: Step;
}

const MIN_AMOUNT = 2000;

const PRESETS = [
  { amount: 2000 },
  { amount: 5000, popular: true },
  { amount: 7500 },
];

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

function Stepper({ step }: StepperProps) {
  const firstDone = step !== 'amount';

  return (
    <div className="flex items-center justify-center gap-xs mb-xl">
      <div className="flex items-center">
        <div className="relative">
          <div className="w-8 h-8 rounded-pill flex items-center justify-center text-xs font-bold transition-colors bg-emerald-500 text-white">
            {firstDone ? <Check className="w-4 h-4" strokeWidth={3} /> : '1'}
          </div>
          {firstDone && (
            <div className="absolute inset-0 rounded-pill border-2 border-emerald-500 opacity-0" />
          )}
        </div>
        <div className="w-12 h-0.5 mx-2xs overflow-hidden rounded-pill">
          <div className={`h-full bg-emerald-500 origin-left transition-transform duration-300 ${firstDone ? 'scale-x-100' : 'scale-x-0'}`} />
          <div className="h-full bg-zinc-800 -mt-0.5" />
        </div>
      </div>
      <div className="flex items-center">
        <div className="relative">
          <div className="w-8 h-8 rounded-pill flex items-center justify-center text-xs font-bold transition-colors bg-emerald-500 text-white">
            2
          </div>
          {step === 'amount' && (
            <div className="absolute inset-0 rounded-pill border-2 border-zinc-700" />
          )}
        </div>
      </div>
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
            <span className={`text-2xl font-bold transition-colors ${selected ? 'text-white' : 'text-zinc-100'}`}>
              {formatRub(amount)}
            </span>
          </div>
          <div className="flex items-center gap-2xs mb-xs">
            <Gift className={`w-4 h-4 transition-colors ${selected ? 'text-emerald-500' : 'text-zinc-500'}`} />
            <span className={`text-sm font-semibold transition-colors ${selected ? 'text-zinc-300' : 'text-zinc-400'}`}>
              +{formatRub(amount)} бонус
            </span>
          </div>
          <div className={`text-xs transition-colors ${selected ? 'text-emerald-300' : 'text-emerald-400'}`}>
            Получите: <span className="font-bold">{formatRub(amount * 2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function TopUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh } = useUser();
  const [step, setStep] = useState<Step>('amount');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [amountError, setAmountError] = useState('');
  const [loading, setLoading] = useState(false);
  const [payError, setPayError] = useState('');

  const amount = selectedPreset ?? (custom ? parseInt(custom, 10) : 0);
  const amountValid = Number.isFinite(amount) && amount >= MIN_AMOUNT;

  useEffect(() => {
    if (open) {
      setStep('amount');
      setSelectedPreset(null);
      setCustom('');
      setAmountError('');
      setLoading(false);
      setPayError('');
    }
  }, [open]);

  const handlePay = async () => {
    if (!amountValid || loading) return;
    setLoading(true);
    setPayError('');
    try {
      await walletApi.deposit(amount, 'СБП');
      await refresh();
      onClose();
    } catch (err) {
      setPayError((err as Error).message || 'Ошибка обработки платежа');
    } finally {
      setLoading(false);
    }
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
      Number.isFinite(parsed) && parsed < MIN_AMOUNT
        ? `Минимальная сумма — ${formatRub(MIN_AMOUNT)}`
        : '',
    );
  };

  const goTo = (next: Step) => {
    setStep(next);
  };

  const continueToConfirm = () => {
    if (amountValid) {
      setAmountError('');
      goTo('confirm');
    } else {
      setAmountError(`Минимальная сумма — ${formatRub(MIN_AMOUNT)}`);
    }
  };

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
                {PRESETS.map((preset) => (
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
                  placeholder={`От ${formatRub(MIN_AMOUNT)}`}
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
                  <span className="text-sm font-bold text-white">{formatRub(amount)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-xs">
                    <Gift className="w-4 h-4 text-emerald-500" />
                    <span className="text-sm text-zinc-300">Бонус</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-400">+{formatRub(amount)}</span>
                </div>
                <div className="flex items-center justify-between pt-xs border-t border-zinc-800">
                  <span className="text-xs text-zinc-500">Способ оплаты</span>
                  <span className="text-xs font-medium text-zinc-300">СБП</span>
                </div>
              </div>
              <div className="pt-md border-t-2 border-emerald-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 mb-2xs">Итого на баланс</p>
                    <p className="text-2xl font-bold text-white">{formatRub(amount * 2)}</p>
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
                onClick={() => goTo('amount')}
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
        return (
          <div key="pay" className="animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
            <div className="text-center space-y-xs">
              <h2 id="topup-modal-title" className="text-xl font-bold text-white">Как пополнить баланс</h2>
              <p className="text-sm text-zinc-400">Всего 3 простых шага</p>
            </div>

            <div className="bg-zinc-900 rounded-card border border-zinc-800 p-card-lg">
              <div>
                <div className="flex items-start gap-md">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-pill flex items-center justify-center shrink-0 bg-emerald-500 text-white font-bold text-sm">
                      1
                    </div>
                    <div className="w-0.5 h-12 bg-zinc-700 my-2xs" />
                  </div>
                  <div className="flex-1 pb-md">
                    <div className="flex items-center gap-xs mb-2xs">
                      <Link2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-semibold text-white text-sm">Получите ссылку</span>
                    </div>
                    <p className="text-sm text-zinc-400 ml-xl">Нажмите кнопку ниже</p>
                  </div>
                </div>

                <div className="flex items-start gap-md">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-pill flex items-center justify-center shrink-0 bg-emerald-500 text-white font-bold text-sm">
                      2
                    </div>
                    <div className="w-0.5 h-12 bg-zinc-700 my-2xs" />
                  </div>
                  <div className="flex-1 pb-md">
                    <div className="flex items-center gap-xs mb-2xs">
                      <Wallet className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-semibold text-white text-sm">Оплатите</span>
                    </div>
                    <p className="text-sm text-zinc-400 ml-xl">Переведите сумму через ваш банк</p>
                  </div>
                </div>

                <div className="flex items-start gap-md">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-pill flex items-center justify-center shrink-0 bg-emerald-500 text-white font-bold text-sm">
                      3
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-xs mb-2xs">
                      <CircleCheckBig className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span className="font-semibold text-white text-sm">Депозит зачислится автоматически</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {payError && (
              <p className="text-xs text-red-400 text-center">{payError}</p>
            )}

            <div className="space-y-sm">
              <button
                onClick={handlePay}
                disabled={loading}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none disabled:opacity-50 rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
              >
                {loading ? 'Обработка...' : 'Перейти к оплате'}
              </button>
              <button
                onClick={() => goTo('confirm')}
                disabled={loading}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700"
              >
                Назад
              </button>
            </div>
          </div>
        );
    }
  })();

  return (
    <ModalShell open={open} onClose={onClose} titleId="topup-modal-title">
      <Stepper step={step} />
      <div className="space-y-xl">{content}</div>
    </ModalShell>
  );
}
