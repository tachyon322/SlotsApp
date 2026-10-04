/**
 * Клиент платёжного шлюза (razdevator, домен neuromatic.cc): счёт на оплату и
 * статус. Подпись — HMAC-SHA256(secret, `${timestamp}.${rawBody}`) в заголовках
 * X-Gateway-*, как ждёт lib/gateway.ts на стороне шлюза. Провайдер (Exenta) от
 * kazik скрыт: счёт живёт на стороне шлюза, а результат приходит колбэком
 * на /webhook.
 */
import { createHmac } from "node:crypto";

export type GatewayPaymentStatus = "PENDING" | "PAID" | "FAILED" | "CANCELED";

export class PaymentGatewayError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = "PaymentGatewayError";
    this.code = code;
  }
}

const BASE_URL = (process.env.PAYMENT_GATEWAY_URL || "https://neuromatic.cc").replace(/\/+$/, "");
const PROJECT = process.env.PAYMENT_GATEWAY_PROJECT || "kazik";
const SECRET = process.env.PAYMENT_GATEWAY_SECRET || "";
const CREATE_TIMEOUT_MS = 15_000;
const STATUS_TIMEOUT_MS = 10_000;

interface GatewayErrorBody {
  error?: { code?: string | null; message?: string | null } | null;
}

async function request<T>(
  path: string,
  init: { method: "GET" | "POST"; body?: unknown; timeoutMs: number },
): Promise<T> {
  const rawBody = init.body === undefined ? "" : JSON.stringify(init.body);
  const timestamp = String(Date.now());
  const signature = createHmac("sha256", SECRET)
    .update(`${timestamp}.${rawBody}`, "utf8")
    .digest("hex");

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      method: init.method,
      headers: {
        "content-type": "application/json",
        "x-gateway-project": PROJECT,
        "x-gateway-timestamp": timestamp,
        "x-gateway-signature": signature,
      },
      body: rawBody || undefined,
      signal: AbortSignal.timeout(init.timeoutMs),
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") {
      throw new PaymentGatewayError("Платёжный сервис не ответил вовремя", "TIMEOUT");
    }
    throw new PaymentGatewayError("Платёжный сервис недоступен", "UNAVAILABLE");
  }

  const data = (await res.json().catch(() => ({}))) as T & GatewayErrorBody;

  if (!res.ok) {
    const code = data?.error?.code?.trim() || undefined;
    const message = data?.error?.message?.trim() || code || "Платёжный сервис недоступен";
    throw new PaymentGatewayError(message, code);
  }

  return data;
}

export interface CreateGatewayPaymentParams {
  /** Локальный id платежа kazik: ключ идемпотентности на стороне шлюза. */
  externalId: string;
  externalUserId: string;
  purpose: string;
  method: string;
  amountRub: number;
  buyerIp?: string | null;
  returnUrl?: string | null;
}

export interface CreatedGatewayPayment {
  id: string;
  paymentUrl: string;
  status: GatewayPaymentStatus;
}

/** Создаёт счёт и возвращает ссылку, на которую отправляем покупателя. */
export async function createGatewayPayment(
  params: CreateGatewayPaymentParams,
): Promise<CreatedGatewayPayment> {
  const data = await request<CreatedGatewayPayment>("/api/gateway/payments", {
    method: "POST",
    timeoutMs: CREATE_TIMEOUT_MS,
    body: {
      externalId: params.externalId,
      externalUserId: params.externalUserId,
      purpose: params.purpose,
      method: params.method,
      amountRub: params.amountRub,
      ...(params.buyerIp ? { buyerIp: params.buyerIp } : {}),
      ...(params.returnUrl ? { returnUrl: params.returnUrl } : {}),
    },
  });

  if (!data?.paymentUrl) {
    throw new PaymentGatewayError("Платёжный сервис не вернул ссылку на оплату", "NO_LINK");
  }
  return data;
}

export interface GatewayPaymentState {
  id: string;
  externalId: string;
  amountRub: number;
  status: GatewayPaymentStatus;
  paidAt: string | null;
}

/** Статус счёта: страховка на случай потерянного колбэка. */
export function getGatewayPaymentStatus(id: string): Promise<GatewayPaymentState> {
  return request<GatewayPaymentState>(`/api/gateway/payments/${encodeURIComponent(id)}`, {
    method: "GET",
    timeoutMs: STATUS_TIMEOUT_MS,
  });
}
