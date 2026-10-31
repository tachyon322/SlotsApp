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
import { CreditCard, Smartphone, Check, Loader2, Info } from 'lucide-react';
import { useUser } from './UserProvider';
import { LgSheet } from './ui/LgSheet';
import Image from 'next/image';
import { useTopUpModal } from './TopUpModal';
import { usePaymentGate } from './PaymentGateModal';
import { useVerificationModal } from './VerificationModal';
import { walletApi, ApiError } from '@/lib/api';
import { WITHDRAWAL_PROCESSING_TEXT, formatDeadlineDate } from '@/lib/withdrawal';
import { showError } from '@/lib/toast';
import { track } from '@/lib/analytics';

type Step = 'amount' | 'method' | 'confirm' | 'processing' | 'created';
type WithdrawMethod = 'card' | 'sbp';

interface WithdrawModalContextValue {
  openWithdraw: () => void;
}

const MIN_WITHDRAW = 10000;
const PROCESSING_DELAY_MS = 7500;

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
  description: string;
}[] = [
  {
    id: 'sbp',
    name: 'СБП',
    icon: Smartphone,
    description: 'Система быстрых платежей · без комиссии',
  },
  {
    id: 'card',
    name: 'Банковская карта',
    icon: CreditCard,
    description: 'МИР, Visa, Mastercard · без комиссии',
  },
];

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

export function WithdrawModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useUser();
  const { openTopUp } = useTopUpModal();
  const { openGate } = usePaymentGate();
  const { openVerification } = useVerificationModal();

  const [step, setStep] = useState<Step>('amount');
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [amountError, setAmountError] = useState('');
  const [method, setMethod] = useState<WithdrawMethod>('sbp');
  const [requisites, setRequisites] = useState('');
  const [loading, setLoading] = useState(false);
  const [gateCode, setGateCode] = useState<'need_deposit' | 'need_verification' | 'need_premium' | null>(null);
  const [createdAmount, setCreatedAmount] = useState<number>(0);
  const [createdUntil, setCreatedUntil] = useState<string | null>(null);

  const balance = user?.balance ?? 0;
  const amount = selectedPreset ?? (custom ? parseInt(custom, 10) : 0);
  const amountValid = Number.isFinite(amount) && amount >= MIN_WITHDRAW && amount <= balance;

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
      setMethod('sbp');
      setRequisites('');
      setLoading(false);
      setGateCode(null);
      setCreatedAmount(0);
      setCreatedUntil(null);
    }
  }, [open]);

  // Lock body scroll
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  // Escape key handler
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const handleSelectMethod = (selectedMethod: WithdrawMethod) => {
    setMethod(selectedMethod);
    setRequisites('');
  };

  const handleWithdraw = async () => {
    if (!amountValid || !method || !requisitesValid || loading) return;
    setLoading(true);
    setGateCode(null);
    setStep('processing');

    const delay = new Promise<void>((resolve) => setTimeout(resolve, PROCESSING_DELAY_MS));
    let withdrawError: unknown = null;
    const withdrawTracked = walletApi
      .withdraw(amount, method, requisites)
      .catch((e) => {
        withdrawError = e;
        return null;
      });

    const [, withdrawResult] = await Promise.all([delay, withdrawTracked]);

    if (withdrawError) {
      setStep('confirm');
      const apiErr = withdrawError as ApiError;
      const code = apiErr?.code;
      if (code === 'need_deposit' || code === 'need_verification' || code === 'need_premium') {
        setGateCode(code);
        await refresh();
      }
      showError(apiErr?.message || 'Ошибка создания заявки на вывод');
      setLoading(false);
      return;
    }

    try {
      setCreatedAmount(amount);
      setCreatedUntil(withdrawResult?.processingUntil ?? null);
      setStep('created');
      track('withdraw_request');
      window.dispatchEvent(new CustomEvent('withdraw-created'));
      await refresh();
    } catch (err) {
      setStep('confirm');
      showError((err as Error)?.message || 'Ошибка создания заявки на вывод');
    } finally {
      setLoading(false);
    }
  };

  const handleGateAction = async (purpose: 'verification' | 'premium') => {
    if (purpose === 'verification') {
      const ok = await openVerification({
        amount: amount,
        method: method ? (method === 'card' ? 'Банковская карта' : 'СБП') : null,
        requisites: requisites,
      });
      if (ok) {
        await refresh();
        setGateCode('need_premium');
      }
      return;
    }
    const ok = await openGate(purpose);
    if (ok) {
      await refresh();
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
      setAmountError('Недостаточно средств для вывода');
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
      if (amount < MIN_WITHDRAW) {
        setAmountError(`Минимальная сумма — ${formatRub(MIN_WITHDRAW)}`);
      } else if (amount > balance) {
        setAmountError('Недостаточно средств для вывода');
      }
    }
  };

  if (!open) return null;

  const stepNo = step === 'amount' ? 1 : step === 'method' ? 2 : 3;
  const progress = step === 'amount' || step === 'method' || (step === 'confirm' && !gateCode)
    ? { step: stepNo, total: 3 }
    : null;
  const onBack =
    step === 'method' ? () => goTo('amount')
    : step === 'confirm' && !gateCode ? () => goTo('method')
    : null;
  const methodName = method === 'card' ? 'Банковская карта' : 'СБП';
  const amountInputValue = selectedPreset !== null ? String(selectedPreset) : custom;
  const amountInputShown = amountInputValue ? Number(amountInputValue).toLocaleString('ru-RU') : '';
  const allSelected = selectedPreset === balance && balance >= MIN_WITHDRAW;

  const title =
    step === 'amount' ? 'Вывод'
    : step === 'method' ? 'Способ вывода'
    : step === 'confirm' ? (gateCode ? 'Требуется действие' : 'Реквизиты')
    : step === 'processing' ? 'Обработка'
    : 'Заявка создана';

  const gate = gateCode
    ? {
        need_deposit: {
          img: '/lg/img/token.webp',
          title: 'Требуется пополнение',
          text: 'Вывод средств осуществляется для пользователей совершивших 1 депозит на любую сумму',
          action: 'Пополнить баланс',
          run: handleDepositAction,
        },
        need_verification: {
          img: '/lg/img/status-shield.webp',
          title: 'Требуется верификация',
          text: 'Для вывода средств мы верифицируем вашу карту - так мы будем уверены, что деньги идут на ваш счет',
          action: 'Пройти · 2 000 ₽',
          run: () => handleGateAction('verification'),
        },
        need_premium: {
          img: '/lg/img/status-crown.webp',
          title: 'Требуется Premium',
          text: 'Наши платежные системы сейчас перегружены, приобретите премиум для 100% вывода средств, или попробуйте вывести позже. После оформления премум подписки, вы сможете вывести деньги',
          action: 'Купить Premium · 2 000 ₽',
          run: () => handleGateAction('premium'),
        },
      }[gateCode]
    : null;

  let footer: ReactNode = null;
  if (step === 'amount') {
    footer = (
      <button type="button" className="pg-btn pg-btn-acc" disabled={!amountValid} onClick={continueFromAmount}>
        Выбрать способ
      </button>
    );
  } else if (step === 'method') {
    footer = (
      <>
        <button type="button" className="pg-btn pg-btn-sec ls-fit" onClick={() => goTo('amount')}>
          Назад
        </button>
        <button type="button" className="pg-btn pg-btn-acc" disabled={!method} onClick={() => goTo('confirm')}>
          Продолжить
        </button>
      </>
    );
  } else if (step === 'confirm' && gate) {
    footer = (
      <>
        <button type="button" className="pg-btn pg-btn-sec ls-fit" onClick={() => setGateCode(null)}>
          Назад
        </button>
        <button type="button" className="pg-btn pg-btn-acc" onClick={gate.run}>
          {gate.action}
        </button>
      </>
    );
  } else if (step === 'confirm') {
    footer = (
      <button
        type="button"
        className="pg-btn pg-btn-acc"
        disabled={!amountValid || !method || !requisitesValid || loading}
        onClick={handleWithdraw}
      >
        {loading ? (
          <>
            <Loader2 className="ls-spin" />
            Обработка...
          </>
        ) : (
          'Подтвердить вывод'
        )}
      </button>
    );
  } else if (step === 'created') {
    footer = (
      <button type="button" className="pg-btn pg-btn-acc" onClick={onClose}>
        Готово
      </button>
    );
  }

  return (
    <LgSheet
      titleId="web-withdrawal-title"
      title={title}
      progress={progress}
      onBack={onBack}
      backDisabled={loading}
      onClose={onClose}
      footer={footer}
      state={step}
    >
      {/* ШАГ 1: СУММА */}
      {step === 'amount' && (
        <>
          <div className="ls-avail">
            <div>
              <small>Доступно для вывода</small>
              <b>{formatRub(balance)}</b>
            </div>
            <button
              type="button"
              className="ls-pill"
              data-on={allSelected}
              disabled={balance < MIN_WITHDRAW}
              aria-pressed={allSelected}
              onClick={() => handlePresetSelect(balance)}
            >
              Всё
            </button>
          </div>

          <label className="ls-lbl" htmlFor="web-withdrawal-amount" style={{ marginTop: 18 }}>
            Сумма вывода
          </label>
          <label className="ls-amt" htmlFor="web-withdrawal-amount">
            <span className="ls-amt-fit" data-value={amountInputShown || '0'}>
              <input
                id="web-withdrawal-amount"
                size={1}
                inputMode="numeric"
                autoComplete="off"
                placeholder="0"
                value={amountInputShown}
                onChange={(e) => handleCustomChange(e.target.value.replace(/\D/g, '').slice(0, 9))}
              />
            </span>
            <b aria-hidden="true">₽</b>
          </label>

          <div className="ls-chips" role="group" aria-label="Быстрый выбор">
            {PRESETS.map((p) => {
              const isSelected = selectedPreset === p.amount;
              const isDisabled = p.amount > balance;
              return (
                <button
                  key={p.amount}
                  type="button"
                  className="ls-chip"
                  data-on={isSelected}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                  onClick={() => handlePresetSelect(p.amount)}
                >
                  {p.top && <small>Топ</small>}
                  <b>{formatRub(p.amount)}</b>
                  {isDisabled && <em>больше баланса</em>}
                </button>
              );
            })}
          </div>

          <p className="ls-sub" data-error={Boolean(amountError)} style={{ marginTop: 12 }}>
            {amountError || `Минимальная сумма — ${formatRub(MIN_WITHDRAW)}`}
          </p>
        </>
      )}

      {/* ШАГ 2: СПОСОБ */}
      {step === 'method' && (
        <>
          <span className="ls-lbl">Куда вывести {formatRub(amount)}</span>
          <div role="radiogroup" aria-label="Способ вывода">
            {METHODS.map((m) => {
              const isSelected = method === m.id;
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  className="ls-method"
                  data-on={isSelected}
                  onClick={() => handleSelectMethod(m.id)}
                >
                  <span className="ls-method-ic">
                    <Icon />
                  </span>
                  <span className="ls-method-tx">
                    <b>{m.name}</b>
                    <span>{m.description}</span>
                  </span>
                  <span className="ls-radio" data-on={isSelected}>
                    {isSelected && <Check />}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ШАГ 3: РЕКВИЗИТЫ / ТРЕБУЕТСЯ ДЕЙСТВИЕ */}
      {step === 'confirm' && gate && (
        <div className="ls-res" data-size="sm">
          <Image src={gate.img} alt="" width={120} height={120} />
          <h3>{gate.title}</h3>
          <p>{gate.text}</p>
        </div>
      )}

      {step === 'confirm' && !gate && (
        <>
          <label
            className="ls-field"
            htmlFor="web-withdrawal-requisites"
            data-invalid={Boolean(requisites && !requisitesValid)}
          >
            <small>{method === 'card' ? 'Номер банковской карты' : 'Номер телефона (СБП)'}</small>
            <input
              id="web-withdrawal-requisites"
              type="text"
              inputMode="numeric"
              autoComplete="off"
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
            />
          </label>
          {requisites && !requisitesValid && (
            <p className="ls-sub" data-error="true" style={{ marginTop: 8 }}>
              {method === 'card' ? 'Введите 16 цифр номера карты' : 'Введите корректный номер телефона'}
            </p>
          )}

          <div className="ls-kv">
            <div>
              Сумма к получению<b>{formatRub(amount)}</b>
            </div>
            <div>
              Способ получения<b>{methodName}</b>
            </div>
            {requisitesValid && (
              <div>
                Реквизиты<b>{requisites}</b>
              </div>
            )}
          </div>
          <p className="ls-note">
            <Info />
            <span>{WITHDRAWAL_PROCESSING_TEXT}</span>
          </p>
        </>
      )}

      {/* ОБРАБОТКА */}
      {step === 'processing' && (
        <div className="ls-res" style={{ paddingBottom: 18 }}>
          <Image src="/lg/img/status-hourglass.webp" alt="" width={150} height={150} />
          <h3>Обработка заявки...</h3>
          <p>Проверяем параметры операции и регистрируем заявку в платёжном шлюзе.</p>
          <Loader2 className="ls-spin" style={{ width: 26, height: 26, marginTop: 16, color: 'var(--lg-t3)' }} />
        </div>
      )}

      {/* ЗАЯВКА СОЗДАНА */}
      {step === 'created' && (
        <>
          <div className="ls-res">
            <Image src="/lg/img/status-withdraw.webp" alt="" width={150} height={150} />
            <h3>Вывод отправлен</h3>
            <p>Заявка на {formatRub(createdAmount)} передана в обработку.</p>
          </div>
          <div className="ls-kv">
            <div>
              Сумма<b>{formatRub(createdAmount)}</b>
            </div>
            <div>
              Статус<b data-tone="wait">Заявка обрабатывается</b>
            </div>
            <div>
              Обычно занимает<b>1–3 часа</b>
            </div>
            {createdUntil && (
              <div>
                Ожидаемый срок<b>до {formatDeadlineDate(createdUntil)}</b>
              </div>
            )}
          </div>
          <p className="ls-note">
            <Info />
            <span>{WITHDRAWAL_PROCESSING_TEXT}</span>
          </p>
        </>
      )}
    </LgSheet>
  );
}
