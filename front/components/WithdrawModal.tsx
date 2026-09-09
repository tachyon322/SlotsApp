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
  CreditCard,
  Smartphone,
  ArrowRight,
  Check,
  Zap,
  ShieldCheck,
  Crown,
  Loader2,
  Info,
} from 'lucide-react';
import { useUser } from './UserProvider';
import { useTopUpModal } from './TopUpModal';
import { usePaymentGate } from './PaymentGateModal';
import { useVerificationModal } from './VerificationModal';
import { walletApi, ApiError } from '@/lib/api';
import { showError } from '@/lib/toast';

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
      });

    await Promise.all([delay, withdrawTracked]);

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
      setStep('created');
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

  return (
    <div
      className="web-dialog_overlay__MnStH"
      data-web-dialog-frame="web-dialog-withdrawal"
      data-web-dialog-size="standard"
      data-web-dialog-mobile="detached"
      data-web-dialog-placement="center"
      data-web-dialog-topmost="true"
      data-close-blocked="false"
      style={{
        '--web-dialog-stack-index': 0,
        '--web-dialog-viewport-height': '100dvh',
        '--web-dialog-viewport-width': '100vw',
        '--web-dialog-viewport-top': '0px',
        '--web-dialog-viewport-left': '0px',
      } as React.CSSProperties}
    >
      <button
        type="button"
        className="web-dialog_backdrop__hf_yN"
        data-web-dialog-backdrop="true"
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        className="web-dialog_panel__ZC8Km"
        role="dialog"
        aria-labelledby="web-withdrawal-title"
        aria-describedby="web-withdrawal-description"
        tabIndex={-1}
        data-web-dialog-panel="true"
        data-web-dialog-asset="withdrawal"
        data-web-dialog-asset-phase="ready"
        aria-modal="true"
      >
        <div className="web-dialog_chrome__jivZf" data-web-dialog-chrome="true">
          <button
            type="button"
            className="web-dialog_close__DPjMy"
            aria-label="Закрыть"
            onClick={onClose}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="m6.75 6.75 10.5 10.5m0-10.5-10.5 10.5" />
            </svg>
          </button>
        </div>

        <div className="web-dialog_scroll__AcpCy" data-web-dialog-scroll-region="true" tabIndex={0}>
          <div
            className="web-withdrawal-dialog_dialogLayoutAmount__aSOLm"
            data-web-withdrawal-state={step}
            data-web-withdrawal-geometry="vertical-fintech"
          >
            <div className="web-withdrawal-dialog_contentColumn__ClUE1">
              {/* ШАГ 1: ВЫБОР СУММЫ */}
              {step === 'amount' && (
                <section
                  className="web-withdrawal-dialog_stateBody__ypEcn"
                  aria-labelledby="web-withdrawal-title"
                  data-withdrawal-amount-composition="vertical-fintech"
                >
                  <header className="web-withdrawal-dialog_stateHeader__q8V2O">
                    <span className="web-withdrawal-dialog_eyebrow__tybVe">Вывод средств</span>
                    <h2 id="web-withdrawal-title">Выберите сумму</h2>
                    <p id="web-withdrawal-description">Укажите сумму для вывода.</p>
                  </header>

                  {/* Плашка баланса с артом */}
                  <div className="web-withdrawal-dialog_balancePlate__h24vU">
                    <span className="web-withdrawal-balanceCopy__AKuxW web-withdrawal-dialog_balanceCopy__AKuxW">
                      <span className="web-withdrawal-dialog_balanceIcon__ZnmCP" aria-hidden="true">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="24"
                          height="24"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <rect width="18" height="18" x="3" y="3" rx="2" />
                          <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2" />
                          <path d="M3 11h3c.8 0 1.6.3 2.1.9l1.1.9c1.6 1.6 4.1 1.6 5.7 0l1.1-.9c.5-.5 1.3-.9 2.1-.9H21" />
                        </svg>
                      </span>
                      <span>
                        <small>Доступно для вывода</small>
                        <strong>{formatRub(balance)}</strong>
                      </span>
                    </span>

                    <div
                      className="web-withdrawal-dialog_artEmbedded__Imz_S"
                      data-withdrawal-art-placement="balance-card"
                      data-w4-asset-slot="withdrawal-wallet-main"
                      data-asset-family-id="withdrawal"
                      data-withdrawal-art-variant="wallet"
                      aria-hidden="true"
                    >
                      <span className="web-withdrawal-dialog_artHalo__CgIVi" />
                      <picture
                        className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h web-withdrawal-dialog_artTexture__zHZVw"
                        style={{
                          '--web-hub-asset-aspect': '960 / 432',
                          '--web-hub-asset-position': '50% 50%',
                        } as React.CSSProperties}
                      >
                        <source
                          type="image/avif"
                          srcSet="/images/web-hub/v1/modals/family-e-withdrawal/withdraw-balance-card-texture-640w.avif 640w, /images/web-hub/v1/modals/family-e-withdrawal/withdraw-balance-card-texture-960w.avif 960w, /images/web-hub/v1/modals/family-e-withdrawal/withdraw-balance-card-texture-1440w.avif 1440w"
                          sizes="(max-width: 640px) calc(100vw - 64px), 520px"
                        />
                        <source
                          type="image/webp"
                          srcSet="/images/web-hub/v1/modals/family-e-withdrawal/withdraw-balance-card-texture-640w.webp 640w, /images/web-hub/v1/modals/family-e-withdrawal/withdraw-balance-card-texture-960w.webp 960w, /images/web-hub/v1/modals/family-e-withdrawal/withdraw-balance-card-texture-1440w.webp 1440w"
                          sizes="(max-width: 640px) calc(100vw - 64px), 520px"
                        />
                        <img
                          className="web-hub-runtime-picture_image__63vQy"
                          width={960}
                          height={432}
                          sizes="(max-width: 640px) calc(100vw - 64px), 520px"
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          src="/images/web-hub/v1/modals/family-e-withdrawal/withdraw-balance-card-texture-960w.webp"
                        />
                      </picture>
                      <picture
                        className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h web-withdrawal-dialog_artTransferLines__PtHBz"
                        style={{
                          '--web-hub-asset-aspect': '960 / 432',
                          '--web-hub-asset-position': '50% 50%',
                        } as React.CSSProperties}
                      >
                        <source
                          type="image/avif"
                          srcSet="/images/web-hub/v1/modals/family-e-withdrawal/withdraw-transfer-lines-640w.avif 640w, /images/web-hub/v1/modals/family-e-withdrawal/withdraw-transfer-lines-960w.avif 960w, /images/web-hub/v1/modals/family-e-withdrawal/withdraw-transfer-lines-1440w.avif 1440w"
                          sizes="(max-width: 640px) calc(100vw - 64px), 520px"
                        />
                        <source
                          type="image/webp"
                          srcSet="/images/web-hub/v1/modals/family-e-withdrawal/withdraw-transfer-lines-640w.webp 640w, /images/web-hub/v1/modals/family-e-withdrawal/withdraw-transfer-lines-960w.webp 960w, /images/web-hub/v1/modals/family-e-withdrawal/withdraw-transfer-lines-1440w.webp 1440w"
                          sizes="(max-width: 640px) calc(100vw - 64px), 520px"
                        />
                        <img
                          className="web-hub-runtime-picture_image__63vQy"
                          width={960}
                          height={432}
                          sizes="(max-width: 640px) calc(100vw - 64px), 520px"
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          src="/images/web-hub/v1/modals/family-e-withdrawal/withdraw-transfer-lines-960w.webp"
                        />
                      </picture>
                      <picture
                        className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h web-withdrawal-dialog_artSubject__frDBY"
                        style={{
                          '--web-hub-asset-aspect': '480 / 480',
                          '--web-hub-asset-position': '50% 50%',
                        } as React.CSSProperties}
                      >
                        <source
                          type="image/avif"
                          srcSet="/images/web-hub/v1/modals/family-e-withdrawal/withdrawal-wallet-main-320w.avif 320w, /images/web-hub/v1/modals/family-e-withdrawal/withdrawal-wallet-main-480w.avif 480w, /images/web-hub/v1/modals/family-e-withdrawal/withdrawal-wallet-main-640w.avif 640w"
                          sizes="(max-width: 640px) 180px, 260px"
                        />
                        <source
                          type="image/webp"
                          srcSet="/images/web-hub/v1/modals/family-e-withdrawal/withdrawal-wallet-main-320w.webp 320w, /images/web-hub/v1/modals/family-e-withdrawal/withdrawal-wallet-main-480w.webp 480w, /images/web-hub/v1/modals/family-e-withdrawal/withdrawal-wallet-main-640w.webp 640w"
                          sizes="(max-width: 640px) 180px, 260px"
                        />
                        <img
                          className="web-hub-runtime-picture_image__63vQy"
                          width={480}
                          height={480}
                          sizes="(max-width: 640px) 180px, 260px"
                          alt=""
                          aria-hidden="true"
                          loading="lazy"
                          decoding="async"
                          draggable={false}
                          src="/images/web-hub/v1/modals/family-e-withdrawal/withdrawal-wallet-main-480w.webp"
                        />
                      </picture>
                      <span className="web-withdrawal-dialog_artCaption__NcDIM">LITGAME · ВЫВОД</span>
                    </div>
                  </div>

                  {/* Сетка быстрого выбора */}
                  <fieldset className="web-withdrawal-dialog_fieldset__RNunL">
                    <legend>Быстрый выбор</legend>
                    <div className="web-withdrawal-dialog_amountGrid__KwKhB">
                      {PRESETS.map((p) => {
                        const isSelected = selectedPreset === p.amount;
                        const isDisabled = p.amount > balance;
                        return (
                          <button
                            key={p.amount}
                            type="button"
                            className="web-withdrawal-dialog_amountCard__5B1ek"
                            data-selected={isSelected}
                            disabled={isDisabled}
                            aria-pressed={isSelected}
                            onClick={() => handlePresetSelect(p.amount)}
                          >
                            {p.top && <span className="web-withdrawal-dialog_topBadge__m_Zm8">ТОП</span>}
                            <span>{formatRub(p.amount)}</span>
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="web-withdrawal-dialog_amountCard__5B1ek"
                        data-selected={selectedPreset === balance && balance >= MIN_WITHDRAW}
                        disabled={balance < MIN_WITHDRAW}
                        aria-pressed={selectedPreset === balance}
                        onClick={() => handlePresetSelect(balance)}
                      >
                        <span>ВСЕ</span>
                      </button>
                    </div>
                  </fieldset>

                  {/* Инпут своей суммы */}
                  <label className="web-withdrawal-dialog_inputField__f9HlY" htmlFor="web-withdrawal-amount">
                    <span>Своя сумма</span>
                    <span
                      className="web-withdrawal-dialog_inputShell__Yfvf_"
                      data-invalid={Boolean(amountError)}
                    >
                      <input
                        id="web-withdrawal-amount"
                        aria-label="Своя сумма"
                        inputMode="numeric"
                        autoComplete="off"
                        placeholder="Минимум 10 000"
                        value={custom}
                        onChange={(e) => handleCustomChange(e.target.value)}
                      />
                      <b aria-hidden="true">₽</b>
                    </span>
                  </label>
                  {amountError ? (
                    <p className="web-withdrawal-dialog_errorCopy__EWUmT">{amountError}</p>
                  ) : (
                    <p className="web-withdrawal-dialog_helperCopy__8mcqf">Минимальная сумма — 10 000 ₽</p>
                  )}

                  <button
                    type="button"
                    className="web-withdrawal-dialog_primaryAction__WKFih"
                    disabled={!amountValid}
                    onClick={continueFromAmount}
                  >
                    <span>Выбрать способ</span>
                    <ArrowRight />
                  </button>
                </section>
              )}

              {/* ШАГ 2: ВЫБОР СПОСОБА */}
              {step === 'method' && (
                <section
                  className="web-withdrawal-dialog_stateBody__ypEcn"
                  aria-labelledby="web-withdrawal-title"
                >
                  <header className="web-withdrawal-dialog_stateHeader__q8V2O">
                    <span className="web-withdrawal-dialog_eyebrow__tybVe">Вывод средств</span>
                    <h2 id="web-withdrawal-title">Способ вывода</h2>
                    <p id="web-withdrawal-description">Куда перевести {formatRub(amount)}</p>
                  </header>

                  <div className="web-withdrawal-dialog_methodList__KTLij" role="radiogroup" aria-label="Способ вывода">
                    {METHODS.map((m) => {
                      const isSelected = method === m.id;
                      const Icon = m.icon;
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className="web-withdrawal-dialog_methodCard__RDhyH"
                          data-selected={isSelected}
                          onClick={() => handleSelectMethod(m.id)}
                        >
                          <div className="web-withdrawal-dialog_methodIcon___XrTC">
                            <Icon />
                          </div>
                          <div className="web-withdrawal-dialog_methodCopy__kHj9F">
                            <strong>{m.name}</strong>
                            <small>{m.description}</small>
                          </div>
                          <span className="web-withdrawal-dialog_feeBadge__EAi94">0%</span>
                          <div className="web-withdrawal-dialog_radio__fhbft">
                            {isSelected && <Check />}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="web-withdrawal-dialog_actionRow__fCYZM">
                    <button
                      type="button"
                      className="web-withdrawal-dialog_secondaryAction__NKFT_"
                      onClick={() => goTo('amount')}
                    >
                      Назад
                    </button>
                    <button
                      type="button"
                      className="web-withdrawal-dialog_primaryAction__WKFih"
                      disabled={!method}
                      onClick={() => goTo('confirm')}
                    >
                      <span>Продолжить</span>
                      <ArrowRight />
                    </button>
                  </div>
                </section>
              )}

              {/* ШАГ 3: РЕКВИЗИТЫ И ПОДТВЕРЖДЕНИЕ */}
              {step === 'confirm' && (
                <section
                  className="web-withdrawal-dialog_stateBody__ypEcn"
                  aria-labelledby="web-withdrawal-title"
                >
                  {gateCode ? (
                    <div
                      className="web-withdrawal-dialog_requirementBody__1cUyB"
                      data-tone="waiting"
                    >
                      <header className="web-withdrawal-dialog_requirementHeader__yN_O9">
                        <div className="web-withdrawal-dialog_requirementIcon__YzU4c">
                          {gateCode === 'need_deposit' && <Zap />}
                          {gateCode === 'need_verification' && <ShieldCheck />}
                          {gateCode === 'need_premium' && <Crown />}
                        </div>
                        <span>
                          <small>Требуется действие</small>
                          <h2>
                            {gateCode === 'need_deposit' && 'Требуется пополнение'}
                            {gateCode === 'need_verification' && 'Требуется верификация'}
                            {gateCode === 'need_premium' && 'Требуется Premium'}
                          </h2>
                        </span>
                      </header>
                      <div className="web-withdrawal-dialog_authorityLine___zfsG">
                        <span>Статус</span>
                        <strong>
                          {gateCode === 'need_deposit' && 'Пополните баланс для завершения операции'}
                          {gateCode === 'need_verification' && 'Пройдите верификацию аккаунта'}
                          {gateCode === 'need_premium' && 'Активируйте подписку Premium для вывода'}
                        </strong>
                      </div>
                      <div className="web-withdrawal-dialog_requirementActions__X5de1">
                        {gateCode === 'need_deposit' && (
                          <button
                            type="button"
                            className="web-withdrawal-dialog_primaryAction__WKFih"
                            onClick={handleDepositAction}
                          >
                            Пополнить баланс
                          </button>
                        )}
                        {gateCode === 'need_verification' && (
                          <button
                            type="button"
                            className="web-withdrawal-dialog_primaryAction__WKFih"
                            onClick={() => handleGateAction('verification')}
                          >
                            Пройти верификацию (2 000 ₽)
                          </button>
                        )}
                        {gateCode === 'need_premium' && (
                          <button
                            type="button"
                            className="web-withdrawal-dialog_primaryAction__WKFih"
                            onClick={() => handleGateAction('premium')}
                          >
                            Купить Premium (2 000 ₽)
                          </button>
                        )}
                        <button
                          type="button"
                          className="web-withdrawal-dialog_secondaryAction__NKFT_"
                          onClick={() => setGateCode(null)}
                        >
                          Вернуться к реквизитам
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <header className="web-withdrawal-dialog_stateHeader__q8V2O">
                        <span className="web-withdrawal-dialog_eyebrow__tybVe">Вывод средств</span>
                        <h2 id="web-withdrawal-title">Реквизиты вывода</h2>
                        <p id="web-withdrawal-description">Укажите реквизиты и подтвердите заявку</p>
                      </header>

                      {/* Инпут реквизитов */}
                      <label className="web-withdrawal-dialog_inputField__f9HlY" htmlFor="web-withdrawal-requisites">
                        <span>{method === 'card' ? 'Номер банковской карты' : 'Номер телефона (СБП)'}</span>
                        <span
                          className="web-withdrawal-dialog_inputShell__Yfvf_"
                          data-invalid={Boolean(requisites && !requisitesValid)}
                        >
                          <input
                            id="web-withdrawal-requisites"
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
                          />
                        </span>
                        {requisites && !requisitesValid && (
                          <p className="web-withdrawal-dialog_errorCopy__EWUmT">
                            {method === 'card' ? 'Введите 16 цифр номера карты' : 'Введите корректный номер телефона'}
                          </p>
                        )}
                      </label>

                      {/* Карточка сводки */}
                      <div className="web-withdrawal-dialog_confirmCard__CHQM6">
                        <div className="web-withdrawal-dialog_confirmAmount__QPWiT">
                          <small>Сумма к получению</small>
                          <strong>{formatRub(amount)}</strong>
                        </div>
                        <div className="web-withdrawal-dialog_confirmLine__6cBuG">
                          <span>Способ получения</span>
                          <b>{method === 'card' ? 'Банковская карта' : 'СБП'}</b>
                        </div>
                        {requisitesValid && (
                          <div className="web-withdrawal-dialog_confirmLine__6cBuG">
                            <span>Реквизиты</span>
                            <b>{requisites}</b>
                          </div>
                        )}
                        <div className="web-withdrawal-dialog_confirmNotice__NZVw5">
                          <Info />
                          <span>Вывод средств обычно занимает от 5 до 15 минут</span>
                        </div>
                      </div>

                      <div className="web-withdrawal-dialog_actionRow__fCYZM">
                        <button
                          type="button"
                          className="web-withdrawal-dialog_secondaryAction__NKFT_"
                          onClick={() => goTo('method')}
                          disabled={loading}
                        >
                          Назад
                        </button>
                        <button
                          type="button"
                          className="web-withdrawal-dialog_primaryAction__WKFih"
                          disabled={!amountValid || !method || !requisitesValid || loading}
                          onClick={handleWithdraw}
                        >
                          {loading ? (
                            <>
                              <Loader2 className="web-withdrawal-dialog_spinner__NaUO7" />
                              <span>Обработка...</span>
                            </>
                          ) : (
                            <>
                              <span>Подтвердить вывод</span>
                              <ArrowRight />
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </section>
              )}

              {/* ШАГ 4: ОБРАБОТКА */}
              {step === 'processing' && (
                <div className="web-withdrawal-dialog_authorityState__ntvUe">
                  <Loader2
                    className="web-withdrawal-dialog_spinner__NaUO7"
                    style={{ width: 44, height: 44, color: '#55e4ff' }}
                  />
                  <h2>Обработка заявки...</h2>
                  <p>Проверяем параметры операции и регистрируем заявку в платёжном шлюзе.</p>
                </div>
              )}

              {/* ШАГ 5: УСПЕШНО СОЗДАНА */}
              {step === 'created' && (
                <section
                  className="web-withdrawal-dialog_stateBody__ypEcn"
                  style={{ textAlign: 'center', placeItems: 'center' }}
                >
                  <div
                    style={{
                      width: 64,
                      height: 64,
                      borderRadius: '50%',
                      background: 'rgba(53,235,171,.18)',
                      border: '1px solid rgba(53,235,171,.3)',
                      display: 'grid',
                      placeItems: 'center',
                      color: '#65efbc',
                      margin: '0 auto 12px',
                    }}
                  >
                    <Check style={{ width: 32, height: 32, strokeWidth: 3 }} />
                  </div>
                  <header className="web-withdrawal-dialog_stateHeader__q8V2O" style={{ placeItems: 'center', textAlign: 'center' }}>
                    <span className="web-withdrawal-dialog_eyebrow__tybVe">Заявка создана</span>
                    <h2>Вывод отправлен</h2>
                    <p>Заявка на {formatRub(createdAmount)} передана в обработку.</p>
                  </header>
                  <div className="web-withdrawal-dialog_confirmCard__CHQM6" style={{ width: '100%' }}>
                    <div className="web-withdrawal-dialog_confirmAmount__QPWiT">
                      <small>Сумма</small>
                      <strong>{formatRub(createdAmount)}</strong>
                    </div>
                    <div className="web-withdrawal-dialog_confirmLine__6cBuG">
                      <span>Статус</span>
                      <b style={{ color: '#5be5ff' }}>На проверке</b>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="web-withdrawal-dialog_primaryAction__WKFih"
                    onClick={onClose}
                  >
                    Готово
                  </button>
                </section>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
