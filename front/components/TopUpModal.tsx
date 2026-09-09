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
  CircleCheckBig,
  Check,
  Smartphone,
  CreditCard,
  ExternalLink,
  Loader2,
  Clock,
  AlertTriangle,
  Upload,
  Plus,
  X,
  FileText,
  ArrowRight,
} from 'lucide-react';
import { useUser } from './UserProvider';
import { paymentApi, configApi } from '@/lib/api';
import { showError } from '@/lib/toast';
import { compressToWebp } from '@/lib/imageCompress';
import { resolvePaymentError } from '@/lib/paymentErrors';

type Step = 'amount' | 'method' | 'pay';
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

  const amount = selectedPreset ?? (custom ? parseInt(custom, 10) : 0);
  const amountValid = Number.isFinite(amount) && amount >= minAmount;

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
        .then((res) => setMinAmount(Math.max(MIN_AMOUNT_FALLBACK, res.minDeposit || MIN_AMOUNT_FALLBACK)))
        .catch(() => setMinAmount(MIN_AMOUNT_FALLBACK));
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
        : '',
    );
  };

  const continueToMethod = () => {
    if (amountValid) {
      setAmountError('');
      if (!method) {
        setMethod('sbp');
      }
      setStep('method');
    } else {
      setAmountError(`Минимальная сумма — ${formatRub(minAmount)}`);
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
  const { bonus: calculatedBonus, total: calculatedTotal } = calculateDepositBonus(amount);

  const stepIndex = step === 'amount' ? 1 : step === 'method' ? 2 : 3;
  const dialogState = step === 'amount' ? 'amount' : step === 'method' ? 'method' : paid ? 'paid' : 'payment';
  const artState = step === 'amount' ? 'amount' : 'standard';

  return (
    <div
      className="web-dialog_overlay__MnStH"
      data-web-dialog-frame="web-dialog-deposit"
      data-web-dialog-size="wide"
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
        onClick={handleClose}
      />
      <section
        className="web-dialog_panel__ZC8Km"
        role="dialog"
        aria-labelledby="deposit-dialog-title"
        tabIndex={-1}
        data-web-dialog-panel="true"
        data-web-dialog-asset="deposit"
        data-web-dialog-asset-phase="ready"
        aria-modal="true"
      >
        <div className="web-dialog_chrome__jivZf" data-web-dialog-chrome="true">
          <button
            type="button"
            className="web-dialog_close__DPjMy"
            aria-label="Закрыть"
            onClick={handleClose}
          >
            <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
              <path d="m6.75 6.75 10.5 10.5m0-10.5-10.5 10.5" />
            </svg>
          </button>
        </div>
        <div className="web-dialog_scroll__AcpCy" data-web-dialog-scroll-region="true" tabIndex={0}>
          <h2 id="deposit-dialog-title" className="deposit-dialog_srOnly__ObJ3y">
            Пополнение баланса
          </h2>
          <div
            className="deposit-dialog_webLayout__71E93"
            data-deposit-dialog-family="web-v1"
            data-deposit-dialog-state={dialogState}
            data-deposit-dialog-vendor="standard"
            data-deposit-dialog-geometry="hero-functional"
          >
            {/* Left Visual Art Chamber */}
            <aside
              className="deposit-dialog_art__GqGDL"
              data-deposit-art-state={artState}
              data-w4-asset-slot="deposit-chamber-main"
              data-asset-family-id="deposit"
              aria-hidden="true"
            >
              <div className="deposit-dialog_artVisual__80gi1" data-deposit-art-mode="token">
                <picture
                  className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_cover__76Sti deposit-dialog_artChamber__sh0aY"
                  style={{ '--web-hub-asset-aspect': '960 / 480', '--web-hub-asset-position': '72% 50%' } as React.CSSProperties}
                  data-web-hub-runtime-version="v1"
                  data-web-hub-asset="deposit-chamber-wide"
                  data-asset-family-id="family-a-deposit"
                  data-web-hub-placement="deposit-dialog-chamber"
                  data-web-hub-fit="cover"
                  aria-hidden="true"
                >
                  <source
                    type="image/avif"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-chamber-wide-640w.avif 640w, /images/web-hub/v1/modals/family-a-deposit/deposit-chamber-wide-960w.avif 960w, /images/web-hub/v1/modals/family-a-deposit/deposit-chamber-wide-1440w.avif 1440w, /images/web-hub/v1/modals/family-a-deposit/deposit-chamber-wide-1920w.avif 1920w"
                    sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1100px) 43vw, 46vw"
                  />
                  <source
                    type="image/webp"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-chamber-wide-640w.webp 640w, /images/web-hub/v1/modals/family-a-deposit/deposit-chamber-wide-960w.webp 960w, /images/web-hub/v1/modals/family-a-deposit/deposit-chamber-wide-1440w.webp 1440w, /images/web-hub/v1/modals/family-a-deposit/deposit-chamber-wide-1920w.webp 1920w"
                    sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1100px) 43vw, 46vw"
                  />
                  <img
                    className="web-hub-runtime-picture_image__63vQy"
                    width={960}
                    height={480}
                    sizes="(max-width: 767px) calc(100vw - 32px), (max-width: 1100px) 43vw, 46vw"
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    src="/images/web-hub/v1/modals/family-a-deposit/deposit-chamber-wide-960w.webp"
                  />
                </picture>
                <picture
                  className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h deposit-dialog_artPlatformGlow__aGOjD"
                  style={{ '--web-hub-asset-aspect': '960 / 432', '--web-hub-asset-position': '50% 50%' } as React.CSSProperties}
                  data-web-hub-runtime-version="v1"
                  data-web-hub-asset="deposit-platform-glow"
                  data-asset-family-id="family-a-deposit"
                  data-web-hub-placement="deposit-dialog-platform"
                  data-web-hub-fit="contain"
                  aria-hidden="true"
                >
                  <source
                    type="image/avif"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-640w.avif 640w, /images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-960w.avif 960w, /images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-1440w.avif 1440w"
                    sizes="(max-width: 767px) 94vw, 42vw"
                  />
                  <source
                    type="image/webp"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-640w.webp 640w, /images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-960w.webp 960w, /images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-1440w.webp 1440w"
                    sizes="(max-width: 767px) 94vw, 42vw"
                  />
                  <img
                    className="web-hub-runtime-picture_image__63vQy"
                    width={960}
                    height={432}
                    sizes="(max-width: 767px) 94vw, 42vw"
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    src="/images/web-hub/v1/modals/family-a-deposit/deposit-platform-glow-960w.webp"
                  />
                </picture>
                <picture
                  className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h deposit-dialog_artTokenMain__lTTQh"
                  style={{ '--web-hub-asset-aspect': '640 / 640', '--web-hub-asset-position': '50% 50%' } as React.CSSProperties}
                  data-web-hub-runtime-version="v1"
                  data-web-hub-asset="deposit-token-main"
                  data-asset-family-id="family-a-deposit"
                  data-web-hub-placement="deposit-dialog-amount-token"
                  data-web-hub-fit="contain"
                  aria-hidden="true"
                >
                  <source
                    type="image/avif"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-token-main-320w.avif 320w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-main-480w.avif 480w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-main-640w.avif 640w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-main-960w.avif 960w"
                    sizes="(max-width: 767px) 32vw, 18vw"
                  />
                  <source
                    type="image/webp"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-token-main-320w.webp 320w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-main-480w.webp 480w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-main-640w.webp 640w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-main-960w.webp 960w"
                    sizes="(max-width: 767px) 32vw, 18vw"
                  />
                  <img
                    className="web-hub-runtime-picture_image__63vQy"
                    width={640}
                    height={640}
                    sizes="(max-width: 767px) 32vw, 18vw"
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    src="/images/web-hub/v1/modals/family-a-deposit/deposit-token-main-640w.webp"
                  />
                </picture>
                <picture
                  className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h deposit-dialog_artTokenFloat__fQpXz deposit-dialog_artTokenFloat01__UwzGm"
                  style={{ '--web-hub-asset-aspect': '320 / 320', '--web-hub-asset-position': '50% 50%' } as React.CSSProperties}
                  data-web-hub-runtime-version="v1"
                  data-web-hub-asset="deposit-token-floating-01"
                  data-asset-family-id="family-a-deposit"
                  data-web-hub-placement="deposit-dialog-floating-token-01"
                  data-web-hub-fit="contain"
                  aria-hidden="true"
                >
                  <source
                    type="image/avif"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-01-240w.avif 240w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-01-320w.avif 320w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-01-480w.avif 480w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-01-640w.avif 640w"
                    sizes="(max-width: 767px) 14vw, 7vw"
                  />
                  <source
                    type="image/webp"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-01-240w.webp 240w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-01-320w.webp 320w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-01-480w.webp 480w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-01-640w.webp 640w"
                    sizes="(max-width: 767px) 14vw, 7vw"
                  />
                  <img
                    className="web-hub-runtime-picture_image__63vQy"
                    width={320}
                    height={320}
                    sizes="(max-width: 767px) 14vw, 7vw"
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    src="/images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-01-320w.webp"
                  />
                </picture>
                <picture
                  className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h deposit-dialog_artTokenFloat__fQpXz deposit-dialog_artTokenFloat02__54zjD"
                  style={{ '--web-hub-asset-aspect': '320 / 320', '--web-hub-asset-position': '50% 50%' } as React.CSSProperties}
                  data-web-hub-runtime-version="v1"
                  data-web-hub-asset="deposit-token-floating-02"
                  data-asset-family-id="family-a-deposit"
                  data-web-hub-placement="deposit-dialog-floating-token-02"
                  data-web-hub-fit="contain"
                  aria-hidden="true"
                >
                  <source
                    type="image/avif"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-02-240w.avif 240w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-02-320w.avif 320w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-02-480w.avif 480w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-02-640w.avif 640w"
                    sizes="(max-width: 767px) 12vw, 6vw"
                  />
                  <source
                    type="image/webp"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-02-240w.webp 240w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-02-320w.webp 320w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-02-480w.webp 480w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-02-640w.webp 640w"
                    sizes="(max-width: 767px) 12vw, 6vw"
                  />
                  <img
                    className="web-hub-runtime-picture_image__63vQy"
                    width={320}
                    height={320}
                    sizes="(max-width: 767px) 12vw, 6vw"
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    src="/images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-02-320w.webp"
                  />
                </picture>
                <picture
                  className="web-hub-runtime-picture_picture__8Q66I web-hub-runtime-picture_contain__sVb_h deposit-dialog_artTokenFloat__fQpXz deposit-dialog_artTokenFloat03__cRrl7"
                  style={{ '--web-hub-asset-aspect': '320 / 320', '--web-hub-asset-position': '50% 50%' } as React.CSSProperties}
                  data-web-hub-runtime-version="v1"
                  data-web-hub-asset="deposit-token-floating-03"
                  data-asset-family-id="family-a-deposit"
                  data-web-hub-placement="deposit-dialog-floating-token-03"
                  data-web-hub-fit="contain"
                  aria-hidden="true"
                >
                  <source
                    type="image/avif"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-03-240w.avif 240w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-03-320w.avif 320w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-03-480w.avif 480w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-03-640w.avif 640w"
                    sizes="(max-width: 767px) 12vw, 6vw"
                  />
                  <source
                    type="image/webp"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-03-240w.webp 240w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-03-320w.webp 320w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-03-480w.webp 480w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-03-640w.webp 640w"
                    sizes="(max-width: 767px) 12vw, 6vw"
                  />
                  <img
                    className="web-hub-runtime-picture_image__63vQy"
                    width={320}
                    height={320}
                    sizes="(max-width: 767px) 12vw, 6vw"
                    alt=""
                    aria-hidden="true"
                    loading="eager"
                    decoding="async"
                    draggable={false}
                    src="/images/web-hub/v1/modals/family-a-deposit/deposit-token-floating-03-320w.webp"
                  />
                </picture>
              </div>
              <div className="deposit-dialog_artCopy__T71UW">
                <span className="deposit-dialog_artEyebrow__oLVGp">LITGAME WALLET</span>
                <strong>Новый платёж</strong>
              </div>
              <div className="deposit-dialog_signalRail__wwnaV">
                <span></span>
                <span></span>
                <span></span>
              </div>
            </aside>

            {/* Right Sheet Content */}
            <div className="deposit-dialog_webContent__sGj17">
              <div className="sheet_sheet__AwI_t" data-deposit-sheet-content="true">
                {/* Stepper */}
                <header className="sheet_header__CPbgb" data-deposit-hero-stepper="true">
                  <div className="sheet_stepper__O_74c" aria-label={`Прогресс: ${stepIndex} из 3`}>
                    <span className="sheet_stepItem__DI199">
                      <span className="sheet_stepDot__uudie" data-state={stepIndex === 1 ? 'active' : 'done'}>
                        {stepIndex > 1 ? (
                          <svg className="sheet_stepCheck__pXI9N" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          '1'
                        )}
                      </span>
                    </span>
                    <span className="sheet_stepItem__DI199">
                      <span className="sheet_stepLine___e6vl" data-state={stepIndex > 1 ? 'done' : 'future'} aria-hidden="true" />
                      <span className="sheet_stepDot__uudie" data-state={stepIndex === 2 ? 'active' : stepIndex > 2 ? 'done' : 'future'}>
                        {stepIndex > 2 ? (
                          <svg className="sheet_stepCheck__pXI9N" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          '2'
                        )}
                      </span>
                    </span>
                    <span className="sheet_stepItem__DI199">
                      <span className="sheet_stepLine___e6vl" data-state={stepIndex > 2 ? 'done' : 'future'} aria-hidden="true" />
                      <span className="sheet_stepDot__uudie" data-state={stepIndex === 3 ? (paid ? 'done' : 'active') : 'future'}>
                        {paid ? (
                          <svg className="sheet_stepCheck__pXI9N" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        ) : (
                          '3'
                        )}
                      </span>
                    </span>
                  </div>
                </header>

                {/* Step 1: Amount */}
                {step === 'amount' && (
                  <section className="sheet_stepBody__eQx2j" aria-label="Сумма пополнения" data-deposit-state-panel="true">
                    <div className="sheet_titleWrap__g_WAd" data-deposit-hero-copy="true">
                      <span data-deposit-hero-eyebrow="true">ПОПОЛНЕНИЕ БАЛАНСА</span>
                      <h2 className="sheet_title__Owcyr">Выберите сумму</h2>
                      <p className="sheet_subtitle__r_1Xw">Бонус на первое пополнение</p>
                    </div>
                    <div className="sheet_cards__cx90j" data-deposit-amount-grid="true">
                      {PRESETS.map((p, idx) => {
                        const isSelected = selectedPreset === p.amount;
                        const { bonus, total } = calculateDepositBonus(p.amount);
                        const isLast = idx === PRESETS.length - 1;
                        return (
                          <button
                            key={p.amount}
                            type="button"
                            className={`sheet_card__Za6CI ${isSelected ? 'sheet_cardOn__WaBJF' : ''} ${isLast ? 'deposit-sheet_cardLastWide' : ''}`}
                            aria-pressed={isSelected}
                            onClick={() => handlePresetSelect(p.amount)}
                          >
                            {p.popular && (
                              <span className="sheet_badge__YMlAy sheet_badgeFloat__FXCri" data-tone="popular">
                                Популярное
                              </span>
                            )}
                            <span className="deposit-sheet_cardSum__zOOs8">{formatRub(p.amount)}</span>
                            <span className="deposit-sheet_cardBonus__p0eMz">+{formatRub(bonus)} бонус</span>
                            <span className="deposit-sheet_cardTotal__FG33W">Получите {formatRub(total)}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div className="sheet_manualWrap__ff5Li" data-deposit-manual-region="true">
                      <label className="sheet_groupLabel__DPw88" htmlFor="deposit-amount">
                        Или введите свою сумму
                      </label>
                      <div className={`sheet_inputRow__1HbR6 ${amountError ? 'sheet_inputRowError__T_ZbG' : custom && amountValid ? 'sheet_inputRowOk__gfgB8' : ''}`}>
                        <input
                          id="deposit-amount"
                          className="sheet_input__Bnehz"
                          inputMode="numeric"
                          placeholder={`От ${formatRub(minAmount)}`}
                          value={custom}
                          onChange={(e) => handleCustomChange(e.target.value)}
                        />
                        <span className="sheet_inputSuffix__NBO3h" aria-hidden="true">
                          ₽
                        </span>
                        {custom && amountValid && (
                          <svg className="sheet_inputCheck__z0FeV" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      {amountError ? (
                        <p className="sheet_errorHint__yK4_H">{amountError}</p>
                      ) : custom && amountValid ? (
                        <div className="deposit-sheet_bonusCalc__xVcL9">
                          <span className="deposit-sheet_bonusCalcGain__zM3Od">
                            +{formatRub(calculateDepositBonus(amount).bonus)} бонус ({calculateDepositBonus(amount).mult}x)
                          </span>
                          <span className="deposit-sheet_bonusCalcTotal__XWcQd">
                            Получите {formatRub(calculateDepositBonus(amount).total)}
                          </span>
                        </div>
                      ) : (
                        <p className="sheet_hint__4FheE">Бонус: x2 от 2 000 ₽ · x2.5 от 5 000 ₽</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="sheet_primary__S3hcR"
                      data-deposit-primary-cta="true"
                      disabled={!amountValid}
                      onClick={continueToMethod}
                    >
                      {amountValid ? `Продолжить · ${formatRub(amount)}` : 'Выберите сумму'}
                    </button>
                  </section>
                )}

                {/* Step 2: Payment Method */}
                {step === 'method' && (
                  <section className="sheet_stepBody__eQx2j" aria-label="Способ оплаты" data-deposit-state-panel="true">
                    <div className="sheet_titleWrap__g_WAd" data-deposit-hero-copy="true">
                      <span data-deposit-hero-eyebrow="true">СПОСОБ ОПЛАТЫ</span>
                      <h2 className="sheet_title__Owcyr">Выберите способ</h2>
                      <p className="sheet_subtitle__r_1Xw">Безопасная оплата без комиссии</p>
                    </div>
                    <div className="sheet_field__ol6km" role="radiogroup" aria-label="Способ оплаты">
                      {METHODS.map((m) => {
                        const isSelected = method === m.id;
                        const Icon = m.icon;
                        return (
                          <div
                            key={m.id}
                            role="radio"
                            aria-checked={isSelected}
                            tabIndex={0}
                            className={`sheet_method__T05Re ${isSelected ? 'sheet_methodOn__5EVkD' : ''}`}
                            onClick={() => {
                              setMethod(m.id);
                              setPaymentError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                setMethod(m.id);
                                setPaymentError(null);
                              }
                            }}
                            style={{ cursor: 'pointer' }}
                          >
                            {m.badge && (
                              <span className="sheet_badge__YMlAy sheet_badgeFloatRight__eAzBU" data-tone="popular">
                                {m.badge}
                              </span>
                            )}
                            <div className="sheet_methodIcon__Ue9gU">
                              <Icon />
                            </div>
                            <div className="sheet_methodText__n_GvM">
                              <span className="sheet_methodTitle__4O774">{m.name}</span>
                              <div className="sheet_methodMeta__fVOWB">
                                <span className="sheet_methodSub__jFSUZ">{m.description}</span>
                                <span className="sheet_methodMin__lDyzP">Без комиссии · Мгновенно</span>
                              </div>
                            </div>
                            {isSelected ? (
                              <span className="sheet_radioOn__O8fS9">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round">
                                  <path d="M20 6L9 17l-5-5" />
                                </svg>
                              </span>
                            ) : (
                              <span className="sheet_radioOff__6xCLg" />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {paymentError && (
                      <div className="deposit-dialog_authorityNoticeError__l7uMb">
                        <AlertTriangle />
                        <div>
                          <strong>Ошибка: </strong>
                          {paymentError.text}
                          {paymentError.code && <span style={{ opacity: 0.7 }}> ({paymentError.code})</span>}
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
                    )}
                    <div className="sheet_row__YSxe3">
                      <button
                        type="button"
                        className="sheet_secondary__lgLiG"
                        onClick={() => setStep('amount')}
                        disabled={loading}
                      >
                        Назад
                      </button>
                      <button
                        type="button"
                        className="sheet_primary__S3hcR"
                        disabled={!method || loading}
                        onClick={handlePay}
                      >
                        {loading ? (
                          <>
                            <Loader2 className="animate-spin sheet_ctaIcon___qCLV" />
                            <span>Создание...</span>
                          </>
                        ) : (
                          `Перейти к оплате · ${formatRub(amount)}`
                        )}
                      </button>
                    </div>
                  </section>
                )}

                {/* Step 3: Payment in Progress, Receipt & Verification */}
                {step === 'pay' && (
                  paid ? (
                    <section className="sheet_stepBody__eQx2j" aria-label="Оплата завершена" data-deposit-state-panel="true">
                      <div className="sheet_paidWrap__tyICW">
                        <div className="sheet_paidIcon__J1FJU">
                          <CircleCheckBig />
                        </div>
                        <h2 className="sheet_statusOk__PtsB0">Пополнение успешно!</h2>
                        <p className="sheet_finePrint__7o6JE">
                          На ваш баланс зачислено <strong>{formatRub(calculatedTotal)}</strong> (включая бонус {formatRub(calculatedBonus)}).
                        </p>
                        <button
                          type="button"
                          className="sheet_primary__S3hcR"
                          style={{ width: '100%' }}
                          onClick={handleClose}
                        >
                          Отлично
                        </button>
                      </div>
                    </section>
                  ) : secondsLeft <= 0 ? (
                    <section className="sheet_stepBody__eQx2j" aria-label="Время истекло" data-deposit-state-panel="true">
                      <div className="deposit-sheet_expiredWrap__MJIFD">
                        <div className="deposit-sheet_expiredIcon__CjS8L">
                          <AlertTriangle />
                        </div>
                        <h3 className="deposit-sheet_expiredTitle__FIbsW">Время на оплату истекло</h3>
                        <p className="sheet_finePrint__7o6JE">Платёжная сессия завершена. Создайте новый платёж, чтобы продолжить.</p>
                        <button
                          type="button"
                          className="sheet_primary__S3hcR"
                          onClick={() => {
                            setPaymentError(null);
                            setStep('amount');
                          }}
                        >
                          Выбрать новую сумму
                        </button>
                      </div>
                    </section>
                  ) : (
                    <section className="sheet_stepBody__eQx2j" aria-label="Оплата и подтверждение" data-deposit-state-panel="true">
                      <div className="deposit-sheet_formHead__7KUMP">
                        <div className="sheet_titleWrap__g_WAd" style={{ alignItems: 'flex-start', textAlign: 'left' }}>
                          <span data-deposit-hero-eyebrow="true">ШАГ 3 ИЗ 3</span>
                          <h2 className="sheet_title__Owcyr" style={{ fontSize: '20px' }}>
                            {payStage === 'receipt' || awaitingReceipt ? 'Прикрепите чек' : 'Завершите оплату'}
                          </h2>
                        </div>
                        {activePaymentValid && (
                          <div className="deposit-sheet_timerPill__ULUvk">
                            <Clock style={{ width: '14px', height: '14px' }} />
                            <span>{formatTime(secondsLeft)}</span>
                          </div>
                        )}
                      </div>

                      {/* Details Card */}
                      <div className="sheet_detailsCard__towJH">
                        <span className="sheet_detailsKicker__bhFut">Детали платежа</span>
                        <div className="sheet_detailRow__wvw2v">
                          <span className="sheet_detailKeyMuted__CI_PR">Сумма к оплате</span>
                          <span className="sheet_detailAmount__1z5or">{formatRub(amount)}</span>
                        </div>
                        <div className="sheet_detailRow__wvw2v">
                          <span className="sheet_detailKeyMuted__CI_PR">Бонус на баланс</span>
                          <span className="sheet_detailGood__UnXe1">+{formatRub(calculatedBonus)}</span>
                        </div>
                        <div className="sheet_detailRow__wvw2v">
                          <span className="sheet_detailKeyMuted__CI_PR">Способ оплаты</span>
                          <span className="sheet_detailMethod__c7PHM">
                            {method === 'card' ? (
                              <CreditCard className="sheet_detailMethodIcon__hI_xT" />
                            ) : (
                              <Smartphone className="sheet_detailMethodIcon__hI_xT" />
                            )}
                            {methodLabel}
                          </span>
                        </div>
                        <div className="sheet_totalRow__PZaHA">
                          <div className="sheet_totalText___s9Uc">
                            <span className="sheet_totalLabel__mvr_o">Итого к зачислению</span>
                            <span className="sheet_totalAmount__PTEG1">{formatRub(calculatedTotal)}</span>
                          </div>
                          <ArrowRight className="sheet_totalArrow__CE9fR" />
                        </div>
                      </div>

                      {/* Payment Error */}
                      {paymentError && (
                        <div className="deposit-dialog_authorityNoticeError__l7uMb">
                          <AlertTriangle />
                          <div>
                            <strong>Ошибка: </strong>
                            {paymentError.text}
                            {paymentError.code && <span style={{ opacity: 0.7 }}> ({paymentError.code})</span>}
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
                      )}

                      {/* Primary CTA: Open Payment Link */}
                      {paymentLink ? (
                        <a
                          href={paymentLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="sheet_primary__S3hcR deposit-sheet_ctaBright__l00kl"
                          style={{ textDecoration: 'none' }}
                        >
                          <ExternalLink className="sheet_ctaIcon___qCLV" />
                          Открыть страницу оплаты
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={handlePay}
                          disabled={loading}
                          className="sheet_primary__S3hcR"
                        >
                          {loading ? (
                            <>
                              <Loader2 className="animate-spin sheet_ctaIcon___qCLV" />
                              <span>Создание платежа...</span>
                            </>
                          ) : (
                            'Перейти к оплате'
                          )}
                        </button>
                      )}

                      {/* Status Card */}
                      <div className="deposit-sheet_waitCard__tW3jw">
                        <Loader2 className="deposit-sheet_waitCardSpinner__QEIJu animate-spin" />
                        <div className="deposit-sheet_waitCardText__HowzB">
                          <span className="deposit-sheet_waitCardTitle__NVnmD">
                            {awaitingReceipt
                              ? 'Перевод получен — прикрепите чек'
                              : receiptSent || receiptUploadStatus === 'uploaded'
                                ? 'Чек отправлен — проверяем зачисление…'
                                : 'Ожидаем подтверждение оплаты…'}
                          </span>
                          <span className="deposit-sheet_waitCardSub__eaLD_">
                            {awaitingReceipt
                              ? 'Прикрепите скриншот или квитанцию ниже, чтобы завершить зачисление'
                              : 'Средства поступят на баланс сразу после подтверждения перевода'}
                          </span>
                        </div>
                      </div>

                      {/* Receipt Upload Dropzone */}
                      <div className="deposit-sheet_receiptBlock__PdgBw">
                        <span className="deposit-sheet_receiptTitle__IdjQL">
                          {awaitingReceipt ? 'Обязательно: прикрепите чек' : 'Подтверждение (чек или квитанция)'}
                        </span>

                        {receipts.length === 0 ? (
                          <label
                            className="deposit-sheet_dropzone__NkCfM"
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
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
                              multiple
                              className="deposit-sheet_fileInput__EumKK"
                              onChange={handleReceiptChange}
                              disabled={isUploading}
                            />
                            {isUploading ? (
                              <Loader2 className="deposit-sheet_dropSpinner__cQNtz animate-spin" />
                            ) : (
                              <Upload className="deposit-sheet_dropIcon__TzPk8" />
                            )}
                            <span className="deposit-sheet_dropMain__5ZEKc">
                              {isUploading ? 'Загрузка чека…' : 'Нажмите или перетащите чек сюда'}
                            </span>
                            <span className="deposit-sheet_dropHint__R5bjJ">
                              PNG, JPG, WEBP или PDF до 5 МБ (авто-сжатие)
                            </span>
                          </label>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            <div className="deposit-sheet_receiptRow___Sywx">
                              {receipts.map((r, index) => {
                                const isImage = r.file.type.startsWith('image/');
                                return (
                                  <div key={r.preview} className="deposit-sheet_receiptThumb__AauG_">
                                    {isImage ? (
                                      <img src={r.preview} alt={`Чек ${index + 1}`} />
                                    ) : (
                                      <div style={{ display: 'grid', placeItems: 'center', height: '100%', fontSize: '10px', padding: '4px', textAlign: 'center' }}>
                                        <FileText style={{ width: '24px', height: '24px' }} />
                                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '52px' }}>
                                          {r.file.name}
                                        </span>
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      className="deposit-sheet_receiptThumbX__TKH3u"
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
                                <label className="deposit-sheet_receiptAdd__UL11e">
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
                                    multiple
                                    className="deposit-sheet_fileInput__EumKK"
                                    onChange={handleReceiptChange}
                                    disabled={isUploading}
                                  />
                                  <Plus />
                                </label>
                              )}
                            </div>

                            {uploadError && (
                              <p className="sheet_errorHint__yK4_H">{uploadError}</p>
                            )}

                            {isUploading && (
                              <p className="deposit-sheet_countdown__uTzKM" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <Loader2 className="animate-spin" style={{ width: '14px', height: '14px' }} />
                                Загружаем квитанцию...
                              </p>
                            )}

                            {(receiptSent || receiptUploadStatus === 'uploaded') && (
                              <div className="deposit-sheet_receiptDone__jceOF">
                                <Check />
                                <span>Квитанция прикреплена к платежу</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Navigation Actions */}
                      <div className="sheet_row__YSxe3" style={{ marginTop: '8px' }}>
                        <button
                          type="button"
                          className="sheet_secondary__lgLiG"
                          onClick={() => setStep('method')}
                        >
                          Способ
                        </button>
                        <button
                          type="button"
                          className="sheet_secondaryWide__eqi4p"
                          onClick={handleIvePaid}
                        >
                          <Check className="sheet_ctaIcon___qCLV" />
                          Я оплатил
                        </button>
                      </div>
                    </section>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default TopUpModal;
