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
  CircleCheckBig,
  Clock,
  CreditCard,
  Loader2,
  Smartphone,
  Undo2,
} from 'lucide-react';
import { useUser } from './UserProvider';
import { walletApi, ApiError, type RefundStatusResponse } from '@/lib/api';
import { showError } from '@/lib/toast';
import { ModalShell } from './ModalShell';

const MIN_REFUND = 1000;
const MAX_REASON_LENGTH = 500;

type RefundMethod = 'sbp' | 'card';

interface RefundModalContextValue {
  openRefund: () => void;
}

const RefundModalContext = createContext<RefundModalContextValue>({
  openRefund: () => {},
});

export function useRefundModal() {
  return useContext(RefundModalContext);
}

export function RefundModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openRefund = useCallback(() => setOpen(true), []);
  const close = useCallback(() => setOpen(false), []);

  const contextValue = useMemo<RefundModalContextValue>(
    () => ({ openRefund }),
    [openRefund],
  );

  return (
    <RefundModalContext.Provider value={contextValue}>
      {children}
      <RefundModal open={open} onClose={close} />
    </RefundModalContext.Provider>
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

function formatDeadline(iso: string): string {
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

function RefundModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useUser();

  const [status, setStatus] = useState<RefundStatusResponse | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [step, setStep] = useState<'form' | 'success'>('form');

  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<RefundMethod>('sbp');
  const [requisites, setRequisites] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [createdDeadline, setCreatedDeadline] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) return;
    setStep('form');
    setAmount('');
    setMethod('sbp');
    setRequisites('');
    setReason('');
    setSubmitting(false);
    setCreatedDeadline(null);
    setStatus(null);
    setLoadingStatus(true);
    walletApi
      .refundStatus()
      .then((res) => setStatus(res))
      .catch(() => setStatus(null))
      .finally(() => setLoadingStatus(false));
  }, [open, user]);

  const available = status?.available ?? 0;
  const amountValue = Math.floor(Number(amount) || 0);
  const digits = requisites.replace(/\D/g, '');
  const requisitesValid = method === 'card' ? digits.length === 16 : digits.length >= 10;
  const amountValid =
    Number.isFinite(amountValue) && amountValue >= MIN_REFUND && amountValue <= available;
  const reasonValid = reason.trim().length >= 5 && reason.trim().length <= MAX_REASON_LENGTH;
  const formValid = amountValid && requisitesValid && reasonValid;

  const amountError =
    amount === ''
      ? ''
      : !Number.isFinite(amountValue) || amountValue <= 0
        ? 'Укажите сумму'
        : amountValue < MIN_REFUND
          ? `Минимальная сумма — ${formatRub(MIN_REFUND)}`
          : amountValue > available
            ? `Максимальная сумма — ${formatRub(available)}`
            : '';

  const pendingRequest = status?.request?.status === 'pending';
  const unavailable = !loadingStatus && status !== null && (pendingRequest || !status.eligible);

  const handleRequisitesChange = (value: string) => {
    setRequisites(method === 'card' ? formatCardNumber(value) : formatPhoneNumber(value));
  };

  const handleMethodSelect = (next: RefundMethod) => {
    setMethod(next);
    setRequisites('');
  };

  const handleSubmit = async () => {
    if (!formValid || submitting) return;
    setSubmitting(true);
    try {
      const res = await walletApi.createRefund({
        amount: amountValue,
        reason: reason.trim(),
        requisites: requisites.trim(),
        method,
      });
      setCreatedDeadline(res.request.processingUntil);
      setStep('success');
      window.dispatchEvent(new CustomEvent('refund-created'));
    } catch (e) {
      const err = e as ApiError;
      showError(err?.message || 'Не удалось отправить заявку на возврат');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'success') {
    return (
      <ModalShell open={open} onClose={onClose} titleId="refund-modal-title" zIndexClass="z-[150]">
        <div className="flex flex-col items-center text-center gap-md animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CircleCheckBig className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="space-y-xs">
            <h2 id="refund-modal-title" className="text-2xl font-bold text-white">
              Заявка на возврат принята
            </h2>
            <p className="text-sm text-zinc-400">
              Мы получили вашу заявку и уже начали её обработку. Срок рассмотрения — до 30 дней
              {createdDeadline ? `, до ${formatDeadline(createdDeadline)}` : ''}.
            </p>
          </div>
          <div className="w-full rounded-panel bg-zinc-900 border border-zinc-800 p-md text-left space-y-xs">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Сумма возврата</span>
              <span className="font-bold text-money">{formatRub(amountValue)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Реквизиты</span>
              <span className="text-zinc-300 font-mono">{requisites}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-500">Статус</span>
              <span className="text-amber-400 font-semibold">В обработке</span>
            </div>
          </div>
          <p className="text-xs text-zinc-500">
            Статус заявки также отображается на главной странице.
          </p>
          <button
            onClick={onClose}
            className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-emerald-500/30"
          >
            Понятно
          </button>
        </div>
      </ModalShell>
    );
  }

  return (
    <ModalShell open={open} onClose={onClose} titleId="refund-modal-title" zIndexClass="z-[150]">
      <div className="flex gap-lg flex-col animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both] pr-1">
        <div className="text-center space-y-sm">
          <div className="mx-auto w-16 h-16 rounded-full bg-blue-500 flex items-center justify-center">
            <Undo2 className="w-8 h-8 text-white" strokeWidth={2.2} />
          </div>
          <h2 id="refund-modal-title" className="text-2xl font-bold text-white">
            Возврат средств
          </h2>
          <p className="text-sm text-zinc-400">
            Заполните заявку — мы рассмотрим её в течение 30 дней
          </p>
        </div>

        {loadingStatus ? (
          <div className="flex items-center justify-center gap-sm py-xl text-sm text-zinc-400">
            <Loader2 className="w-5 h-5 animate-spin" />
            Загружаем данные о депозитах…
          </div>
        ) : unavailable ? (
          <div className="space-y-sm">
            <div className="rounded-panel bg-zinc-900 border border-zinc-800 p-md text-sm text-zinc-400">
              {pendingRequest
                ? 'У вас уже есть заявка на возврат в обработке. Дождитесь её рассмотрения.'
                : 'Возврат средств доступен только пользователям с успешным депозитом.'}
            </div>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700"
            >
              Закрыть
            </button>
          </div>
        ) : (
          <>
            <div className="bg-zinc-900 rounded-card p-card border border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-xs text-sm text-zinc-300">
                <Undo2 className="w-4 h-4 text-blue-400" />
                Доступно к возврату
              </div>
              <span className="text-base font-bold text-money">{formatRub(available)}</span>
            </div>

            <div className="space-y-sm">
              <div className="space-y-xs">
                <label className="flex items-center gap-xs text-xs font-medium text-zinc-400">
                  <span className="text-blue-400 font-bold">₽</span>
                  Сумма возврата
                </label>
                <input
                  type="number"
                  min={MIN_REFUND}
                  max={available}
                  step={1}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={String(Math.min(available, 1000) || '')}
                  className="w-full px-md py-sm text-sm bg-zinc-900 rounded-control border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
                />
                {amountError ? (
                  <p className="text-xs text-red-400">{amountError}</p>
                ) : (
                  <p className="text-xs text-zinc-600">
                    Минимум {formatRub(MIN_REFUND)} · максимум {formatRub(available)}
                  </p>
                )}
              </div>

              <div className="space-y-xs">
                <span className="flex items-center gap-xs text-xs font-medium text-zinc-400">
                  <CreditCard className="w-3.5 h-3.5" />
                  Способ возврата
                </span>
                <div className="grid grid-cols-2 gap-sm">
                  <button
                    type="button"
                    onClick={() => handleMethodSelect('sbp')}
                    aria-pressed={method === 'sbp'}
                    className={`flex items-center justify-center gap-xs rounded-control px-md py-sm text-sm font-semibold transition-colors border ${
                      method === 'sbp'
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <Smartphone className="w-4 h-4" />
                    СБП
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMethodSelect('card')}
                    aria-pressed={method === 'card'}
                    className={`flex items-center justify-center gap-xs rounded-control px-md py-sm text-sm font-semibold transition-colors border ${
                      method === 'card'
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-700'
                    }`}
                  >
                    <CreditCard className="w-4 h-4" />
                    Карта
                  </button>
                </div>
              </div>

              <div className="space-y-xs">
                <label className="flex items-center gap-xs text-xs font-medium text-zinc-400">
                  <CreditCard className="w-3.5 h-3.5" />
                  Реквизиты получателя
                </label>
                <input
                  type="text"
                  inputMode="tel"
                  value={requisites}
                  onChange={(e) => handleRequisitesChange(e.target.value)}
                  placeholder={method === 'card' ? '0000 0000 0000 0000' : '+7 (___) ___-__-__'}
                  className="w-full px-md py-sm text-sm bg-zinc-900 rounded-control border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 font-mono"
                />
                <p className="text-xs text-zinc-600">
                  {method === 'card'
                    ? 'Номер карты, на который вернуть средства'
                    : 'Телефон, привязанный к СБП'}
                </p>
              </div>

              <div className="space-y-xs">
                <label className="flex items-center gap-xs text-xs font-medium text-zinc-400">
                  <Clock className="w-3.5 h-3.5" />
                  Причина возврата
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Расскажите, почему вы хотите вернуть средства"
                  maxLength={MAX_REASON_LENGTH}
                  rows={3}
                  className="w-full px-md py-sm text-sm bg-zinc-900 rounded-control border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700 resize-none"
                />
                <p className="text-xs text-zinc-600">{reason.trim().length} / {MAX_REASON_LENGTH}</p>
              </div>
            </div>

            <button
              onClick={handleSubmit}
              disabled={!formValid || submitting}
              className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Отправляем…
                </>
              ) : (
                <>
                  <Undo2 className="w-5 h-5" />
                  Отправить заявку
                </>
              )}
            </button>

            <p className="text-xs text-center text-zinc-500">
              Срок рассмотрения — до 30 дней. Средства вернутся на указанные реквизиты.
            </p>
          </>
        )}
      </div>
    </ModalShell>
  );
}
