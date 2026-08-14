import { Hono } from "hono";
import { cors } from "hono/cors";
import { and, eq } from "drizzle-orm";
import { auth } from "./lib/auth";
import crash from "./routes/crash";
import mines from "./routes/mines";
import slots from "./routes/slots";
import cases from "./routes/cases";
import blockblast from "./routes/blockblast";
import minedrop from "./routes/minedrop";
import wheel from "./routes/wheel";
import wallet, { startWithdrawIntentSweeper } from "./routes/wallet";
import quickAuth from "./routes/quickAuth";
import bonuses from "./routes/bonuses";
import referrals from "./routes/referrals";
import admin from "./routes/admin";
import support from "./routes/support";
import devtools from "./routes/devtools";
import { gameHistoryBuffer } from "./lib/gameHistoryBuffer";
import { supportBuffer } from "./lib/supportBuffer";
import { userCache } from "./lib/userCache";
import { creditDeposit } from "./lib/depositCredit";
import { rateLimitMiddleware } from "./lib/rateLimitMiddleware";
import { allowedOrigins } from "./lib/origins";
import { getMinDeposit, getWelcomeBonus } from "./lib/config";
import { db } from "./db";
import { user as userTable, payment as paymentTable } from "./db/schema";
import { affiliateRoutes, redirectRoutes } from "./affiliate/routes";
import { affiliateService } from "./affiliate/service";
import { affiliateCounters } from "./lib/affiliateCounters";
import type { ExpressAppPaymentStatus } from "./lib/expressapp";

process.on("SIGINT", async () => {
  console.log("Shutting down... Flushing buffers");
  await gameHistoryBuffer.destroy();
  await userCache.destroy();
  await affiliateCounters.destroy();
  await supportBuffer.destroy();
  process.exit(0);
});

// Bun crashes on unhandled rejections by default. Every fire-and-forget call in
// the money paths now has its own .catch(), so a rejection reaching here is a
// genuine bug worth surfacing in logs — but it must not crash the process mid
// money flow. Log only; crash-safe recovery is guaranteed by the intent-first
// withdraw design + partial unique index, not by keeping a half-broken process
// alive (which is why uncaughtException is deliberately NOT handled: a sync
// exception means the process state is undefined and must restart).
process.on("unhandledRejection", (reason) => {
  console.error("[Process] Unhandled promise rejection:", reason);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down... Flushing buffers");
  await gameHistoryBuffer.destroy();
  await userCache.destroy();
  await affiliateCounters.destroy();
  await supportBuffer.destroy();
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
    origin: allowedOrigins(),
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

if (!WEBHOOK_SECRET) {
  console.warn("[Webhook] EXPRESSAPP_WEBHOOK_SECRET is empty; webhook requests will be rejected.");
}

// Once a payment reaches one of these states it must not regress. For deposits,
// PAID now means "provider confirmed AND credited", AWAITING_RECEIPT means
// "provider confirmed, waiting for the receipt to be attached".
const PAYMENT_STABLE_STATUSES = new Set(["AWAITING_RECEIPT", "PAID"]);

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

  console.log(
    "[Webhook] received:",
    JSON.stringify({
      payment_id: body.payment_id,
      client_order_id: body.client_order_id,
      status: body.status,
      amount: body.amount,
    }),
  );

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
    console.log("[Webhook] payment not found for", body.client_order_id || body.payment_id);
    return c.json({ message: "ok" }, 200);
  }

  console.log(
    "[Webhook] matched payment:",
    JSON.stringify({
      id: row.id,
      purpose: row.purpose,
      status: row.status,
      credited: row.credited,
      hasReceipt: Boolean(row.receiptUrl),
    }),
  );

  if (status === "PAID" && !row.credited) {
    if (row.purpose === "premium") {
      // Atomically claim the credit to guard against duplicate webhook delivery.
      const now = new Date();
      const claimed = await db
        .update(paymentTable)
        .set({ credited: true, status: "PAID", updatedAt: now })
        .where(and(eq(paymentTable.id, row.id), eq(paymentTable.credited, false)))
        .returning({ id: paymentTable.id });

      if (claimed.length > 0) {
        await db
          .update(userTable)
          .set({
            premiumUntil: new Date(PREMIUM_LIFETIME),
            updatedAt: new Date(),
          })
          .where(eq(userTable.id, row.userId));
        const amount = Math.floor(Number(body.amount) || row.amount);
        void affiliateService.creditDepositCommission(row.userId, amount, now).catch((e) => {
          console.error("[Webhook] premium commission credit failed:", e);
        });
        console.log("[Webhook] premium payment credited commission", row.id);
      }
    } else if (row.purpose === "verification") {
      // Verification is just a paid gate — mark it credited, nothing is deposited.
      // The referring partner still earns commission on this paid funnel step.
      const now = new Date();
      const claimed = await db
        .update(paymentTable)
        .set({ credited: true, status: "PAID", updatedAt: now })
        .where(and(eq(paymentTable.id, row.id), eq(paymentTable.credited, false)))
        .returning({ id: paymentTable.id });

      if (claimed.length > 0) {
        const amount = Math.floor(Number(body.amount) || row.amount);
        void affiliateService.creditDepositCommission(row.userId, amount, now).catch((e) => {
          console.error("[Webhook] verification commission credit failed:", e);
        });
        console.log("[Webhook] verification payment credited commission", row.id);
      }
    } else {
      // Deposit: credit automatically once the provider confirms PAID. The
      // receipt upload is disabled — the user pays and the balance is credited
      // directly, no manual confirmation step.
      const now = new Date();
      const claimed = await db
        .update(paymentTable)
        .set({ credited: true, status: "PAID", updatedAt: now })
        .where(
          and(
            eq(paymentTable.id, row.id),
            eq(paymentTable.credited, false),
          ),
        )
        .returning({ id: paymentTable.id });

      if (claimed.length > 0) {
        const amount = Math.floor(Number(body.amount) || row.amount);
        const method = row.method === "card" ? "Банковская карта" : "СБП";
        try {
          await creditDeposit(row.userId, amount, method, now);
          console.log("[Webhook] deposit credited", row.id);
        } catch (e) {
          // creditDeposit credits the balance BEFORE recording anything, so if it
          // throws here nothing was credited yet (insert failures are caught inside
          // and only logged). Revert the claim so the provider's retry re-runs the
          // whole credit instead of being silently swallowed.
          console.error("[Webhook] deposit credit failed, reverting claim:", row.id, (e as Error).message);
          await db
            .update(paymentTable)
            .set({ credited: false, status: "PENDING", updatedAt: new Date() })
            .where(and(eq(paymentTable.id, row.id), eq(paymentTable.credited, true)))
            .catch(() => {});
          throw e;
        }
      }

      // ==== ОТКЛЮЧЕНО: зачисление по чеку ====
      // // Deposit: never credit automatically. If a receipt was already attached,
      // // credit immediately; otherwise wait in AWAITING_RECEIPT until it is.
      // const now = new Date();
      // if (row.receiptUrl) {
      //   const claimed = await db
      //     .update(paymentTable)
      //     .set({ credited: true, status: "PAID", updatedAt: now })
      //     .where(
      //       and(
      //         eq(paymentTable.id, row.id),
      //         eq(paymentTable.credited, false),
      //       ),
      //     )
      //     .returning({ id: paymentTable.id });
      //
      //   if (claimed.length > 0) {
      //     const amount = Math.floor(Number(body.amount) || row.amount);
      //     const method = row.method === "card" ? "Банковская карта" : "СБП";
      //     await creditDeposit(row.userId, amount, method, now);
      //     console.log("[Webhook] deposit credited with receipt", row.id);
      //   }
      // } else {
      //   // Atomic claim so only the first PAID webhook transitions the payment.
      //   // Guard on credited (not status) so a provider-confirmed payment always
      //   // lands in AWAITING_RECEIPT even if the status endpoint has already
      //   // written an intermediate state like CONFIRMED_BY_USER.
      //   const claimed = await db
      //     .update(paymentTable)
      //     .set({ status: "AWAITING_RECEIPT", updatedAt: now })
      //     .where(
      //       and(
      //         eq(paymentTable.id, row.id),
      //         eq(paymentTable.credited, false),
      //       ),
      //     )
      //     .returning({ id: paymentTable.id });
      //   if (claimed.length > 0) {
      //     console.log("[Webhook] deposit waiting for receipt", row.id);
      //   }
      // }
    }
  } else if (status !== row.status && !PAYMENT_STABLE_STATUSES.has(row.status)) {
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
app.route("/api/referrals", referrals);
app.route("/api/admin", admin);
app.route("/api/support", support);
app.route("/api/gjiweg32tji32", devtools);
app.route("/api/affiliate", affiliateRoutes);
app.route("/r", redirectRoutes);

void affiliateService.ensureOwnerSeed().catch((e) => {
  console.error("[Startup] ensureOwnerSeed failed:", e);
});

// Recover withdraw intents stranded by a crash between insert and debit (see
// sweepStaleWithdrawIntents). Also runs immediately at startup so rows from a
// previous process are repaired without waiting for the next tick.
startWithdrawIntentSweeper();


export default {
  port: 8080,
  fetch: app.fetch,
};
