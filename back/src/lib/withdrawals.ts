import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db";
import { transaction } from "../db/schema";
import { userCache } from "./userCache";

export const WITHDRAWAL_PROCESSING_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Дедлайн заявки на вывод: createdAt + 30 календарных суток (выходные
 * считаются). Время суток сохраняется.
 */
export function withdrawalDeadline(createdAt: Date): Date {
  return new Date(createdAt.getTime() + WITHDRAWAL_PROCESSING_DAYS * DAY_MS);
}

// ─────────────────────────────────────────────────────────────────────────────
// Движение средств по заявке (вывод / возврат)
//
// Стадии не хранятся в БД: они детерминированно выводятся из id и createdAt
// заявки. Поэтому картинка одинакова в кошельке, на главной, в поддержке и не
// «прыгает» между запросами: случайные 1–3 часа первой стадии, старт очереди
// 1 000–5 000 и её ежедневное убывание зашиты хешем от id заявки.
// ─────────────────────────────────────────────────────────────────────────────

export type MovementKind = "withdrawal" | "refund";
export type MovementStageKey = "processing" | "gateway" | "queue" | "final_check";
export type MovementStepState = "done" | "current" | "pending" | "failed";

export interface MovementStep {
  key: MovementStageKey;
  title: string;
  description: string;
  state: MovementStepState;
  /** Когда шаг начался (null у будущих шагов). */
  at: string | null;
  /** Когда шаг завершится (null у финальной проверки возврата). */
  endsAt: string | null;
}

export interface MovementTimeline {
  kind: MovementKind;
  current: MovementStageKey | "expired";
  steps: MovementStep[];
  queue: { position: number; total: number } | null;
  deadline: string;
  expired: boolean;
}

const STAGE1_MIN_MINUTES = 60;
const STAGE1_SPAN_MINUTES = 120; // итого 60–180 минут
const STAGE2_HOURS = 24;
const QUEUE_MIN = 1000;
const QUEUE_MAX = 5000;
const QUEUE_TOTAL = QUEUE_MAX;
const HOUR_MS = 60 * 60 * 1000;

const QUEUE_TITLE: Record<MovementKind, string> = {
  withdrawal: "Заявка поставлена в очередь на вывод",
  refund: "Заявка поставлена в очередь на возврат",
};

const QUEUE_DONE_DESCRIPTION: Record<MovementKind, string> = {
  withdrawal: "Выплата выполняется по мере продвижения очереди.",
  refund: "Возврат выполняется по мере продвижения очереди.",
};

/** FNV-1a: стабильный хеш строки (id заявки) без внешних зависимостей. */
function hash32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** Хеш, приведённый к [0, 1). */
function hashUnit(seed: string, salt: string): number {
  return hash32(`${salt}:${seed}`) / 0x100000000;
}

/** Длительность первой стадии: 1–3 часа, фиксированная для заявки. */
export function movementStage1Minutes(id: string): number {
  return STAGE1_MIN_MINUTES + Math.round(hashUnit(id, "stage1") * STAGE1_SPAN_MINUTES);
}

/** Стартовое место в очереди: 1 000–5 000, фиксированное для заявки. */
export function movementQueueStart(id: string): number {
  return QUEUE_MIN + Math.floor(hashUnit(id, "queue-start") * (QUEUE_MAX - QUEUE_MIN + 1));
}

/**
 * Место в очереди на день `day` (0 — день постановки). Строго убывает не
 * реже чем на 1 в сутки и к последнему дню (`lastDay`) подходит к 1. Внутри
 * дня значение не меняется, дневной разброс детерминирован — «сегодняшнее»
 * место не прыгает при перезагрузке.
 */
export function movementQueuePosition(
  id: string,
  start: number,
  day: number,
  lastDay: number = WITHDRAWAL_PROCESSING_DAYS,
): number {
  const total = Math.max(1, Math.floor(lastDay));
  const targetDay = Math.max(0, Math.min(total, Math.floor(day)));
  let position = start;
  for (let d = 1; d <= targetDay; d += 1) {
    const remaining = total - d;
    const target = 1 + (start - 1) * (remaining / total);
    const jitter = 0.96 + hashUnit(id, `queue-day-${d}`) * 0.08;
    const next = Math.round(target * jitter);
    position = Math.max(1, Math.min(position - 1, next));
  }
  return position;
}

function movementQueueDescription(kind: MovementKind, position: number): string {
  return `Ваше место в очереди: ${position.toLocaleString("ru-RU")} из ${QUEUE_TOTAL.toLocaleString("ru-RU")}. ${QUEUE_DONE_DESCRIPTION[kind]}`;
}

/**
 * Таймлайн заявки: три шага (обработка → платёжный шлюз → очередь), а для
 * возврата, пережившего 30-дневный срок, — четвёртый шаг «финальная проверка».
 * Просроченный вывод третий шаг помечает failed: пользователю нужно оформить
 * возврат средств (см. UI кошелька).
 */
export function buildMovementTimeline(params: {
  id: string;
  createdAt: Date;
  kind: MovementKind;
  now?: Date;
}): MovementTimeline {
  const { id, createdAt, kind } = params;
  const now = params.now ?? new Date();

  const stage1End = new Date(createdAt.getTime() + movementStage1Minutes(id) * 60 * 1000);
  const stage2End = new Date(stage1End.getTime() + STAGE2_HOURS * HOUR_MS);
  const deadline = withdrawalDeadline(createdAt);

  const afterStage1 = now.getTime() >= stage1End.getTime();
  const afterStage2 = now.getTime() >= stage2End.getTime();
  const expired = now.getTime() >= deadline.getTime();
  const queueStarted = afterStage2;

  const queueStart = movementQueueStart(id);
  // День очереди — целые сутки от постановки в очередь; последний день
  // растянут до дедлайна заявки, поэтому место подходит к 1 вместе со сроком.
  const queueWindowMs = deadline.getTime() - stage2End.getTime();
  const queueLastDay = Math.max(1, Math.floor(queueWindowMs / DAY_MS));
  const queueDay = queueStarted
    ? Math.min(queueLastDay, Math.floor((now.getTime() - stage2End.getTime()) / DAY_MS))
    : 0;
  const queuePosition = movementQueuePosition(id, queueStart, queueDay, queueLastDay);

  const steps: MovementStep[] = [
    {
      key: "processing",
      title: "Заявка обрабатывается",
      description: "Проверяем параметры операции. Обычно занимает 1–3 часа.",
      state: afterStage1 ? "done" : "current",
      at: createdAt.toISOString(),
      endsAt: stage1End.toISOString(),
    },
    {
      key: "gateway",
      title: "Заявка передана на обработку в платёжный шлюз",
      description: "Платёжный шлюз обрабатывает заявку до 48 часов.",
      state: afterStage2 ? "done" : afterStage1 ? "current" : "pending",
      at: afterStage1 ? stage1End.toISOString() : null,
      endsAt: stage2End.toISOString(),
    },
    {
      key: "queue",
      title: QUEUE_TITLE[kind],
      description: expired
        ? kind === "withdrawal"
          ? "Платёжный шлюз не смог выполнить выплату."
          : "Очередь возврата пройдена. Заявка передана на финальную проверку."
        : queueStarted
          ? movementQueueDescription(kind, queuePosition)
          : "Очередь движется ежедневно, выплата выполняется по мере продвижения.",
      state: expired
        ? kind === "refund"
          ? "done"
          : "failed"
        : queueStarted
          ? "current"
          : "pending",
      at: afterStage2 ? stage2End.toISOString() : null,
      endsAt: deadline.toISOString(),
    },
  ];

  let current: MovementTimeline["current"];
  if (!afterStage1) current = "processing";
  else if (!afterStage2) current = "gateway";
  else if (!expired) current = "queue";
  else current = kind === "refund" ? "final_check" : "expired";

  if (kind === "refund" && expired) {
    steps.push({
      key: "final_check",
      title: "Заявка на финальной проверке",
      description: "Служба безопасности завершает проверку. Решение по заявке появится здесь.",
      state: "current",
      at: deadline.toISOString(),
      endsAt: null,
    });
  }

  return {
    kind,
    current,
    steps,
    queue: queueStarted && !expired ? { position: queuePosition, total: QUEUE_TOTAL } : null,
    deadline: deadline.toISOString(),
    expired,
  };
}

// need_referrals остаётся в типе только для распознавания и закрытия заявок,
// созданных до удаления реферального шага: новые заявки этот код не получают.
export type WithdrawRejectCode =
  | "need_deposit"
  | "need_verification"
  | "need_premium"
  | "need_referrals"
  | "verification_pending";

export function parseWithdrawalDetails(details: string | null): {
  code?: WithdrawRejectCode;
  requisites?: string;
} {
  if (!details) return {};

  try {
    const parsed = JSON.parse(details) as { code?: unknown; requisites?: unknown };
    if (
      parsed.code === "need_deposit" ||
      parsed.code === "need_verification" ||
      parsed.code === "need_premium" ||
      parsed.code === "need_referrals" ||
      parsed.code === "verification_pending"
    ) {
      return {
        code: parsed.code,
        requisites: typeof parsed.requisites === "string" ? parsed.requisites : undefined,
      };
    }
  } catch {
    // Active requests keep plain requisites in details.
  }

  return { requisites: details };
}

/**
 * Закрытие заявки оператором: pending + balanceDebited=true -> success.
 * Guard на статус делает вызов идемпотентным (повтор вернёт false).
 */
export async function markWithdrawalPaid(id: string): Promise<boolean> {
  const claimed = await db
    .update(transaction)
    .set({ status: "success" })
    .where(
      and(
        eq(transaction.id, id),
        eq(transaction.type, "withdrawal"),
        eq(transaction.status, "pending"),
        eq(transaction.balanceDebited, true),
      ),
    )
    .returning({ id: transaction.id });
  return claimed.length > 0;
}

export type RefundPendingResult = "ok" | "not_found" | "already" | "invalid_status";

/**
 * Отмена заявки с возвратом денег. Используется пользовательской отменой
 * (POST /withdraw/requests/:id/cancel) и отклонением оператора.
 * Claim (pending/refund_pending -> cancelled) идёт до возврата, поэтому
 * конкурентные вызовы не могут вернуть одни и те же деньги дважды.
 */
export async function refundPendingWithdrawal(
  userId: string,
  id: string,
): Promise<RefundPendingResult> {
  const rows = await db
    .select({ status: transaction.status })
    .from(transaction)
    .where(
      and(
        eq(transaction.id, id),
        eq(transaction.userId, userId),
        eq(transaction.type, "withdrawal"),
      ),
    )
    .limit(1);

  const originalStatus = rows[0]?.status;
  if (!originalStatus) return "not_found";
  if (originalStatus === "cancelled" || originalStatus === "success") return "already";
  if (originalStatus !== "pending" && originalStatus !== "refund_pending") {
    return "invalid_status";
  }

  const claimed = await db
    .update(transaction)
    .set({ status: "cancelled" })
    .where(
      and(
        eq(transaction.id, id),
        eq(transaction.userId, userId),
        inArray(transaction.status, ["pending", "refund_pending"]),
      ),
    )
    .returning({ balanceDebited: transaction.balanceDebited, amount: transaction.amount });

  if (claimed.length === 0) return "already";

  try {
    if (claimed[0].balanceDebited) {
      // pending всегда с маркером — пробуем атомарный refundIfDebited, иначе fallback adjust
      const refunded = await userCache.refundIfDebited(userId, claimed[0].amount, id).catch(() => false);
      if (!refunded) {
        // маркер уже съеден (settle успел), но balanceDebited true — компенсируем напрямую
        await userCache.adjustUserBalance(userId, claimed[0].amount).catch(() => {});
        await db
          .update(transaction)
          .set({ balanceDebited: false })
          .where(eq(transaction.id, id))
          .catch(() => {});
      }
    } else {
      // intent без дебета — просто чистим маркер если есть
      await userCache.refundIfDebited(userId, claimed[0].amount, id).catch(() => {});
    }
  } catch (e) {
    // не смогли вернуть — откатываем статус, чтобы не потерять деньги
    await db.update(transaction).set({ status: originalStatus }).where(eq(transaction.id, id)).catch(() => {});
    throw e;
  }

  return "ok";
}
