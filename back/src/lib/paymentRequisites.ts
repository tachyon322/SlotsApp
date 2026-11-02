/**
 * Реквизиты H2H-платежа от шлюза (neuromatic): QR-картинка, ссылка СБП или
 * номер для перевода. Приходят из чужого сервиса и уходят на фронт в
 * `<img src>` / `<a href>`, поэтому здесь повторная проверка: только растровые
 * data URL и http(s)-ссылки, остальное — обычный текст.
 */

export type RequisitesKind = "image" | "link" | "text";

export interface PaymentRequisites {
  method: string;
  kind: RequisitesKind;
  value: string;
  bank?: string;
  owner?: string;
  /** Точная сумма перевода, если провайдер назвал её (может отличаться от счёта). */
  payAmount?: string;
  comment?: string;
}

const MAX_IMAGE_LENGTH = 400_000;
const MAX_TEXT_LENGTH = 300;
const IMAGE_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

function clean(value: unknown, max = MAX_TEXT_LENGTH): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) value = String(value);
  if (typeof value !== "string") return undefined;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return text ? text.slice(0, max) : undefined;
}

function classify(raw: string): { kind: RequisitesKind; value: string } | null {
  if (/^data:/i.test(raw)) {
    return raw.length <= MAX_IMAGE_LENGTH && IMAGE_RE.test(raw)
      ? { kind: "image", value: raw }
      : null;
  }
  if (/^https?:\/\//i.test(raw)) {
    try {
      const url = new URL(raw);
      return url.protocol === "https:" || url.protocol === "http:"
        ? { kind: "link", value: url.toString() }
        : null;
    } catch {
      return null;
    }
  }
  const text = clean(raw);
  return text ? { kind: "text", value: text } : null;
}

/** Приводит значение из ответа шлюза или из БД к безопасному виду; иначе null. */
export function sanitizeRequisites(raw: unknown): PaymentRequisites | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const data = raw as Record<string, unknown>;
  const value = clean(data.value, MAX_IMAGE_LENGTH);
  if (!value) return null;
  const classified = classify(value);
  if (!classified) return null;
  const bank = clean(data.bank);
  const owner = clean(data.owner);
  const payAmount = clean(data.payAmount, 32);
  const comment = clean(data.comment);
  return {
    method: clean(data.method, 32) ?? "unknown",
    ...classified,
    ...(bank ? { bank } : {}),
    ...(owner ? { owner } : {}),
    ...(payAmount ? { payAmount } : {}),
    ...(comment ? { comment } : {}),
  };
}

/** Строка из колонки `payments.requisites` (JSON) → реквизиты. */
export function parseStoredRequisites(raw: string | null | undefined): PaymentRequisites | null {
  if (!raw) return null;
  try {
    return sanitizeRequisites(JSON.parse(raw));
  } catch {
    return null;
  }
}
