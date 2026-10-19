/**
 * Представление данных счёта для модели — общий код клиента и сервера.
 *
 * Раньше эти хелперы жили только в клиентском тулките (инструменты исполнял
 * браузер). Теперь те же инструменты исполняет и сервер (чтобы ответ существовал
 * независимо от браузера), поэтому форматирование вынесено сюда и импортируется
 * обоими путями — иначе ответы клиента и сервера разъезжались бы.
 */
import type { WalletHistoryItem, WalletPaymentItem } from "@/lib/api";

type TransactionsResponse = { counts: { withdrawals: number } & Record<string, unknown>; items: WalletHistoryItem[] };

// Backend statuses of a transaction row. "cancelled" / "refund_pending" are real
// DB values for withdrawals even though the response type only lists three.
export const STATUS_LABELS: Record<string, string> = {
  pending: "в обработке",
  success: "выполнено",
  failed: "отклонено",
  cancelled: "отменено, средства возвращены на баланс",
  refund_pending: "отклонено, возврат средств в процессе",
};

export const WITHDRAW_REJECT_REASONS: Record<string, string> = {
  need_deposit: "нет ни одного успешного депозита",
  need_verification: "не пройдена верификация реквизитов",
  verification_pending: "верификация реквизитов ещё проверяется",
  need_premium: "нет активной Премиум подписки",
};

export const PAYMENT_STATUS_TEXT: Record<string, string> = {
  NEW: "платёж создан, оплата ещё не подтверждена",
  PENDING: "ожидает оплаты или подтверждения провайдера",
  AWAITING_RECEIPT: "оплата подтверждена провайдером, деньги ещё не зачислены на баланс",
  CONFIRMED_BY_USER: "оплата подтверждена, ожидает зачисления",
  PAID: "оплачено и зачислено на баланс",
  FAILED: "платёж не состоялся",
  CANCELED: "платёж отменён",
  EXPIRED: "срок оплаты истёк",
};

export const PAYMENT_PURPOSE_TEXT: Record<string, string> = {
  deposit: "пополнение баланса",
  verification: "верификация реквизитов",
  premium: "Премиум подписка",
};

const MSK_TIME_ZONE = "Europe/Moscow";

/**
 * Время в формате, понятном модели: дата/время по Москве + сколько прошло.
 * Инструменты отдают ISO-в-UTC, который модель регулярно читает как «сегодня»,
 * поэтому каждую дату переводим в МСК и добавляем возраст записи.
 */
export function stamp(iso?: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  const at = new Intl.DateTimeFormat("ru-RU", {
    timeZone: MSK_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(date)
    .replace(",", "");

  const minutes = Math.round(Math.abs(now.getTime() - date.getTime()) / 60_000);
  const suffix =
    minutes < 1
      ? "только что"
      : minutes < 60
        ? `${minutes} мин назад`
        : minutes < 60 * 24
          ? `${Math.round(minutes / 60)} ч назад`
          : `${Math.round(minutes / (60 * 24))} дн. назад`;

  return `${at} МСК (${suffix})`;
}

export function paymentView(p: WalletPaymentItem, now: Date) {
  return {
    purpose: PAYMENT_PURPOSE_TEXT[p.purpose] ?? p.purpose,
    amount: p.amount,
    method: p.method,
    status: p.status,
    statusText: PAYMENT_STATUS_TEXT[p.status] ?? p.status,
    credited: p.credited,
    receiptAttached: p.hasReceipt,
    createdAt: stamp(p.createdAt, now),
    updatedAt: stamp(p.updatedAt, now),
  };
}

export function historyView(item: WalletHistoryItem, now: Date) {
  return {
    id: item.id,
    type: item.type,
    category: item.category,
    title: item.title,
    subtitle: item.subtitle,
    amount: item.amount,
    status: item.status,
    statusText: STATUS_LABELS[item.status] ?? item.status,
    createdAt: stamp(item.createdAt, now),
    processingUntil: item.processingUntil ? stamp(item.processingUntil, now) : null,
  };
}

export const summarizeTransactions = (res: TransactionsResponse, limit = 25, now: Date = new Date()) => ({
  counts: res.counts,
  items: res.items.slice(0, limit).map((i) => historyView(i, now)),
});

export type HistoryRow = {
  bet?: unknown;
  multiplier?: unknown;
  payout?: unknown;
  outcome?: unknown;
  createdAt?: unknown;
};

export const summarizeHistory = (res: { items: HistoryRow[] }, limit = 20) =>
  res.items.slice(0, limit).map((i) => ({
    bet: i.bet,
    multiplier: i.multiplier,
    payout: i.payout,
    outcome: i.outcome,
    createdAt: i.createdAt,
  }));
