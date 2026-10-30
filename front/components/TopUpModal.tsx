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
import type { ChangeEvent, ReactNode } from 'react';
import {
  Check,
  ChevronDown,
  Smartphone,
  ExternalLink,
  Loader2,
  Clock,
  AlertTriangle,
  Upload,
  Plus,
  X,
  FileText,
} from 'lucide-react';
import { useUser } from './UserProvider';
import { LgSheet } from './ui/LgSheet';
import Image from 'next/image';
import { paymentApi, configApi } from '@/lib/api';
import { showError } from '@/lib/toast';
import { compressToWebp } from '@/lib/imageCompress';
import { resolvePaymentError } from '@/lib/paymentErrors';

type Step = 'amount' | 'pay';
type TopUpMethod = 'card' | 'sbp';

interface StoredPayment {
  paymentId: string;
  link: string;
  amount: number;
  method: TopUpMethod;
  expiresAt: number;
}

interface TopUpModalContextValue {
  openTopUp: () => void;
}

const MIN_AMOUNT_FALLBACK = 2000;
const MAX_AMOUNT_FALLBACK = 10000;
const PAYMENT_TIMEOUT_SECONDS = 9 * 60;
const MAX_RECEIPTS = 2;
const MAX_RECEIPT_SIZE = 5 * 1024 * 1024;
const STORAGE_KEY = 'topup:activePayment';

function normalizePaymentId(raw: string): string {
  const s = raw.trim();
  return s.length > 36 ? s.slice(0, 36) : s;
}

export function calculateDepositBonus(amount: number): { bonus: number; total: number; mult: number } {
  if (amount >= 5000) {
    const total = Math.round(amount * 2.5);
    return { bonus: total - amount, total, mult: 2.5 };
  }
  if (amount >= 2000) {
    const total = Math.round(amount * 2);
    return { bonus: total - amount, total, mult: 2.0 };
  }
  return { bonus: 0, total: amount, mult: 1.0 };
}

// Пороги бонуса для шкалы — те же, что в calculateDepositBonus.
const BONUS_TIERS = [
  { from: 2000, mult: 2 },
  { from: 5000, mult: 2.5 },
];

const PRESETS = [
  { amount: 2000 },
  { amount: 5000, popular: true },
  { amount: 10000 },
  { amount: 20000 },
  { amount: 50000 },
];

const METHODS: {
  id: TopUpMethod;
  name: string;
  icon: typeof Smartphone;
  badge?: string;
  description: string;
}[] = [
  {
    id: 'sbp',
    name: 'СБП',
    icon: Smartphone,
    badge: 'Без комиссии',
    description: 'Система быстрых платежей · Все банки РФ',
  },
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

export function TopUpModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { refresh } = useUser();
  const [step, setStep] = useState<Step>('amount');
  const [minAmount, setMinAmount] = useState(MIN_AMOUNT_FALLBACK);
  const [maxAmount, setMaxAmount] = useState(MAX_AMOUNT_FALLBACK);
  const [selectedPreset, setSelectedPreset] = useState<number | null>(null);
  const [custom, setCustom] = useState('');
  const [amountError, setAmountError] = useState('');
  const [method, setMethod] = useState<TopUpMethod>('sbp');
  const [loading, setLoading] = useState(false);
  const [paymentId, setPaymentId] = useState('');
  const [paymentLink, setPaymentLink] = useState('');
  const [polling, setPolling] = useState(false);
  const [paid, setPaid] = useState(false);
  const [paymentError, setPaymentError] = useState<{ text: string; code?: string } | null>(null);
  const [awaitingReceipt, setAwaitingReceipt] = useState(false);
  const [payStage, setPayStage] = useState<'payment' | 'receipt'>('payment');
  const [secondsLeft, setSecondsLeft] = useState(PAYMENT_TIMEOUT_SECONDS);
  const activePaymentRef = useRef<StoredPayment | null>(null);
  const expiryNotifiedRef = useRef(false);
  const creatingRef = useRef(false);
  const [receipts, setReceipts] = useState<{ file: File; preview: string }[]>([]);
  const [receiptSent, setReceiptSent] = useState(false);
  const [receiptUploadStatus, setReceiptUploadStatus] = useState<
    'idle' | 'uploading' | 'uploaded' | 'error'
  >('idle');
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const amount = selectedPreset ?? (custom ? parseInt(custom, 10) : 0);
  const presets = useMemo(() => PRESETS.filter((p) => p.amount <= maxAmount), [maxAmount]);
  const amountValid = Number.isFinite(amount) && amount >= minAmount && amount <= maxAmount;

  const confirmPaid = useCallback(async () => {
    for (let i = 0; i < 4; i++) {
      await refresh();
      if (i < 3) await new Promise((resolve) => setTimeout(resolve, 700));
    }
  }, [refresh]);

  const attachReceiptToPayment = useCallback(
    async (url: string): Promise<'credited' | 'pending'> => {
      if (!paymentId) return 'pending';
      const res = await paymentApi.attachReceipt(paymentId, url);
      if (res.status === 'PAID' && res.credited) {
        setPaid(true);
        setPolling(false);
        setAwaitingReceipt(false);
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {}
        }
        activePaymentRef.current = null;
        confirmPaid();
        return 'credited';
      }
      return 'pending';
    },
    [paymentId, confirmPaid],
  );

  useEffect(() => {
    if (open) {
      setStep('amount');
      setSelectedPreset(null);
      setCustom('');
      setAmountError('');
      setMethod('sbp');
      setLoading(false);
      setPaid(false);
      setPaymentError(null);
      setAwaitingReceipt(false);
      setPayStage('payment');
      setUploadedUrl(null);
      setReceipts((prev) => {
        prev.forEach((r) => URL.revokeObjectURL(r.preview));
        return [];
      });
      setReceiptSent(false);
      setReceiptUploadStatus('idle');
      setUploadError(null);

      // Try to restore active payment from memory or localStorage
      let active = activePaymentRef.current;
      if (!active || active.expiresAt <= Date.now()) {
        if (typeof window !== 'undefined') {
          try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
              const parsed = JSON.parse(raw) as StoredPayment;
              if (parsed && parsed.paymentId && parsed.link && parsed.expiresAt > Date.now()) {
                const normalizedId = normalizePaymentId(parsed.paymentId);
                if (normalizedId !== parsed.paymentId) {
                  parsed.paymentId = normalizedId;
                  try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
                  } catch {}
                }
                active = parsed;
                activePaymentRef.current = parsed;
              } else {
                localStorage.removeItem(STORAGE_KEY);
              }
            }
          } catch {}
        }
      } else if (active.paymentId.length > 36) {
        const nid = normalizePaymentId(active.paymentId);
        if (nid !== active.paymentId) {
          active.paymentId = nid;
          activePaymentRef.current = active;
          if (typeof window !== 'undefined') {
            try {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
            } catch {}
          }
        }
      }

      if (active && active.expiresAt > Date.now()) {
        setPaymentId(active.paymentId);
        setPaymentLink(active.link);
        setSecondsLeft(Math.max(0, Math.ceil((active.expiresAt - Date.now()) / 1000)));
        setPolling(true);
        setStep('pay');
        const presetMatch = PRESETS.some((p) => p.amount === active.amount);
        if (presetMatch) {
          setSelectedPreset(active.amount);
          setCustom('');
        } else {
          setSelectedPreset(null);
          setCustom(String(active.amount));
        }
        setMethod(active.method);

        const statusId = active.paymentId;
        paymentApi
          .status(statusId)
          .catch((e: unknown) => {
            const err = e as { status?: number };
            if (err?.status === 404 && statusId.length > 36) {
              const short = normalizePaymentId(statusId);
              return paymentApi.status(short).then((res) => {
                active!.paymentId = short;
                activePaymentRef.current = active;
                setPaymentId(short);
                if (typeof window !== 'undefined') {
                  try {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
                  } catch {}
                }
                return res;
              });
            }
            throw e;
          })
          .then((res) => {
            if (res.status === 'AWAITING_RECEIPT') {
              setAwaitingReceipt(true);
              setPayStage('receipt');
              setStep('pay');
            } else if (res.status === 'PAID' && res.credited) {
              setPaid(true);
              setPolling(false);
              setStep('pay');
              activePaymentRef.current = null;
              if (typeof window !== 'undefined') {
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch {}
              }
              confirmPaid();
            } else if (TERMINAL_FAILURE.has(res.status)) {
              setPolling(false);
              activePaymentRef.current = null;
              if (typeof window !== 'undefined') {
                try {
                  localStorage.removeItem(STORAGE_KEY);
                } catch {}
              }
            }
          })
          .catch(() => {});
      } else {
        setPaymentId('');
        setPaymentLink('');
        setPolling(false);
        setSecondsLeft(PAYMENT_TIMEOUT_SECONDS);
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem(STORAGE_KEY);
          } catch {}
        }
        activePaymentRef.current = null;
      }

      configApi
        .get()
        .then((res) => {
          setMinAmount(Math.max(MIN_AMOUNT_FALLBACK, res.minDeposit || MIN_AMOUNT_FALLBACK));
          setMaxAmount(res.maxDeposit && res.maxDeposit > 0 ? res.maxDeposit : MAX_AMOUNT_FALLBACK);
        })
        .catch(() => {
          setMinAmount(MIN_AMOUNT_FALLBACK);
          setMaxAmount(MAX_AMOUNT_FALLBACK);
        });
    }
  }, [open, confirmPaid]);

  useEffect(() => {
    if (
      !open ||
      step !== 'pay' ||
      !paymentId ||
      paid ||
      awaitingReceipt ||
      payStage === 'receipt' ||
      receiptSent
    )
      return;

    const tick = () => {
      const active = activePaymentRef.current;
      if (!active || active.paymentId !== paymentId) return;
      const remaining = Math.max(0, Math.ceil((active.expiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        setPolling(false);
        if (!expiryNotifiedRef.current) {
          expiryNotifiedRef.current = true;
          setPaymentError({
            text: 'Время на оплату истекло. Создайте новый платёж.',
            code: 'EXPIRED',
          });
        }
      }
    };

    tick();
    const interval = setInterval(tick, 1000);

    return () => clearInterval(interval);
  }, [open, step, paymentId, paid, awaitingReceipt, payStage, receiptSent]);

  useEffect(() => {
    if (!open || !paymentId || paid || !polling) return;

    const interval = setInterval(async () => {
      try {
        const res = await paymentApi.status(paymentId);
        if (res.status === 'PAID' && res.credited) {
          setPaid(true);
          setPolling(false);
          activePaymentRef.current = null;
          setAwaitingReceipt(false);
          if (typeof window !== 'undefined') {
            try {
              localStorage.removeItem(STORAGE_KEY);
            } catch {}
          }
          confirmPaid();
        } else if (res.status === 'AWAITING_RECEIPT') {
          setAwaitingReceipt(true);
          setPayStage('receipt');
          setStep('pay');
          if (uploadedUrl) {
            try {
              await attachReceiptToPayment(uploadedUrl);
            } catch (err) {
              console.error('[TopUp] attachReceipt retry failed:', err);
            }
          }
        } else if (TERMINAL_FAILURE.has(res.status)) {
          setPolling(false);
          activePaymentRef.current = null;
          const mapped = resolvePaymentError({ message: res.status } as unknown as Error);
          setPaymentError({
            text: mapped.text !== res.status ? mapped.text : 'Платёж не был завершён. Попробуйте ещё раз.',
            code: res.status,
          });
        }
      } catch {
        // Keep polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [open, paymentId, paid, polling, confirmPaid, uploadedUrl, attachReceiptToPayment]);

  const activePayment = activePaymentRef.current;
  const activePaymentValid =
    !!activePayment &&
    activePayment.amount === amount &&
    activePayment.method === method &&
    activePayment.expiresAt > Date.now();

  const handlePay = async () => {
    if (!amountValid || !method || loading || creatingRef.current) return;
    if (activePaymentValid) {
      setStep('pay');
      return;
    }
    creatingRef.current = true;
    setLoading(true);
    setPaymentError(null);
    try {
      const res = await paymentApi.create(amount, method);
      const canonicalId = normalizePaymentId(res.paymentId);
      const stored: StoredPayment = {
        paymentId: canonicalId,
        link: res.link,
        amount,
        method,
        expiresAt: Date.now() + PAYMENT_TIMEOUT_SECONDS * 1000,
      };
      activePaymentRef.current = stored;
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));
        } catch {}
      }
      expiryNotifiedRef.current = false;
      setPaymentId(canonicalId);
      setPaymentLink(res.link);
      setPayStage('payment');
      setSecondsLeft(PAYMENT_TIMEOUT_SECONDS);
      setPolling(true);
      setStep('pay');
    } catch (err) {
      const { text, code } = resolvePaymentError(err);
      setPaymentError({ text, code });
    } finally {
      creatingRef.current = false;
      setLoading(false);
    }
  };

  const handleIvePaid = () => {
    setPayStage('receipt');
  };

  const uploadReceiptFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0 || isUploading || receiptSent) return;
      if (!paymentId) return;
      setIsUploading(true);
      setReceiptUploadStatus('uploading');
      setUploadError(null);
      try {
        const publicUrls: string[] = [];
        for (const file of files) {
          const toUpload = file.type.startsWith('image/') ? await compressToWebp(file) : file;
          const presign = await paymentApi.presignReceipt(paymentId, {
            filename: toUpload.name,
            contentType: toUpload.type,
            size: toUpload.size,
          });
          const putRes = await fetch(presign.url, {
            method: 'PUT',
            body: toUpload,
            headers: { 'Content-Type': toUpload.type },
          });
          if (!putRes.ok) {
            throw new Error(`S3 upload failed: ${putRes.status}`);
          }
          publicUrls.push(presign.publicUrl);
        }
        const url = publicUrls[0];
        if (!url) {
          const message = 'Не удалось получить ссылку на чек. Попробуйте ещё раз.';
          setReceiptUploadStatus('error');
          setUploadError(message);
          showError(message);
          return;
        }
        setUploadedUrl(url);
        const result = await attachReceiptToPayment(url);
        if (result === 'credited') {
          setReceiptUploadStatus('uploaded');
          return;
        }
        setReceiptUploadStatus('uploaded');
        setReceiptSent(true);
      } catch (err) {
        console.error('[TopUp] receipt upload failed:', err);
        const message = 'Не удалось загрузить файл. Попробуйте ещё раз.';
        setReceiptUploadStatus('error');
        setUploadError(message);
        showError(message);
      } finally {
        setIsUploading(false);
      }
    },
    [isUploading, receiptSent, paymentId, attachReceiptToPayment],
  );

  const handleReceiptFiles = (files: File[]) => {
    if (files.length === 0) return;
    const allowed = new Set([
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
    ]);
    const invalid = files.some(
      (file) => !allowed.has(file.type.toLowerCase()) || file.size > MAX_RECEIPT_SIZE,
    );
    if (invalid) {
      showError('Поддерживаются изображения PNG, JPG, WEBP и документы PDF, DOC, XLS до 5 МБ');
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
    setReceiptUploadStatus('idle');
    setUploadError(null);

    void uploadReceiptFiles(accepted);
  };

  const handleReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    handleReceiptFiles(files);
  };

  const handleRemoveReceipt = (preview: string) => {
    setReceipts((prev) => prev.filter((r) => r.preview !== preview));
    URL.revokeObjectURL(preview);
    setReceiptSent(false);
    setReceiptUploadStatus('idle');
  };

  const autoUploadAttemptedRef = useRef('');
  useEffect(() => {
    if (!paymentId || receiptSent || receipts.length === 0) return;
    const signature = `${paymentId}:${receipts.map((r) => r.preview).join(',')}`;
    if (autoUploadAttemptedRef.current === signature) return;
    autoUploadAttemptedRef.current = signature;
    void uploadReceiptFiles(receipts.map((r) => r.file));
  }, [paymentId, receiptSent, receipts, uploadReceiptFiles]);

  const handlePresetSelect = (presetAmount: number) => {
    setSelectedPreset(presetAmount);
    setCustom('');
    setAmountError('');
    setPaymentError(null);
  };

  const handleCustomChange = (value: string) => {
    setCustom(value);
    setSelectedPreset(null);
    setPaymentError(null);
    if (value === '') {
      setAmountError('');
      return;
    }
    const parsed = parseInt(value, 10);
    setAmountError(
      Number.isFinite(parsed) && parsed < minAmount
        ? `Минимальная сумма — ${formatRub(minAmount)}`
        : Number.isFinite(parsed) && parsed > maxAmount
          ? `Максимальная сумма — ${formatRub(maxAmount)}`
          : '',
    );
  };

  // Шаг «Способ» склеен с шагом суммы: способ выбирается строкой под суммой,
  // кнопка сразу создаёт платёж (те же проверки суммы, что были перед шагом способа).
  const continueToPay = () => {
    if (amountValid) {
      setAmountError('');
      if (!method) {
        setMethod('sbp');
      }
      void handlePay();
    } else {
      setAmountError(
        amount > maxAmount
          ? `Максимальная сумма — ${formatRub(maxAmount)}`
          : `Минимальная сумма — ${formatRub(minAmount)}`,
      );
    }
  };

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Lock body scroll when open
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
      if (event.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, handleClose]);

  if (!open) return null;

  const methodLabel = method === 'card' ? 'Банковская карта' : 'СБП';
  const { bonus: calculatedBonus, total: calculatedTotal, mult: calculatedMult } = calculateDepositBonus(amount);
  const amountInputValue = selectedPreset !== null ? String(selectedPreset) : custom;
  const amountInputShown = amountInputValue ? Number(amountInputValue).toLocaleString('ru-RU') : '';
  const receiptStage = payStage === 'receipt' || awaitingReceipt;
  const expired = step === 'pay' && !paid && secondsLeft <= 0;
  const selectedMethod = METHODS.find((m) => m.id === method) ?? METHODS[0];
  const MethodIcon = selectedMethod.icon;

  const errorNotice = paymentError && (
    <div className="ls-error" role="alert">
      <AlertTriangle />
      <div>
        <strong>Ошибка: </strong>
        {paymentError.text}
        {paymentError.code && <small> ({paymentError.code})</small>}
      </div>
      <button
        type="button"
        onClick={() => {
          setPaymentError(null);
          void handlePay();
        }}
        disabled={loading}
      >
        Повторить
      </button>
    </div>
  );

  const title =
    step === 'amount' ? 'Пополнение'
    : paid ? 'Пополнение'
    : expired ? 'Время истекло'
    : receiptStage ? 'Прикрепите чек'
    : 'Оплата';

  let footer: ReactNode;
  if (step === 'amount') {
    footer = (
      <button
        type="button"
        className="pg-btn pg-btn-acc"
       
        disabled={!amountValid || loading}
        onClick={continueToPay}
      >
        {loading ? (
          <>
            <Loader2 className="ls-spin" />
            Создание...
          </>
        ) : amountValid ? (
          `Перейти к оплате · ${formatRub(amount)}`
        ) : (
          'Выберите сумму'
        )}
      </button>
    );
  } else if (paid) {
    footer = (
      <button type="button" className="pg-btn pg-btn-acc" onClick={handleClose}>
        Отлично
      </button>
    );
  } else if (expired) {
    footer = (
      <button
        type="button"
        className="pg-btn pg-btn-acc"
        onClick={() => {
          setPaymentError(null);
          setStep('amount');
        }}
      >
        Выбрать новую сумму
      </button>
    );
  } else {
    footer = (
      <button type="button" className="pg-btn pg-btn-sec" onClick={handleIvePaid}>
        <Check />
        Я оплатил
      </button>
    );
  }

  const fileInput = (
    <input
      type="file"
      accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
      multiple
      className="ls-file"
      onChange={handleReceiptChange}
      disabled={isUploading}
    />
  );

  return (
    <LgSheet
      titleId="deposit-dialog-title"
      title={title}
      progress={paid || expired ? null : { step: step === 'amount' ? 1 : 2, total: 2 }}
      onBack={step === 'pay' && !paid && !expired ? () => setStep('amount') : null}
      onClose={handleClose}
      footer={footer}
      state={step === 'amount' ? 'amount' : paid ? 'paid' : expired ? 'expired' : 'payment'}
    >
      {/* Шаг 1: сумма и способ */}
      {step === 'amount' && (
        <>
          <label className="ls-lbl" htmlFor="deposit-amount">
            Сумма пополнения
          </label>
          <label className="ls-amt" htmlFor="deposit-amount">
            <span className="ls-amt-fit" data-value={amountInputShown || '0'}>
              <input
                id="deposit-amount"
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
          <p className="ls-sub" data-error={Boolean(amountError)}>
            {amountError || `От ${formatRub(minAmount)} до ${formatRub(maxAmount)} · можно ввести свою сумму`}
          </p>

          <div className="ls-chips" role="group" aria-label="Быстрый выбор">
            {presets.map((p) => {
              const isSelected = selectedPreset === p.amount;
              const { bonus } = calculateDepositBonus(p.amount);
              return (
                <button
                  key={p.amount}
                  type="button"
                  className="ls-chip"
                  data-on={isSelected}
                  aria-pressed={isSelected}
                  onClick={() => handlePresetSelect(p.amount)}
                >
                  {p.popular && <small>Популярное</small>}
                  <b>{formatRub(p.amount)}</b>
                  {bonus > 0 && <em>+{bonus.toLocaleString('ru-RU')} бонус</em>}
                </button>
              );
            })}
          </div>

          <div className="ls-bonus">
            <div className="ls-bonus-top">
              <Image src="/lg/img/token.webp" alt="" width={52} height={52} />
              <div>
                <small>{calculatedBonus > 0 ? `Бонус x${calculatedMult}` : 'Бонус на пополнение'}</small>
                {calculatedBonus > 0 ? (
                  <b>+{formatRub(calculatedBonus)}</b>
                ) : (
                  <b data-empty="true">до x2.5 к сумме</b>
                )}
              </div>
              {amountValid && (
                <strong>
                  На баланс
                  <span>{formatRub(calculatedTotal)}</span>
                </strong>
              )}
            </div>
            <div className="ls-tiers" aria-hidden="true">
              {BONUS_TIERS.map((t) => (
                <i key={t.from} data-on={amountValid && amount >= t.from} />
              ))}
            </div>
            <div className="ls-tiers-l">
              {BONUS_TIERS.map((t, i) => {
                const next = BONUS_TIERS[i + 1];
                const current = amountValid && amount >= t.from && (!next || amount < next.from);
                return (
                  <span key={t.from} data-on={current}>
                    x{t.mult} · от {formatRub(t.from)}
                  </span>
                );
              })}
            </div>
          </div>

          <div role="radiogroup" aria-label="Способ оплаты">
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
                  onClick={() => {
                    setMethod(m.id);
                    setPaymentError(null);
                  }}
                >
                  <span className="ls-method-ic">
                    <Icon />
                  </span>
                  <span className="ls-method-tx">
                    <b>{m.name}</b>
                    <span>
                      {m.description}
                      {m.badge ? ` · ${m.badge.toLowerCase()}` : ''}
                    </span>
                  </span>
                  <span className="ls-radio" data-on={isSelected}>
                    {isSelected && <Check />}
                  </span>
                </button>
              );
            })}
          </div>

          {errorNotice}
        </>
      )}

      {/* Оплата завершена */}
      {step === 'pay' && paid && (
        <>
          <div className="ls-res">
            <Image src="/lg/img/status-ok.webp" alt="" width={150} height={150} />
            <h3>Пополнение успешно!</h3>
            <p>
              На ваш баланс зачислено {formatRub(calculatedTotal)} (включая бонус {formatRub(calculatedBonus)}).
            </p>
            <strong>+{formatRub(calculatedTotal)}</strong>
          </div>
          <div className="ls-kv">
            <div>
              Оплачено<b>{formatRub(amount)}</b>
            </div>
            {calculatedBonus > 0 && (
              <div>
                Бонус x{calculatedMult}
                <b data-tone="pos">+{formatRub(calculatedBonus)}</b>
              </div>
            )}
            <div>
              Способ<b>{methodLabel}</b>
            </div>
          </div>
        </>
      )}

      {/* Время истекло */}
      {expired && (
        <div className="ls-res" style={{ paddingBottom: 12 }}>
          <Image src="/lg/img/status-hourglass.webp" alt="" width={150} height={150} />
          <h3>Время на оплату истекло</h3>
          <p>Платёжная сессия завершена. Создайте новый платёж, чтобы продолжить.</p>
        </div>
      )}

      {/* Шаг 2: оплата и чек */}
      {step === 'pay' && !paid && !expired && (
        <>
          {activePaymentValid && (
            <div className="ls-timer">
              Время на оплату
              <b>
                <Clock />
                {formatTime(secondsLeft)}
              </b>
            </div>
          )}

          <div className="ls-sum" data-open={detailsOpen}>
            <button
              type="button"
              className="ls-sum-row"
              aria-expanded={detailsOpen}
              onClick={() => setDetailsOpen((v) => !v)}
            >
              <span>
                <small>Оплачиваете</small>
                <b>{formatRub(amount)}</b>
              </span>
              <i aria-hidden="true">→</i>
              <span>
                <small>На баланс</small>
                <b data-tone="pos">{formatRub(calculatedTotal)}</b>
              </span>
              <em>
                Детали
                <ChevronDown />
              </em>
            </button>
            {detailsOpen && (
              <div className="ls-kv">
                <div>
                  Сумма к оплате<b>{formatRub(amount)}</b>
                </div>
                <div>
                  Бонус на баланс<b data-tone="pos">+{formatRub(calculatedBonus)}</b>
                </div>
                <div>
                  Способ оплаты<b>{methodLabel}</b>
                </div>
                <div>
                  Итого к зачислению<b>{formatRub(calculatedTotal)}</b>
                </div>
              </div>
            )}
          </div>

          {errorNotice}

          <div className="ls-card">
            <div className="ls-step-h">
              <span className="ls-num" data-state={receiptStage ? 'done' : 'current'}>
                {receiptStage ? <Check /> : '1'}
              </span>
              <div>
                <b>Оплатите по {methodLabel}</b>
                <span>Страница оплаты откроется в новой вкладке</span>
              </div>
              <Image src="/lg/img/status-phone.webp" alt="" width={54} height={54} />
            </div>
            {paymentLink ? (
              <a
                href={paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className={`pg-btn ${receiptStage ? 'pg-btn-sec' : 'pg-btn-acc'}`}
              >
                <ExternalLink />
                Открыть страницу оплаты
              </a>
            ) : (
              <button type="button" onClick={handlePay} disabled={loading} className="pg-btn pg-btn-acc">
                {loading ? (
                  <>
                    <Loader2 className="ls-spin" />
                    Создание платежа...
                  </>
                ) : (
                  <>
                    <MethodIcon />
                    Перейти к оплате
                  </>
                )}
              </button>
            )}
          </div>

          <div className="ls-wait">
            <Loader2 className="ls-spin" />
            <div>
              <b>
                {awaitingReceipt
                  ? 'Перевод получен — прикрепите чек'
                  : receiptSent || receiptUploadStatus === 'uploaded'
                    ? 'Чек отправлен — проверяем зачисление…'
                    : 'Ожидаем подтверждение оплаты…'}
              </b>
              <span>
                {awaitingReceipt
                  ? 'Прикрепите скриншот или квитанцию ниже, чтобы завершить зачисление'
                  : 'Средства поступят на баланс сразу после подтверждения перевода'}
              </span>
            </div>
          </div>

          <div className="ls-card">
            <div className="ls-step-h">
              <span className="ls-num" data-state={receiptStage ? 'current' : 'next'}>
                2
              </span>
              <div>
                <b>{awaitingReceipt ? 'Обязательно: прикрепите чек' : 'Прикрепите чек'}</b>
                <span>Подтверждение (чек или квитанция)</span>
              </div>
              <Image src="/lg/img/status-receipt.webp" alt="" width={54} height={54} />
            </div>

            {receipts.length === 0 ? (
              <label
                className="ls-drop"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  const files = Array.from(e.dataTransfer.files || []);
                  handleReceiptFiles(files);
                }}
              >
                {fileInput}
                {isUploading ? <Loader2 className="ls-spin" /> : <Upload />}
                {isUploading ? 'Загрузка чека…' : 'Нажмите или перетащите чек сюда'}
                <small>PNG, JPG, WEBP или PDF до 5 МБ (авто-сжатие)</small>
              </label>
            ) : (
              <>
                <div className="ls-thumbs">
                  {receipts.map((r, index) => {
                    const isImage = r.file.type.startsWith('image/');
                    return (
                      <div key={r.preview} className="ls-thumb">
                        {isImage ? (
                          <img src={r.preview} alt={`Чек ${index + 1}`} />
                        ) : (
                          <div>
                            <FileText />
                            <span>{r.file.name}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveReceipt(r.preview)}
                          disabled={isUploading}
                          aria-label="Удалить"
                        >
                          <X />
                        </button>
                      </div>
                    );
                  })}
                  {receipts.length < MAX_RECEIPTS && (
                    <label className="ls-thumb-add" aria-label="Добавить чек">
                      {fileInput}
                      <Plus />
                    </label>
                  )}
                </div>

                {uploadError && (
                  <p className="ls-sub" data-error="true" style={{ marginTop: 8 }}>
                    {uploadError}
                  </p>
                )}

                {isUploading && (
                  <p className="ls-sub" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <Loader2 className="ls-spin" style={{ width: 14, height: 14 }} />
                    Загружаем квитанцию...
                  </p>
                )}

                {(receiptSent || receiptUploadStatus === 'uploaded') && (
                  <div className="ls-done">
                    <Check />
                    <span>Квитанция прикреплена к платежу</span>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </LgSheet>
  );
}

export default TopUpModal;
