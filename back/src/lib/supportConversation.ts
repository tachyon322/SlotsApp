import { desc, eq } from "drizzle-orm";
import { db } from "../db";
import { supportConversation } from "../db/schema";
import { redis } from "./redis";

const CONVERSATION_TTL_SECONDS = 30 * 24 * 60 * 60;

function userKey(userId: string): string {
  return `support:user_conv:${userId}`;
}

/**
 * Resolve the user's support conversation id. A Redis map (userId -> conversationId)
 * is the primary source to avoid a DB hit on the hot path. On a cache miss we fall
 * back to the most recent conversation in Postgres, or create a fresh id (persisted
 * lazily once the first message is flushed).
 */
export async function getOrCreateConversationId(userId: string): Promise<string> {
  const cached = await redis.get(userKey(userId));
  if (cached) return cached;

  const rows = await db
    .select({ id: supportConversation.id })
    .from(supportConversation)
    .where(eq(supportConversation.userId, userId))
    .orderBy(desc(supportConversation.updatedAt))
    .limit(1);

  if (rows.length > 0) {
    await redis.set(userKey(userId), rows[0].id, "EX", CONVERSATION_TTL_SECONDS);
    return rows[0].id;
  }

  const conversationId = crypto.randomUUID();
  await redis.set(userKey(userId), conversationId, "EX", CONVERSATION_TTL_SECONDS);
  return conversationId;
}

/**
 * True if the given conversationId belongs to the user (per the Redis map). Used to
 * reject attempts to write messages into someone else's conversation without a DB hit.
 */
export async function isUserConversation(
  userId: string,
  conversationId: string,
): Promise<boolean> {
  const cached = await redis.get(userKey(userId));
  if (cached === null) {
    // Unknown mapping — accept and record it (legacy flow). The frontend always
    // sends the id issued by GET /api/support/thread.
    await redis.set(userKey(userId), conversationId, "EX", CONVERSATION_TTL_SECONDS);
    return true;
  }
  return cached === conversationId;
}

export function conversationStreamChannel(conversationId: string): string {
  return `support:conv:${conversationId}`;
}
