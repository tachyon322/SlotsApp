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
  AlertTriangle,
  Upload,
  Plus,
  X,
} from 'lucide-react';
import { useUser } from './UserProvider';
import { paymentApi, verificationApi, type PaymentPurpose } from '@/lib/api';
import { showError } from '@/lib/toast';
import { compressToWebp } from '@/lib/imageCompress';
import { ModalShell } from './ModalShell';
import { Button } from './ui/button';
import { resolvePaymentError } from '@/lib/paymentErrors';

const GATE_AMOUNT = 2000;
const TERMINAL_FAILURE = new Set(['EXPIRED', 'CANCELED', 'FAILED']);
const MAX_RECEIPTS = 2;
const MAX_RECEIPT_SIZE = 5 * 1024 * 1024;

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
  const [paymentError, setPaymentError] = useState<{ text: string; code?: string } | null>(null);

  const [payStage, setPayStage] = useState<'payment' | 'receipt'>('payment');
  const [receipts, setReceipts] = useState<{ file: File; preview: string }[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [receiptSent, setReceiptSent] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [awaitingReceipt, setAwaitingReceipt] = useState(false);
  const [receiptUploadStatus, setReceiptUploadStatus] = useState<'idle' | 'uploading' | 'uploaded' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

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
        window.dispatchEvent(new CustomEvent('verification-paid'));
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
        console.error('[Verification] receipt upload failed:', err);
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
          window.dispatchEvent(new CustomEvent('verification-paid'));
        } else if (res.status === 'AWAITING_RECEIPT') {
          setAwaitingReceipt(true);
          setPayStage('receipt');
          if (uploadedUrl) {
            try {
              await attachReceiptToPayment(uploadedUrl);
            } catch (err) {
              console.error('[Verification] attachReceipt retry failed:', err);
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
        // keep polling
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [open, paymentId, paid, polling, uploadedUrl, attachReceiptToPayment]);

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
    setPaymentError(null);
    try {
      const res = await paymentApi.create(GATE_AMOUNT, method, 'verification');
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
    if (payStage === 'receipt') {
      return (
        <ModalShell open={open} onClose={onClose} titleId="verification-modal-title">
          <div className="flex gap-lg flex-col animate-[topup-step-in_0.25s_cubic-bezier(0.16,1,0.3,1)_both]">
            <div className="text-center space-y-sm">
              <div className="mx-auto w-14 h-14 rounded-full bg-zinc-800 flex items-center justify-center mb-md">
                <ShieldCheck className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 id="verification-modal-title" className="text-2xl font-bold text-white">
                {awaitingReceipt ? 'Перевод получен' : 'Прикрепите чек'}
              </h2>
              <p className="text-sm text-zinc-400">
                {awaitingReceipt
                  ? 'Перевод получен. Прикрепите чек, чтобы завершить оплату верификации'
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
                <p className="text-xs text-zinc-500">Верификация будет подтверждена после проверки чека</p>
              </div>
            </div>

            <div className="space-y-sm">
              <button
                onClick={resetPayment}
                disabled={isUploading}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border-2 border-zinc-800 hover:border-zinc-700 disabled:opacity-50"
              >
                Начать заново
              </button>
              <button
                onClick={() => setPayStage('payment')}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-control text-sm font-medium transition-colors focus-visible:outline-none px-md py-xs w-full h-12 border border-zinc-800 hover:border-zinc-700 text-zinc-400"
              >
                Назад к оплате
              </button>
            </div>
          </div>
        </ModalShell>
      );
    }

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

          {paymentError && (
            <div
              role="alert"
              aria-live="assertive"
              className="flex gap-sm p-sm rounded-panel bg-red-500/10 border border-red-500/20 text-sm"
            >
              <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-2xs" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-red-200 leading-snug">{paymentError.text}</p>
                {paymentError.code && (
                  <p className="text-xs font-mono text-red-300/70 mt-2xs break-all">Код: {paymentError.code}</p>
                )}
                <div className="flex gap-sm mt-xs flex-wrap">
                  <button
                    onClick={handlePay}
                    disabled={loading}
                    className="text-xs font-bold text-red-300 underline hover:text-red-200 disabled:opacity-50"
                  >
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
                  className="inline-flex items-center justify-center gap-xs whitespace-nowrap transition-colors focus-visible:outline-none rounded-control px-2xl w-full h-14 text-base font-bold bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
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
            {polling && !paymentError && (
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
