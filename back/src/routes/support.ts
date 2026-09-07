import { Hono } from "hono";
import { asc, eq } from "drizzle-orm";
import type Redis from "ioredis";
import { db } from "../db";
import { supportMessage, supportConversation } from "../db/schema";
import { supportBuffer } from "../lib/supportBuffer";
import { auth } from "../lib/auth";
import { redis } from "../lib/redis";
import {
  createConversation,
  getOrCreateConversationId,
  isUserConversation,
  listConversations,
  setConversationStatus,
  conversationStreamChannel,
} from "../lib/supportConversation";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const SUBJECT_MAX_LENGTH = 120;

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

  // Статус обращения: ответ пользователя переоткрывает тред («в обработке»).
  // Ответ оператора ставит «нужен ваш ответ» — см. админский /support/:id/messages.
  if (role === "user") {
    await setConversationStatus(conversationId, "open");
  }

  return c.json({ ok: true });
});

// Список обращений пользователя (новые сверху).
support.get("/conversations", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const items = await listConversations(user.id);

  return c.json({
    items: items.map((conv) => ({
      id: conv.id,
      code: conv.code,
      subject: conv.subject,
      status: conv.status,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    })),
  });
});

// Создать новое обращение. Одновременно допускается только одно незакрытое.
support.post("/conversations", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const body = (await c.req.json().catch(() => ({}))) as { subject?: unknown };
  const subject = typeof body.subject === "string" ? body.subject.trim() : "";

  if (!subject || subject.length > SUBJECT_MAX_LENGTH) {
    return c.json({ message: "Укажите тему обращения" }, 400);
  }

  const created = await createConversation(user.id, subject);
  if (!created) {
    return c.json({ message: "У вас уже есть активное обращение" }, 409);
  }

  return c.json({
    id: created.id,
    code: created.code,
    subject: created.subject,
    status: created.status,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
  });
});

// Сообщения конкретного обращения.
support.get("/conversations/:id/messages", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const conversationId = c.req.param("id");
  const owned = await isUserConversation(user.id, conversationId);
  if (!owned) {
    return c.json({ message: "Обращение не найдено" }, 404);
  }

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

  const conversations = await listConversations(user.id, 100);
  const conversation = conversations.find((conv) => conv.id === conversationId);

  return c.json({
    conversation: conversation
      ? {
          id: conversation.id,
          code: conversation.code,
          subject: conversation.subject,
          status: conversation.status,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString(),
        }
      : { id: conversationId, code: "", subject: "Обращение", status: "open", createdAt: "", updatedAt: "" },
    items: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      messageId: m.messageId,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

// Закрыть обращение (кнопка «Закрыть» в треде). Идемпотентно.
support.post("/conversations/:id/close", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const conversationId = c.req.param("id");
  const owned = await isUserConversation(user.id, conversationId);
  if (!owned) {
    return c.json({ message: "Обращение не найдено" }, 404);
  }

  await db
    .update(supportConversation)
    .set({ status: "closed", updatedAt: new Date() })
    .where(eq(supportConversation.id, conversationId));

  const conversations = await listConversations(user.id, 100);
  const conversation = conversations.find((conv) => conv.id === conversationId);

  return c.json({
    id: conversationId,
    code: conversation?.code ?? "",
    subject: conversation?.subject ?? "Обращение",
    status: "closed",
    createdAt: conversation?.createdAt.toISOString() ?? "",
    updatedAt: conversation?.updatedAt.toISOString() ?? "",
  });
});

// Легаси-эндпоинт: активный тред пользователя (старые клиенты).
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

  const conversations = await listConversations(user.id, 100);
  const conversation = conversations.find((conv) => conv.id === conversationId);

  return c.json({
    conversationId,
    conversation: conversation
      ? {
          id: conversation.id,
          code: conversation.code,
          subject: conversation.subject,
          status: conversation.status,
          createdAt: conversation.createdAt.toISOString(),
          updatedAt: conversation.updatedAt.toISOString(),
        }
      : null,
    items: rows.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      messageId: m.messageId,
      createdAt: m.createdAt.toISOString(),
    })),
  });
});

// SSE-поток сообщений оператора. Опциональный conversationId позволяет слушать
// конкретное обращение; без параметра — легаси-активный тред.
support.get("/stream", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const requestedId = c.req.query("conversationId")?.trim() ?? "";
  let conversationId: string;
  if (requestedId) {
    const owned = await isUserConversation(user.id, requestedId);
    if (!owned) {
      return c.json({ message: "Обращение не найдено" }, 404);
    }
    conversationId = requestedId;
  } else {
    conversationId = await getOrCreateConversationId(user.id);
  }
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
