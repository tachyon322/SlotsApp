import { Hono } from "hono";
import { cors } from "hono/cors";
import { eq } from "drizzle-orm";
import { auth } from "./lib/auth";
import crash from "./routes/crash";
import mines from "./routes/mines";
import slots from "./routes/slots";
import cases from "./routes/cases";
import blockblast from "./routes/blockblast";
import minedrop from "./routes/minedrop";
import wheel from "./routes/wheel";
import wallet from "./routes/wallet";
import quickAuth from "./routes/quickAuth";
import bonuses from "./routes/bonuses";
import admin from "./routes/admin";
import { gameHistoryBuffer } from "./lib/gameHistoryBuffer";
import { userCache } from "./lib/userCache";
import { rateLimitMiddleware } from "./lib/rateLimitMiddleware";
import { getMinDeposit, getWelcomeBonus } from "./lib/config";
import { db } from "./db";
import { user as userTable, payment as paymentTable, transaction } from "./db/schema";
import { affiliateRoutes, redirectRoutes } from "./affiliate/routes";
import { affiliateService } from "./affiliate/service";
import { affiliateCounters } from "./lib/affiliateCounters";
import type { ExpressAppPaymentStatus } from "./lib/expressapp";

process.on("SIGINT", async () => {
  console.log("Shutting down... Flushing buffers");
  await gameHistoryBuffer.destroy();
  await userCache.destroy();
  await affiliateCounters.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down... Flushing buffers");
  await gameHistoryBuffer.destroy();
  await userCache.destroy();
  await affiliateCounters.destroy();
  process.exit(0);
});

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const app = new Hono<{ Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: process.env.FRONTEND_ORIGIN,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true,
  }),
);

app.get("/health", (c) => c.json({ status: "ok" }));

const WEBHOOK_SECRET = process.env.EXPRESSAPP_WEBHOOK_SECRET || "";
const PREMIUM_LIFETIME = "2099-12-31T23:59:59.000Z";

app.post("/webhook", async (c) => {
  const authHeader = c.req.header("authorization") || "";
  if (authHeader !== `Bearer ${WEBHOOK_SECRET}`) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    payment_id?: string;
    client_order_id?: string;
    amount?: string;
    status?: string;
  };

  const status = body.status as ExpressAppPaymentStatus;
  if (!body.client_order_id && !body.payment_id) {
    return c.json({ message: "ok" }, 200);
  }

  const payment = await db
    .select()
    .from(paymentTable)
    .where(
      body.client_order_id
        ? eq(paymentTable.id, body.client_order_id)
        : eq(paymentTable.paymentId, body.payment_id || ""),
    );

  const row = payment[0];
  if (!row) {
    return c.json({ message: "ok" }, 200);
  }

  if (status === "PAID" && !row.credited) {
    // Atomically claim the credit to guard against duplicate webhook delivery.
    const claimed = await db
      .update(paymentTable)
      .set({ credited: true, status: "PAID", updatedAt: new Date() })
      .where(eq(paymentTable.id, row.id))
      .returning({ id: paymentTable.id });

    if (claimed.length > 0) {
      if (row.purpose === "premium") {
        await db
          .update(userTable)
          .set({
            premiumUntil: new Date(PREMIUM_LIFETIME),
            updatedAt: new Date(),
          })
          .where(eq(userTable.id, row.userId));
      } else if (row.purpose !== "verification") {
        const amount = Math.floor(Number(body.amount) || row.amount);
        const bonusAmount = amount;
        const totalAmount = amount + bonusAmount;

        await userCache.adjustUserBalance(row.userId, totalAmount);

        const now = new Date();
        await db.insert(transaction).values([
          {
            id: crypto.randomUUID(),
            userId: row.userId,
            type: "deposit",
            amount,
            status: "success",
            method: row.method === "card" ? "Банковская карта" : "СБП",
            details: "Пополнение баланса",
            createdAt: now,
          },
          {
            id: crypto.randomUUID(),
            userId: row.userId,
            type: "bonus",
            amount: bonusAmount,
            status: "success",
            method: "Бонус 100%",
            details: "Бонус за депозит",
            createdAt: new Date(now.getTime() + 10),
          },
        ]);

        // Attribute the deposit to the user's affiliate source (if any) in Redis.
        void affiliateCounters.recordDeposit(row.userId, amount, now);
      }
    }
  } else if (status !== row.status) {
    await db
      .update(paymentTable)
      .set({ status, updatedAt: new Date() })
      .where(eq(paymentTable.id, row.id));
  }

  return c.json({ message: "ok" }, 200);
});

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.use("/api/*", async (c, next) => {
  if (c.req.path.startsWith("/api/auth")) {
    return next();
  }

  const session = await auth.api.getSession({ headers: c.req.raw.headers });

  c.set("user", session?.user ?? null);
  c.set("session", session?.session ?? null);

  await next();
});

app.use("/api/*", rateLimitMiddleware);
app.use("/r/*", rateLimitMiddleware);

app.get("/api/me", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const cachedProfile = await userCache.getUserProfile(user.id);
  return c.json({ user: cachedProfile || user });
});

app.get("/api/config", async (c) => {
  const [minDeposit, welcomeBonus] = await Promise.all([getMinDeposit(), getWelcomeBonus()]);
  return c.json({ minDeposit, welcomeBonus });
});

app.route("/api/crash", crash);
app.route("/api/mines", mines);
app.route("/api/slots", slots);
app.route("/api/cases", cases);
app.route("/api/blockblast", blockblast);
app.route("/api/minedrop", minedrop);
app.route("/api/wheel", wheel);
app.route("/api/wallet", wallet);
app.route("/api/quick-auth", quickAuth);
app.route("/api/bonuses", bonuses);
app.route("/api/admin", admin);
app.route("/api/affiliate", affiliateRoutes);
app.route("/r", redirectRoutes);

void affiliateService.ensureOwnerSeed();


export default {
  port: 8080,
  fetch: app.fetch,
};
