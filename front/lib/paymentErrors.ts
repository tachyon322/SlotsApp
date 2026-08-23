import { ApiError } from '@/lib/api';

export const PAYMENT_ERROR_MAP: Record<string, string> = {
  NO_PAYMENTS_AVAILABLE:
    'Оплата временно недоступна — сейчас нет свободных реквизитов у платёжного провайдера. Попробуйте через 5–10 минут, измените сумму или обратитесь в поддержку.',
  NO_LINK: 'Платёжный сервис временно не отвечает. Попробуйте ещё раз через минуту.',
  INVALID_AMOUNT: 'Некорректная сумма платежа. Проверьте сумму и попробуйте снова.',
  PAYMENT_NOT_FOUND: 'Платёж не найден. Создайте новый платёж.',
  EXPIRED: 'Время на оплату истекло. Создайте новый платёж.',
  CANCELED: 'Платёж был отменён. Попробуйте создать новый.',
  FAILED: 'Платёж не был завершён. Попробуйте ещё раз.',
};

export const PAYMENT_DEFAULT_ERROR =
  'Не удалось создать платёж. Попробуйте ещё раз или обратитесь в поддержку.';

export interface ResolvedPaymentError {
  text: string;
  code?: string;
  raw: string;
}

function extractCodeFromMessage(msg: string): string | undefined {
  const trimmed = msg.trim();
  if (/^[A-Z][A-Z0-9_]+$/.test(trimmed) && trimmed.length >= 4 && trimmed.length <= 64) {
    return trimmed;
  }
  return undefined;
}

export function resolvePaymentError(err: unknown): ResolvedPaymentError {
  if (err instanceof ApiError) {
    const code = err.code || extractCodeFromMessage(err.message || '') || undefined;
    const key = code || '';
    const text = PAYMENT_ERROR_MAP[key] || err.message || PAYMENT_DEFAULT_ERROR;
    return { text, code, raw: err.message || '' };
  }
  const msg = (err as Error)?.message || String(err ?? '');
  const code =
    (err as { code?: string })?.code || extractCodeFromMessage(msg) || undefined;
  const key = code || '';
  const mapped = key ? PAYMENT_ERROR_MAP[key] : undefined;
  if (mapped) return { text: mapped, code, raw: msg };
  if (msg) return { text: code ? PAYMENT_DEFAULT_ERROR : msg, code, raw: msg };
  return { text: PAYMENT_DEFAULT_ERROR, code, raw: msg };
}
