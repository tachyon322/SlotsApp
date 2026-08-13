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
import {
  Wallet,
  ArrowDown,
  Coins,
  CreditCard,
  Smartphone,
  ArrowRight,
  Lock,
  Check,
  Zap,
  ShieldCheck,
  Crown,
} from 'lucide-react';
import { useUser } from './UserProvider';
import { useTopUpModal } from './TopUpModal';
import { usePaymentGate } from './PaymentGateModal';
import { walletApi, ApiError } from '@/lib/api';
import { showError } from '@/lib/toast';
import { ModalShell } from './ModalShell';

type Step = 'amount' | 'method' | 'confirm';

type WithdrawMethod = 'card' | 'sbp';

interface WithdrawModalContextValue {
  openWithdraw: () => void;
}

interface StepperProps {
  step: Step;
}

const MIN_WITHDRAW = 10000;

const PRESETS = [
  { amount: 10000, top: true },
  { amount: 15000 },
  { amount: 25000 },
  { amount: 50000 },
];

const METHODS: {
  id: WithdrawMethod;
  name: string;
  icon: typeof CreditCard;
  badge?: string;
  badgeClassName?: string;
  badgeShadow?: boolean;
  description: string;
}[] = [
  {
    id: 'card',
    name: 'Банковская карта',
    icon: CreditCard,
    badge: 'БЕЗ КОМИССИИ',
    badgeClassName: 'bg-emerald-500/20 text-emerald-400',
    badgeShadow: false,
    description: 'Visa, MasterCard, МИР',
  },
  {
    id: 'sbp',
    name: 'СБП',
    icon: Smartphone,
    badge: 'Популярно',
    badgeClassName: 'bg-gradient-to-r from-blue-500 to-blue-600',
    badgeShadow: true,
    description: 'Система быстрых платежей',
  },
];

const REQUISITES: Record<WithdrawMethod, string> = {
  card: '•••• •••• •••• 4321',
  sbp: '+7 (532) ***-**-26',
};

const WithdrawModalContext = createContext<WithdrawModalContextValue>({
  openWithdraw: () => {},
});

export function useWithdrawModal() {
  return useContext(WithdrawModalContext);
}

export function WithdrawModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openWithdraw = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const contextValue = useMemo<WithdrawModalContextValue>(
    () => ({ openWithdraw }),
    [openWithdraw],
  );

  return (
    <WithdrawModalContext.Provider value={contextValue}>
      {children}
      <WithdrawModal open={open} onClose={close} />
    </WithdrawModalContext.Provider>
  );
}

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function formatCardNumber(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ').trim();
}

function formatPhoneNumber(val: string): string {
  const digits = val.replace(/\D/g, '');
  let phoneDigits = digits;
  if (phoneDigits.startsWith('7') || phoneDigits.startsWith('8')) {
    phoneDigits = phoneDigits.slice(1);
  }
  phoneDigits = phoneDigits.slice(0, 10);

  if (phoneDigits.length === 0) return '';
  let result = '+7 ';
  if (phoneDigits.length > 0) result += `(${phoneDigits.slice(0, 3)}`;
  if (phoneDigits.length >= 3) result += `) ${phoneDigits.slice(3, 6)}`;
  if (phoneDigits.length >= 6) result += `-${phoneDigits.slice(6, 8)}`;
  if (phoneDigits.length >= 8) result += `-${phoneDigits.slice(8, 10)}`;
  return result;
}

function Stepper({ step }: StepperProps) {
  const stepIndex = step === 'amount' ? 0 : step === 'method' ? 1 : 2;

  return (
    <div className="flex items-center justify-center gap-xs mb-xl">
      {[0, 1, 2].map((index) => {
        const done = index < stepIndex;
        const active = index === stepIndex;

        return (
          <div key={index} className="flex items-center">
            <div className="relative">
              <div
                className={`w-8 h-8 rounded-pill flex items-center justify-center text-xs font-bold transition-colors ${
                  done || active
                    ? 'bg-blue-500 text-white'
                    : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {done ? <Check className="w-4 h-4" strokeWidth={3} /> : index + 1}
              </div>
              {active && (
                <div className="absolute inset-0 rounded-pill border-2 border-blue-500 opacity-0" />
              )}
            </div>
            {index < 2 && (
              <div className="w-12 h-0.5 mx-2xs overflow-hidden rounded-pill">
                <div
                  className={`h-full bg-blue-500 origin-left transition-transform duration-300 ${
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

interface QuickAmountProps {
  label: string;
  top?: boolean;
  disabled?: boolean;
  selected: boolean;
  onSelect: () => void;
}

function QuickAmount({ label, top, disabled, selected, onSelect }: QuickAmountProps) {
  return (
    <button
      onClick={onSelect}
      disabled={disabled}
      className={`relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button text-sm font-medium focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 px-md py-xs h-12 border-2 transition-all ${
        selected
          ? 'border-blue-500 bg-gradient-to-r from-blue-500/10 to-blue-600/10 text-white'
          : 'border-zinc-800 hover:border-zinc-700 hover:bg-blue-500/5 hover:text-white'
      }`}
    >
      <span>{label}</span>
      {top && (
        <span className="absolute -top-2 -right-1 px-1 py-0.5 bg-gradient-to-r from-blue-500 to-blue-600 rounded text-[8px] font-bold text-white shadow-lg shadow-blue-500/25">
          ТОП
        </span>
      )}
    </button>
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
        selected
          ? 'border-blue-500 hover:border-blue-500'
          : 'border-zinc-800 hover:border-zinc-700'
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
          <Icon className={`w-6 h-6 ${selected ? 'text-blue-400' : 'text-zinc-400'}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-2xs">
            <p className="font-bold text-base leading-tight text-zinc-200">{method.name}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-2xs">
            <p className="text-xs text-zinc-500">{method.description}</p>
          </div>
          <div className="flex items-center gap-sm text-xs">
            <div className="text-zinc-500">от {formatRub(MIN_WITHDRAW)}</div>
          </div>
        </div>
        <div className="shrink-0">
          <div
            className={`w-6 h-6 rounded-pill border-2 flex items-center justify-center transition-colors ${
              selected ? 'border-blue-500' : 'border-zinc-600'
            }`}
          >
            {selected && <div className="w-3 h-3 rounded-pill bg-blue-500" />}
          </div>
        </div>
      </div>
    </div>
  );
}

function WithdrawModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useUser();
  const { openTopUp } = useTopUpModal();
  const { openGate } = usePaymentGate();
  const [step, setStep] = useState<Step>('amount');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [amountError, setAmountError] = useState('');
  const [method, setMethod] = useState<WithdrawMethod | null>(null);
  const [requisites, setRequisites] = useState('');
  const [loading, setLoading] = useState(false);
  const [gateCode, setGateCode] = useState<'need_deposit' | 'need_verification' | 'need_premium' | 'verification_pending' | null>(null);

  const balance = user?.balance ?? 0;
  const amount = selectedPreset ?? (custom ? parseInt(custom, 10) : 0);
  const amountValid =
    Number.isFinite(amount) && amount >= MIN_WITHDRAW && amount <= balance;

  const rawRequisitesDigits = requisites.replace(/\D/g, '');
  const requisitesValid =
    method === 'card'
      ? rawRequisitesDigits.length === 16
      : method === 'sbp'
      ? rawRequisitesDigits.length >= 10
      : false;

  useEffect(() => {
    if (open) {
      setStep('amount');
      setSelectedPreset(null);
      setCustom('');
      setAmountError('');
      setMethod(null);
      setRequisites('');
      setLoading(false);
      setGateCode(null);
    }
  }, [open]);

  const handleSelectMethod = (selectedMethod: WithdrawMethod) => {
    setMethod(selectedMethod);
    setRequisites('');
  };

  const handleWithdraw = async () => {
    if (!amountValid || !method || !requisitesValid || loading) return;
    setLoading(true);
    setGateCode(null);
    const started = Date.now();
    const waitRemaining = () => {
      const remaining = 4000 - (Date.now() - started);
      return remaining > 0
        ? new Promise((r) => setTimeout(r, remaining))
        : Promise.resolve();
    };
    try {
      await walletApi.withdraw(amount, method, requisites);
      await waitRemaining();
      await refresh();
      onClose();
    } catch (err) {
      await waitRemaining();
      const apiErr = err as ApiError;
      const code = apiErr?.code;
      if (code === 'need_deposit' || code === 'need_verification' || code === 'need_premium' || code === 'verification_pending') {
        setGateCode(code);
        await refresh();
      }
      showError(apiErr?.message || 'Ошибка создания заявки на вывод');
    } finally {
      setLoading(false);
    }
  };

  const handleGateAction = async (purpose: 'verification' | 'premium') => {
    const ok = await openGate(purpose);
    if (ok) {
      setGateCode(null);
    }
  };

  const handleDepositAction = () => {
    openTopUp();
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
    if (Number.isFinite(parsed) && parsed > balance) {
      setAmountError(`Недостаточно средств для вывода`);
      return;
    }
    setAmountError(
      Number.isFinite(parsed) && parsed < MIN_WITHDRAW
        ? `Минимальная сумма — ${formatRub(MIN_WITHDRAW)}`
        : '',
    );
  };

  const goTo = (next: Step) => {
    setStep(next);
  };

  const continueFromAmount = () => {
    if (amountValid) {
      setAmountError('');
      goTo('method');
    } else {
      setAmountError(`Минимальная сумма — ${formatRub(MIN_WITHDRAW)}`);
    }
  };

  const content = (() => {
    switch (step) {
      case 'amount':
        return (
          <div
            key="amount"
            className="flex gap-lg flex-col animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]"
          >
            <div className="text-center space-y-sm">
              <h2 id="withdraw-modal-title" className="text-2xl font-bold text-white">Сумма вывода</h2>
              <p className="text-sm text-zinc-400">Укажите сумму для вывода средств</p>
            </div>

            <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-card p-card-lg">
              <div className="flex items-center justify-between mb-xs">
                <div className="flex items-center gap-2xs">
                  <Wallet className="w-5 h-5 text-blue-400" />
                  <p className="text-sm text-zinc-400 font-medium">Доступно для вывода</p>
                </div>
                <ArrowDown className="w-4 h-4 text-blue-500" />
              </div>
              <p className="text-3xl font-bold text-money">{formatRub(balance)}</p>
            </div>

            <div className="space-y-sm">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Быстрый выбор
              </label>
              <div className="grid grid-cols-3 gap-xs">
                {PRESETS.map((preset) => (
                  <QuickAmount
                    key={preset.amount}
                    label={formatRub(preset.amount)}
                    top={preset.top}
                    disabled={preset.amount > balance}
                    selected={selectedPreset === preset.amount}
                    onSelect={() => handlePresetSelect(preset.amount)}
                  />
                ))}
                <QuickAmount
                  label="ВСЕ"
                  selected={selectedPreset === balance}
                  onSelect={() => handlePresetSelect(balance)}
                />
              </div>
            </div>

            <div className="space-y-xs">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                Или введите свою сумму
              </label>
              <div className="relative">
                <input
                  placeholder={`Минимум ${formatRub(MIN_WITHDRAW)}`}
                  type="number"
                  value={custom}
                  onChange={(event) => handleCustomChange(event.target.value)}
                  className="w-full px-md py-sm pr-12 text-lg font-semibold bg-zinc-900 rounded-control border-2 text-white placeholder:text-zinc-600 focus:outline-none border-zinc-800 focus:border-blue-500 focus:ring-blue-500/10"
                />
                <span className="absolute right-md top-1/2 -translate-y-1/2 text-zinc-500 font-bold">
                  ₽
                </span>
              </div>
              {amountError && <p className="text-xs text-red-400">{amountError}</p>}
            </div>

            <button
              onClick={continueFromAmount}
              disabled={!amountValid}
              className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-blue-500/25"
            >
              Продолжить
            </button>
          </div>
        );

      case 'method':
        return (
          <div
            key="method"
            className="flex gap-lg flex-col animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]"
          >
            <div className="text-center space-y-sm">
              <h2 id="withdraw-modal-title" className="text-2xl font-bold text-white">Способ вывода</h2>
              <p className="text-sm text-zinc-400">Выберите способ и укажите реквизиты</p>
            </div>

            <div className="space-y-sm" role="radiogroup" aria-label="Способ вывода">
              {METHODS.map((m) => (
                <MethodCard
                  key={m.id}
                  method={m}
                  selected={method === m.id}
                  onSelect={() => handleSelectMethod(m.id)}
                />
              ))}
            </div>

            {method && (
              <div className="space-y-xs animate-[topup-step-in_0.2s_ease-out]">
                <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">
                  {method === 'card' ? 'Номер карты' : 'Номер телефона (СБП)'}
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={requisites}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (method === 'card') {
                        setRequisites(formatCardNumber(val));
                      } else {
                        setRequisites(formatPhoneNumber(val));
                      }
                    }}
                    placeholder={method === 'card' ? '0000 0000 0000 0000' : '+7 (999) 000-00-00'}
                    className="w-full px-md py-sm text-base font-mono font-semibold bg-zinc-900 rounded-control border-2 text-white placeholder:text-zinc-600 focus:outline-none border-zinc-800 focus:border-blue-500 focus:ring-blue-500/10"
                  />
                </div>
                {requisites && !requisitesValid && (
                  <p className="text-xs text-red-400">
                    {method === 'card' ? 'Введите 16 цифр номера карты' : 'Введите номер телефона в формате +7 (999) 000-00-00'}
                  </p>
                )}
              </div>
            )}

            <div className="flex gap-sm">
              <button
                onClick={() => goTo('amount')}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-button text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs flex-1 h-12 border-2 border-zinc-800 hover:border-zinc-700"
              >
                Назад
              </button>
              <button
                onClick={() => goTo('confirm')}
                disabled={!method || !requisitesValid}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap text-sm font-medium focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 px-md py-xs relative flex-1 h-12 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-button shadow-lg shadow-blue-500/25 transition-all overflow-hidden"
              >
                <span className="relative z-10">Продолжить</span>
              </button>
            </div>
          </div>
        );

      case 'confirm':
        return (
          <div
            key="confirm"
            className="flex gap-lg flex-col animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]"
          >
            <div className="text-center space-y-sm">
              <h2 id="withdraw-modal-title" className="text-2xl font-bold text-white">Подтверждение</h2>
              <p className="text-sm text-zinc-400">Проверьте детали вывода</p>
            </div>

            <div className="bg-zinc-900 rounded-card p-card-lg border border-zinc-800">
              <h3 className="text-sm font-bold text-zinc-400 uppercase tracking-wide mb-md">
                Детали вывода
              </h3>
              <div className="space-y-sm mb-md">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2xs">
                    <Coins className="w-4 h-4 text-zinc-500" />
                    <span className="text-sm text-zinc-300">Сумма вывода</span>
                  </div>
                  <span className="text-sm font-bold text-money">{formatRub(amount)}</span>
                </div>
                {method && (
                  <div className="flex items-center justify-between pt-xs border-t border-zinc-800">
                    <span className="text-xs text-zinc-500">Способ вывода</span>
                    <div className="flex items-center gap-1.5">
                      {(() => {
                        const m = METHODS.find((item) => item.id === method)!;
                        const Icon = m.icon;
                        return (
                          <>
                            <Icon className="w-3.5 h-3.5 text-blue-400" />
                            <span className="text-xs font-medium text-zinc-300">{m.name}</span>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {method && (
                  <div className="flex items-center justify-between pb-2">
                    <span className="text-xs text-zinc-500">Реквизиты</span>
                    <span className="text-xs font-mono text-zinc-300">{requisites}</span>
                  </div>
                )}
              </div>
              <div className="pt-md border-t-2 border-blue-500/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-zinc-500 mb-2xs">К получению</p>
                    <p className="text-2xl font-bold text-money">{formatRub(amount)}</p>
                  </div>
                  <ArrowRight className="w-6 h-6 text-blue-500" />
                </div>
              </div>
            </div>

            {gateCode && gateCode !== 'verification_pending' && (
              <div className="space-y-sm">
                {gateCode === 'need_deposit' && (
                  <button
                    onClick={handleDepositAction}
                    className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-md w-full h-12 text-sm font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
                  >
                    <Zap className="w-4 h-4" />
                    Пополнить баланс
                  </button>
                )}
                {gateCode === 'need_verification' && (
                  <button
                    onClick={() => handleGateAction('verification')}
                    className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-md w-full h-12 text-sm font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Пройти верификацию (2000₽)
                  </button>
                )}
                {gateCode === 'need_premium' && (
                  <button
                    onClick={() => handleGateAction('premium')}
                    className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-md w-full h-12 text-sm font-bold bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white"
                  >
                    <Crown className="w-4 h-4" />
                    Купить Премиум (2000₽)
                  </button>
                )}
              </div>
            )}

            <div className="space-y-sm">
              <button
                onClick={handleWithdraw}
                disabled={loading}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap focus-visible:outline-none disabled:opacity-50 px-2xl relative w-full h-14 text-base font-bold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-control shadow-lg shadow-blue-500/25 transition-all overflow-hidden"
              >
                <span className="absolute inset-0 overflow-hidden rounded-control">
                  <span className="absolute inset-0 -translate-x-full animate-[btn-shine_2.5s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                </span>
                <div className="relative z-10 flex items-center gap-xs">
                  <Lock className="w-5 h-5" />
                  <span>{loading ? 'Обработка...' : `Подтвердить вывод ${formatRub(amount)}`}</span>
                </div>
              </button>
              <button
                onClick={() => goTo('method')}
                disabled={loading}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-button text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700"
              >
                Назад
              </button>
              <p className="text-xs text-center text-zinc-600 px-md">
                Нажимая «Подтвердить» вы создаете заявку на вывод средств
              </p>
            </div>
          </div>
        );
    }
  })();

  return (
    <ModalShell open={open} onClose={onClose} titleId="withdraw-modal-title">
      <Stepper step={step} />
      <div className="space-y-xl">{content}</div>
    </ModalShell>
  );
}
