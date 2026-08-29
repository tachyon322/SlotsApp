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
  Crown,
  Loader2,
  ShieldCheck,
  Smartphone,
  ExternalLink,
  Coins,
  Check,
  AlertTriangle,
  Upload,
  Plus,
  X,
  FileText,
} from 'lucide-react';
import { paymentApi, type PaymentPurpose } from '@/lib/api';
import { ModalShell } from './ModalShell';
import { resolvePaymentError } from '@/lib/paymentErrors';
import { showError } from '@/lib/toast';
import { compressToWebp } from '@/lib/imageCompress';

const GATE_AMOUNT = 2000;
const TERMINAL_FAILURE = new Set(['EXPIRED', 'CANCELED', 'FAILED']);
const MAX_RECEIPTS = 2;
const MAX_RECEIPT_SIZE = 5 * 1024 * 1024;

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
    subtitle: 'Оплатите реальным платежом через СБП 2000₽ для верификации реквизитов. Сумма не списывается с игрового баланса и не зачисляется на него',
    itemLabel: 'Верификация реквизитов',
    successTitle: 'Оплата принята!',
    successText: 'Теперь вы можете создать заявку на вывод',
  },
  premium: {
    icon: Crown,
    accent: 'text-amber-400',
    gradient: 'from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700',
    title: 'Премиум подписка',
    subtitle: 'Приоритетный статус заявки на вывод: автоматический вывод без ожидания',
    itemLabel: 'Премиум (бессрочно)',
    successTitle: 'Премиум активирован!',
    successText: 'Ваша заявка получила приоритетный статус',
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
  const [paymentId, setPaymentId] = useState('');
  const [paymentLink, setPaymentLink] = useState('');
  const [polling, setPolling] = useState(false);
  const [paid, setPaid] = useState(false);
  const creatingRef = useRef(false);
  const [paymentError, setPaymentError] = useState<{ text: string; code?: string } | null>(null);

  const [payStage, setPayStage] = useState<'payment' | 'receipt'>('payment');
  const [receipts, setReceipts] = useState<{ file: File; preview: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [awaitingReceipt, setAwaitingReceipt] = useState(false);
  const [receiptUploadStatus, setReceiptUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep('pay');
      setMethod('sbp');
      setLoading(false);
      setPaymentId('');
      setPaymentLink('');
      setPolling(false);
      setPaid(false);
      setPaymentError(null);
      setPayStage('payment');
      setReceipts((prev) => {
        prev.forEach((r) => URL.revokeObjectURL(r.preview));
        return [];
      });
      setReceiptSent(false);
      setUploadedUrl(null);
      setAwaitingReceipt(false);
      setReceiptUploadStatus('idle');
      setUploadError(null);
      setIsUploading(false);
    }
  }, [open]);

  const attachReceiptToPayment = useCallback(
    async (url: string): Promise<'credited' | 'pending'> => {
      if (!paymentId) return 'pending';
      const res = await paymentApi.attachReceipt(paymentId, url);
      if (res.status === 'PAID' && res.credited) {
        setPaid(true);
        setPolling(false);
        setAwaitingReceipt(false);
        setStep('success');
        return 'credited';
      }
      return 'pending';
    },
    [paymentId],
  );

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
        console.error('[Gate] receipt upload failed:', err);
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

  const handleReceiptChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
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

  const handleIvePaid = () => {
    setPayStage('receipt');
  };

  useEffect(() => {
    if (!open || !paymentId || paid || !polling) return;

    const interval = setInterval(async () => {
      try {
        const res = await paymentApi.status(paymentId);
        if (res.status === 'PAID' && res.credited) {
          setPaid(true);
          setPolling(false);
          setAwaitingReceipt(false);
          setStep('success');
        } else if (res.status === 'AWAITING_RECEIPT') {
          setAwaitingReceipt(true);
          setPayStage('receipt');
          if (uploadedUrl) {
            try {
              await attachReceiptToPayment(uploadedUrl);
            } catch (err) {
              console.error('[Gate] attachReceipt retry failed:', err);
            }
          }
        } else if (TERMINAL_FAILURE.has(res.status)) {
          setPolling(false);
          setPaymentId('');
          setPaymentLink('');
          const mapped = resolvePaymentError({ message: res.status } as unknown as Error);
          setPaymentError({
            text: mapped.text !== res.status ? mapped.text : 'Платёж не был завершён. Попробуйте ещё раз.',
            code: res.status,
          });
        }
      } catch {
        // Keep polling; the network may be temporarily unavailable
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [open, paymentId, paid, polling, uploadedUrl, attachReceiptToPayment]);

  const handlePay = async () => {
    if (loading || paymentId || creatingRef.current) return;
    creatingRef.current = true;
    setLoading(true);
    setPaymentError(null);
    try {
      const res = await paymentApi.create(GATE_AMOUNT, method, purpose);
      setPaymentId(res.paymentId);
      setPaymentLink(res.link);
      setPolling(true);
    } catch (err) {
      const { text, code } = resolvePaymentError(err);
      setPaymentError({ text, code });
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
    setPaymentError(null);
    setStep('pay');
    setPayStage('payment');
    setReceipts((prev) => {
      prev.forEach((r) => URL.revokeObjectURL(r.preview));
      return [];
    });
    setReceiptSent(false);
    setUploadedUrl(null);
    setAwaitingReceipt(false);
    setReceiptUploadStatus('idle');
    setUploadError(null);
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

        {payStage === 'receipt' ? (
          <div className="space-y-md animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
            <div className="text-center space-y-1">
              <h3 className="text-lg font-bold text-white">{awaitingReceipt ? 'Перевод получен' : 'Прикрепите чек'}</h3>
              <p className="text-sm text-zinc-400">
                {awaitingReceipt
                  ? 'Перевод получен. Прикрепите чек, чтобы завершить оплату'
                  : 'После оплаты прикрепите скриншот чека — без него платёж не подтвердится'}
              </p>
            </div>

            <div className={`bg-zinc-900 rounded-card border p-card-lg ${awaitingReceipt ? 'border-emerald-500' : 'border-zinc-800'}`}>
              <p className="text-sm font-semibold text-zinc-300 mb-sm">
                {awaitingReceipt ? 'Прикрепите чек — без него платёж не будет подтверждён' : 'Прикрепите чек об оплате'}
              </p>

              {receipts.length === 0 ? (
                <label className="flex flex-col items-center justify-center gap-2xs border-2 border-dashed border-zinc-700 hover:border-zinc-600 rounded-panel py-lg cursor-pointer transition-colors">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
                    multiple
                    className="sr-only"
                    onChange={handleReceiptChange}
                    disabled={isUploading}
                  />
                  <Upload className="w-6 h-6 text-zinc-500" />
                  <span className="text-sm font-medium text-zinc-300">Нажмите, чтобы прикрепить файл</span>
                  <span className="text-xs text-zinc-500">PNG, JPG, WEBP, PDF, DOC до 5 МБ (авто-сжатие фото)</span>
                </label>
              ) : (
                <div className="flex gap-sm flex-wrap">
                  {receipts.map((r, index) => {
                    const isImage = r.file.type.startsWith('image/');
                    return (
                      <div
                        key={r.preview}
                        className="relative w-24 h-24 rounded-panel overflow-hidden border border-zinc-700 bg-zinc-800 flex flex-col items-center justify-center p-1"
                      >
                        {isImage ? (
                          <img src={r.preview} alt={`Чек ${index + 1}`} className="w-full h-full object-cover absolute inset-0" />
                        ) : (
                          <>
                            <FileText className="w-8 h-8 text-zinc-400" />
                            <span className="text-[10px] text-zinc-300 truncate w-full text-center mt-1 px-1">{r.file.name}</span>
                          </>
                        )}
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
                    );
                  })}
                  {receipts.length < MAX_RECEIPTS && (
                    <label className="w-24 h-24 rounded-panel border-2 border-dashed border-zinc-700 hover:border-zinc-600 flex items-center justify-center cursor-pointer transition-colors">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,application/pdf,.pdf,.doc,.docx,.xls,.xlsx"
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

              <p className="text-xs text-zinc-600 mt-sm">Поддерживаются скриншоты и документы (PDF, DOC, XLS). До двух файлов.</p>

              {receiptUploadStatus === 'uploading' && (
                <p className="text-xs text-zinc-400 flex items-center gap-1 mt-sm">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Загрузка чека…
                </p>
              )}
              {receiptUploadStatus === 'uploaded' && (
                <p className="text-xs text-emerald-400 flex items-center gap-1 mt-sm">
                  <Check className="w-3.5 h-3.5" />
                  Чек загружен
                </p>
              )}
              {receiptUploadStatus === 'error' && uploadError && <p className="text-xs text-red-400 mt-sm">{uploadError}</p>}
            </div>

            {paymentLink && (
              <a
                href={paymentLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700"
              >
                <ExternalLink className="w-4 h-4" />
                Открыть страницу оплаты
              </a>
            )}

            <div className="flex items-center gap-sm rounded-panel bg-zinc-900 border border-zinc-800 p-md">
              <Loader2 className="w-5 h-5 text-emerald-400 animate-spin shrink-0" />
              <div>
                <p className="text-sm font-semibold text-zinc-200">
                  {awaitingReceipt
                    ? receiptUploadStatus === 'uploading'
                      ? 'Загружаем чек…'
                      : receiptSent || receiptUploadStatus === 'uploaded'
                        ? 'Чек отправлен, ожидаем подтверждения…'
                        : 'Перевод получен — прикрепите чек'
                    : receiptUploadStatus === 'uploading'
                      ? 'Загружаем чек…'
                      : receiptSent || receiptUploadStatus === 'uploaded'
                        ? 'Чек отправлен, ожидаем подтверждения…'
                        : 'Ожидаем подтверждение оплаты…'}
                </p>
                <p className="text-xs text-zinc-500">Средства не зачислятся без прикреплённого чека</p>
              </div>
            </div>

            <button
              onClick={resetPayment}
              disabled={isUploading}
              className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700 disabled:opacity-50"
            >
              Начать заново
            </button>
          </div>
        ) : (
          <>
            <div className="bg-zinc-900 rounded-card p-card-lg border border-zinc-800">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-xs">
                  <Coins className="w-4 h-4 text-zinc-500" />
                  <span className="text-sm text-zinc-300">{copy.itemLabel}</span>
                </div>
                <span className="text-sm font-bold text-money">{formatRub(GATE_AMOUNT)}</span>
              </div>
            </div>

            <div className="space-y-sm" role="radiogroup" aria-label="Способ оплаты">
              <label className="text-xs font-medium text-zinc-400 uppercase tracking-wide">Способ оплаты</label>
              {[
                { id: 'sbp' as GateMethod, name: 'СБП', icon: Smartphone },
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
                    className={`relative p-sm rounded-panel border-2 transition-all cursor-pointer bg-zinc-900 ${selected ? 'border-emerald-500 hover:border-emerald-500' : 'border-zinc-800 hover:border-zinc-700'}`}
                  >
                    <div className="flex items-center gap-sm">
                      <div className="p-xs rounded-panel shrink-0 bg-zinc-800">
                        <MIcon className={`w-6 h-6 ${selected ? 'text-emerald-400' : 'text-zinc-400'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-base leading-tight text-zinc-200">{m.name}</p>
                      </div>
                      <div className="shrink-0">
                        <div className={`w-6 h-6 rounded-pill border-2 flex items-center justify-center transition-colors ${selected ? 'border-emerald-500' : 'border-zinc-600'}`}>
                          {selected && <div className="w-3 h-3 rounded-pill bg-emerald-500" />}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {paymentError && (
              <div role="alert" aria-live="assertive" className="flex gap-sm p-sm rounded-panel bg-red-500/10 border border-red-500/20 text-sm">
                <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-2xs" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-red-200 leading-snug">{paymentError.text}</p>
                  {paymentError.code && <p className="text-xs font-mono text-red-300/70 mt-2xs break-all">Код: {paymentError.code}</p>}
                  <div className="flex gap-sm mt-xs flex-wrap">
                    <button onClick={handlePay} disabled={loading} className="text-xs font-bold text-red-300 underline hover:text-red-200 disabled:opacity-50">
                      Попробовать снова
                    </button>
                    <a href="/support" className="text-xs text-red-300/80 underline hover:text-red-300">
                      Поддержка
                    </a>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-sm">
              {paymentLink ? (
                <>
                  <a
                    href={paymentLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r ${copy.gradient} text-white`}
                  >
                    <ExternalLink className="w-5 h-5" />
                    Продолжить оплату
                  </a>
                  <button
                    onClick={handleIvePaid}
                    className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700"
                  >
                    Я оплатил
                  </button>
                </>
              ) : (
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
                  ) : (
                    <>
                      <Check className="w-5 h-5" />
                      Оплатить {formatRub(GATE_AMOUNT)}
                    </>
                  )}
                </button>
              )}
              {polling && !paymentError && (
                <p className="text-xs text-zinc-500 flex items-center gap-xs justify-center">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Ожидаем оплату...
                </p>
              )}
              <button
                onClick={paymentId ? resetPayment : onClose}
                disabled={loading}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700"
              >
                {paymentId ? 'Начать заново' : 'Отмена'}
              </button>
              <p className="text-xs text-center text-zinc-600 px-md">Сумма оплаты не зачисляется на игровой баланс</p>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  );
}
