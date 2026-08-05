export type ExpressAppPaymentMethod =
  | 'all'
  | 'card'
  | 'sbp'
  | 'account'
  | 'card-tj'
  | 'sbp-tj'
  | 'sbp-sber'
  | 'sbp-alpha'
  | 'sbp-vtb'
  | 'nspk'
  | 'card-kzt'
  | 'card-uah'
  | 'acq-usd'
  | 'acq-kzt'
  | 'acq-uah'
  | 'sber-qr'
  | 'tbank-qr'
  | 'ozon-qr'
  | 'psb-qr'
  | 'alfa-qr'
  | 'gazprom-qr'
  | 'otp-qr'
  | 'acq-rub'
  | 'card-uzs'
  | 'deep-link'
  | 'qr';

export type ExpressAppPaymentStatus =
  | 'NEW'
  | 'PENDING'
  | 'CONFIRMED_BY_USER'
  | 'EXPIRED'
  | 'CANCELED'
  | 'FAILED'
  | 'PAID';

export const EXPRESSAPP_TERMINAL_STATUSES = new Set<ExpressAppPaymentStatus>([
  'EXPIRED',
  'CANCELED',
  'FAILED',
  'PAID',
]);

interface ExpressAppApiErrorBody {
  status: 'error';
  error?: string | null;
  message?: string | null;
}

export class ExpressAppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExpressAppError';
  }
}

const API_URL = process.env.EXPRESSAPP_API_URL || 'https://api.expressapp.info';
const API_KEY = process.env.EXPRESSAPP_API_KEY || '';

async function request<T>(
  path: string,
  init: { method: 'GET' | 'POST'; body?: unknown } = { method: 'GET' },
): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });

  const data = (await res.json().catch(() => ({}))) as T & ExpressAppApiErrorBody;

  if (!res.ok || data?.status === 'error') {
    const detail = data?.error || data?.message || 'Платёжный сервис недоступен';
    throw new ExpressAppError(String(detail));
  }

  return data;
}

export interface ExpressAppPaymentLinkData {
  payment_id: string;
  link: string;
}

export interface ExpressAppPaymentLinkResponse {
  status: 'success';
  data: ExpressAppPaymentLinkData | null;
  error?: string | null;
  message?: string | null;
}

export interface ExpressAppPaymentStatusResponse {
  amount: string;
  client_order_id: string;
  currency: string;
  paid_amount: string;
  payment_id: string;
  status: ExpressAppPaymentStatus;
}

export function createPaymentLink(params: {
  amount: number;
  currency: string;
  method: ExpressAppPaymentMethod;
  clientOrderId: string;
}): Promise<ExpressAppPaymentLinkResponse> {
  return request<ExpressAppPaymentLinkResponse>('/v1/payment/link', {
    method: 'POST',
    body: {
      amount: params.amount.toFixed(2),
      currency: params.currency,
      method: params.method,
      client_order_id: params.clientOrderId,
    },
  });
}

export interface ExpressAppH2hDataResponse {
  payment_id: string;
  type: string;
  bank: string;
  credentials: string;
  account_owner_name: string;
  need_to_pay: string;
  comment: string;
}

export interface ExpressAppH2hResponse {
  status: 'success';
  data: ExpressAppH2hDataResponse | null;
  error?: string | null;
  message?: string | null;
}

export function createH2hPayment(params: {
  amount: number;
  currency: string;
  method: ExpressAppPaymentMethod;
  clientOrderId: string;
}): Promise<ExpressAppH2hResponse> {
  return request<ExpressAppH2hResponse>('/v1/payment/h2h', {
    method: 'POST',
    body: {
      amount: params.amount.toFixed(2),
      currency: params.currency,
      method: params.method,
      client_order_id: params.clientOrderId,
    },
  });
}

/**
 * Create a deposit payment and return a single redirectable URL.
 * UI method "sbp" maps to expressapp "nspk" (SBP QR), "card" maps to "all" (hosted page).
 */
export async function createDepositPayment(params: {
  amount: number;
  currency: string;
  method: ExpressAppPaymentMethod;
  clientOrderId: string;
}): Promise<{ paymentId: string; link: string }> {
  if (params.method === 'nspk') {
    const res = await createH2hPayment(params);
    if (!res.data?.credentials) {
      throw new ExpressAppError('Платёжный сервис не вернул ссылку на оплату');
    }
    return { paymentId: res.data.payment_id, link: res.data.credentials };
  }

  const res = await createPaymentLink(params);
  if (!res.data?.link) {
    throw new ExpressAppError('Платёжный сервис не вернул ссылку на оплату');
  }
  return { paymentId: res.data.payment_id, link: res.data.link };
}

export function getPaymentStatus(paymentId: string): Promise<ExpressAppPaymentStatusResponse> {
  return request<ExpressAppPaymentStatusResponse>(
    `/v1/payment/status?id=${encodeURIComponent(paymentId)}`,
    { method: 'GET' },
  );
}
