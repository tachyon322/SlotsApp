import { Hono } from "hono";
import { supportBuffer } from "../lib/supportBuffer";
import { auth } from "../lib/auth";

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

export default support;
