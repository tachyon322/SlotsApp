import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import type Redis from "ioredis";
import { db } from "../db";
import { supportMessage } from "../db/schema";
import { supportBuffer } from "../lib/supportBuffer";
import { auth } from "../lib/auth";
import { redis } from "../lib/redis";
import {
  getOrCreateConversationId,
  isUserConversation,
  conversationStreamChannel,
} from "../lib/supportConversation";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const support = new Hono<{ Variables: Variables }>();

support.post("/feedback", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    conversationId?: unknown;
    messageId?: unknown;
    role?: unknown;
    content?: unknown;
  };

  const conversationId = typeof body.conversationId === "string" ? body.conversationId.trim() : "";
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  const role = body.role === "assistant" ? "assistant" : body.role === "user" ? "user" : null;
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!conversationId || !messageId || !role || !content) {
    return c.json({ message: "Некорректные данные сообщения" }, 400);
  }

  const owned = await isUserConversation(user.id, conversationId);
  if (!owned) {
    return c.json({ message: "Чужой диалог" }, 403);
  }

  await supportBuffer.pushMessage({
    conversationId,
    userId: user.id,
    messageId,
    role,
    content,
    createdAt: new Date().toISOString(),
  });

  return c.json({ ok: true });
});

support.get("/thread", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const conversationId = await getOrCreateConversationId(user.id);

  const rows = await db
    .select({
      id: supportMessage.id,
      role: supportMessage.role,
      content: supportMessage.content,
      messageId: supportMessage.messageId,
      createdAt: supportMessage.createdAt,
    })
    .from(supportMessage)
    .where(eq(supportMessage.conversationId, conversationId))
    .orderBy(asc(supportMessage.createdAt), asc(supportMessage.id));

  return c.json({
    conversationId,
    items: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      messageId: m.messageId,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

support.get("/stream", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const conversationId = await getOrCreateConversationId(user.id);
  const channel = conversationStreamChannel(conversationId);

  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache, no-transform");
  c.header("Connection", "keep-alive");
  c.header("X-Accel-Buffering", "no");

  const signal = c.req.raw.signal;
  let heartbeat: Timer | null = null;
  let sub: Redis | null = null;

  const cleanup = () => {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    if (sub) {
      sub.unsubscribe(channel).catch(() => {});
      sub.disconnect();
      sub = null;
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          cleanup();
        }
      };

      const onAbort = () => {
        cleanup();
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      signal.addEventListener("abort", onAbort, { once: true });

      sub = redis.duplicate();
      sub.on("error", () => {});
      sub.on("message", (_channel, msg) => {
        send(`data: ${msg}\n\n`);
      });

      try {
        await sub.subscribe(channel);
        if (signal.aborted) {
          cleanup();
          return;
        }
        heartbeat = setInterval(() => send(": ping\n\n"), 25000);
      } catch (err) {
        console.error("[Support] SSE subscribe error:", err);
        try {
          controller.error(err);
        } catch {
          // ignore
        }
      }
    },
    cancel() {
      cleanup();
    },
  });

  return c.body(stream);
});

export default support;
