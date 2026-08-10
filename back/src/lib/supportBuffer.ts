import { redis } from './redis';
import { db } from '../db';
import { supportConversation, supportMessage } from '../db/schema';

export interface PendingSupportMessage {
  conversationId: string;
  userId: string;
  messageId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

const PENDING_QUEUE_KEY = 'queue:pending_support_messages';

class SupportBufferService {
  private timer: Timer | null = null;
  private isFlushing = false;

  constructor() {
    this.startPeriodicFlush();
  }

  private startPeriodicFlush() {
    if (typeof setInterval !== 'undefined') {
      this.timer = setInterval(() => {
        void this.flushToDatabase();
      }, 5000);
    }
  }

  /**
   * Queue a support message in Redis. The bulk flush to Postgres happens on a
   * timer or when the queue is large enough, so the database is not hit on the
   * hot chat path.
   */
  async pushMessage(item: PendingSupportMessage): Promise<void> {
    try {
      const jsonStr = JSON.stringify(item);
      const results = await redis.pipeline().rpush(PENDING_QUEUE_KEY, jsonStr).exec();
      const queueLen = results?.[0]?.[1] as number;
      if (typeof queueLen === 'number' && queueLen >= 50) {
        void this.flushToDatabase();
      }
    } catch (err) {
      console.error('[SupportBuffer] Redis push failed, fallback to direct DB insert:', err);
      await this.directDbInsert(item);
    }
  }

  /**
   * Flush the pending queue to Postgres in one bulk transaction.
   */
  async flushToDatabase(): Promise<number> {
    if (this.isFlushing) return 0;
    this.isFlushing = true;

    let totalFlushed = 0;

    try {
      const batchRaw: string[] = [];
      for (let i = 0; i < 200; i++) {
        const item = await redis.lpop(PENDING_QUEUE_KEY);
        if (!item) break;
        batchRaw.push(item);
      }

      if (batchRaw.length === 0) {
        this.isFlushing = false;
        return 0;
      }

      const items: PendingSupportMessage[] = [];
      for (const str of batchRaw) {
        try {
          const parsed = JSON.parse(str) as PendingSupportMessage;
          if (parsed.conversationId && parsed.messageId && parsed.content) {
            items.push(parsed);
          }
        } catch {
          // Skip corrupt item
        }
      }

      if (items.length > 0) {
        const conversationsByUser = new Map<string, string>();
        for (const item of items) {
          conversationsByUser.set(item.conversationId, item.userId);
        }

        await db.transaction(async (tx) => {
          const now = new Date();
          const conversationValues = [...conversationsByUser.entries()].map(
            ([conversationId, userId]) => ({
              id: conversationId,
              userId,
              createdAt: now,
              updatedAt: now,
            }),
          );

          await tx
            .insert(supportConversation)
            .values(conversationValues)
            .onConflictDoUpdate({
              target: supportConversation.id,
              set: { updatedAt: new Date() },
            });

          await tx
            .insert(supportMessage)
            .values(
              items.map((item) => ({
                id: crypto.randomUUID(),
                conversationId: item.conversationId,
                role: item.role,
                content: item.content,
                messageId: item.messageId,
                createdAt: new Date(item.createdAt),
              })),
            )
            .onConflictDoNothing();
        });
      }

      totalFlushed = items.length;
      if (totalFlushed > 0) {
        console.log(`[SupportBuffer] Bulk flushed ${totalFlushed} support messages to PostgreSQL`);
      }
    } catch (err) {
      console.error('[SupportBuffer] Bulk DB flush error:', err);
    } finally {
      this.isFlushing = false;
    }

    return totalFlushed;
  }

  private async directDbInsert(item: PendingSupportMessage) {
    try {
      await db.transaction(async (tx) => {
        await tx
          .insert(supportConversation)
          .values({
            id: item.conversationId,
            userId: item.userId,
            createdAt: new Date(item.createdAt),
            updatedAt: new Date(item.createdAt),
          })
          .onConflictDoUpdate({
            target: supportConversation.id,
            set: { updatedAt: new Date(item.createdAt) },
          });

        await tx
          .insert(supportMessage)
          .values({
            id: crypto.randomUUID(),
            conversationId: item.conversationId,
            role: item.role,
            content: item.content,
            messageId: item.messageId,
            createdAt: new Date(item.createdAt),
          })
          .onConflictDoNothing();
      });
    } catch (e) {
      console.error('[SupportBuffer] Direct DB insert fallback error:', e);
    }
  }

  async destroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flushToDatabase();
  }
}

export const supportBuffer = new SupportBufferService();
