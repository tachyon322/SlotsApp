import { and, desc, eq, ne } from "drizzle-orm";
import { db } from "../db";
import { supportConversation } from "../db/schema";
import { redis } from "./redis";

const CONVERSATION_TTL_SECONDS = 30 * 24 * 60 * 60;

export type SupportConversationStatus = "open" | "pending_user" | "closed";

export interface SupportConversationRow {
  id: string;
  userId: string;
  code: string;
  subject: string;
  status: SupportConversationStatus;
  createdAt: Date;
  updatedAt: Date;
}

function userKey(userId: string): string {
  return `support:user_conv:${userId}`;
}

// Человекочитаемый номер обращения вида T-123456789. Коллизии практически
// невозможны и не критичны (номер используется только для отображения).
export function generateTicketCode(): string {
  return `T-${Math.floor(100000000 + Math.random() * 900000000)}`;
}

function serializeConversation(row: {
  id: string;
  userId: string;
  code: string;
  subject: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): SupportConversationRow {
  return {
    id: row.id,
    userId: row.userId,
    code: row.code,
    subject: row.subject,
    status: (row.status as SupportConversationStatus) ?? "open",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function conversationSelection() {
  return {
    id: supportConversation.id,
    userId: supportConversation.userId,
    code: supportConversation.code,
    subject: supportConversation.subject,
    status: supportConversation.status,
    createdAt: supportConversation.createdAt,
    updatedAt: supportConversation.updatedAt,
  };
}

/**
 * Список обращений пользователя, новые сверху.
 */
export async function listConversations(
  userId: string,
  limit = 50,
): Promise<SupportConversationRow[]> {
  const rows = await db
    .select(conversationSelection())
    .from(supportConversation)
    .where(eq(supportConversation.userId, userId))
    .orderBy(desc(supportConversation.updatedAt))
    .limit(limit);

  return rows.map(serializeConversation);
}

/**
 * Создать новое обращение. Возвращает null, если у пользователя уже есть
 * незакрытое обращение (одновременно допускается только одно).
 */
export async function createConversation(
  userId: string,
  subject: string,
): Promise<SupportConversationRow | null> {
  const active = await db
    .select({ id: supportConversation.id })
    .from(supportConversation)
    .where(
      and(
        eq(supportConversation.userId, userId),
        ne(supportConversation.status, "closed"),
      ),
    )
    .limit(1);

  if (active.length > 0) return null;

  const now = new Date();
  const values = {
    id: crypto.randomUUID(),
    userId,
    subject,
    status: "open" as SupportConversationStatus,
    code: generateTicketCode(),
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(supportConversation).values(values);

  // Обновляем легаси-мапу: старые клиенты (/thread, /stream без параметра)
  // продолжают работать с последним активным обращением.
  await redis.set(userKey(userId), values.id, "EX", CONVERSATION_TTL_SECONDS);

  return serializeConversation({ ...values, status: values.status });
}

/**
 * True, если обращение принадлежит пользователю (проверка по БД).
 * В отличие от прежней Redis-проверки, незнакомые id больше не принимаются.
 */
export async function isUserConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: supportConversation.id })
    .from(supportConversation)
    .where(
      and(
        eq(supportConversation.id, conversationId),
        eq(supportConversation.userId, userId),
      ),
    )
    .limit(1);

  return rows.length > 0;
}

/**
 * Открыть обращение заново (ответ пользователя) или пометить «нужен ваш
 * ответ» (ответил оператор). Закрытые обращения не переоткрываются.
 */
export async function setConversationStatus(
  conversationId: string,
  status: SupportConversationStatus,
): Promise<void> {
  await db
    .update(supportConversation)
    .set({ status, updatedAt: new Date() })
    .where(
      and(
        eq(supportConversation.id, conversationId),
        ne(supportConversation.status, "closed"),
      ),
    );
}

/**
 * Легаси-резолвер одного треда на пользователя: Redis-мапа → активное/последнее
 * обращение в БД → создать новое. Нужен, пока старые клиенты ходят в /thread.
 */
export async function getOrCreateConversationId(userId: string): Promise<string> {
  const cached = await redis.get(userKey(userId));
  if (cached) return cached;

  const rows = await db
    .select(conversationSelection())
    .from(supportConversation)
    .where(eq(supportConversation.userId, userId))
    .orderBy(desc(supportConversation.updatedAt))
    .limit(1);

  if (rows.length > 0) {
    await redis.set(userKey(userId), rows[0].id, "EX", CONVERSATION_TTL_SECONDS);
    return rows[0].id;
  }

  const created = await createConversation(userId, "Обращение");
  if (created) return created.id;

  // Гонка: другой запрос успел создать обращение — берём его.
  const again = await db
    .select(conversationSelection())
    .from(supportConversation)
    .where(eq(supportConversation.userId, userId))
    .orderBy(desc(supportConversation.updatedAt))
    .limit(1);

  if (again.length === 0) {
    throw new Error("Не удалось создать обращение поддержки");
  }

  await redis.set(userKey(userId), again[0].id, "EX", CONVERSATION_TTL_SECONDS);
  return again[0].id;
}

export function conversationStreamChannel(conversationId: string): string {
  return `support:conv:${conversationId}`;
}
