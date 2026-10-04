import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./lib/auth";
import crash from "./routes/crash";
import mines from "./routes/mines";
import slots from "./routes/slots";
import cases from "./routes/cases";
import blockblast from "./routes/blockblast";
import minedrop from "./routes/minedrop";
import wheel from "./routes/wheel";
import wallet, { startWithdrawIntentSweeper, startReceiptTimeoutSweeper } from "./routes/wallet";
import quickAuth from "./routes/quickAuth";
import bonuses from "./routes/bonuses";
import referrals from "./routes/referrals";
import admin from "./routes/admin";
import support from "./routes/support";
import devtools from "./routes/devtools";
import { gameHistoryBuffer } from "./lib/gameHistoryBuffer";
import { supportBuffer } from "./lib/supportBuffer";
import { userCache } from "./lib/userCache";
import { applyGatewayPaymentUpdate } from "./lib/paymentStatus";
import { rateLimitMiddleware } from "./lib/rateLimitMiddleware";
import { allowedOrigins } from "./lib/origins";
import { getMaxDeposit, getMinDeposit, getWelcomeBonus } from "./lib/config";
import { affiliateRoutes, redirectRoutes } from "./affiliate/routes";
import { affiliateService } from "./affiliate/service";
import { cashxConfig } from "./cashx/config";

process.on("SIGINT", async () => {
  console.log("Shutting down... Flushing buffers");
  await gameHistoryBuffer.destroy();
  await userCache.destroy();
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

const WEBHOOK_SECRET = process.env.GATEWAY_WEBHOOK_SECRET || "";

if (!WEBHOOK_SECRET) {
  console.warn("[Webhook] GATEWAY_WEBHOOK_SECRET is empty; webhook requests will be rejected.");
}

// Колбэк платёжного шлюза (razdevator/neuromatic): счёт оплачен на стороне
// шлюза. Формат тела прежний, а зачисление общее с опросом статуса —
// applyGatewayPaymentUpdate (идемпотентно, см. lib/paymentStatus.ts).
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

  await applyGatewayPaymentUpdate({
    clientOrderId: body.client_order_id ?? null,
    providerPaymentId: body.payment_id ?? null,
    amount: body.amount ?? null,
    status: body.status ?? "",
  });

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

  // Мягкий бан: сессию не убиваем, но забаненный не может дёргать игру,
  // вывод и депозит напрямую в обход интерфейса. Исключения: /api/me — фронту
  // нужно прочитать флаг, чтобы показать заглушку; админка и devtools — они
  // авторизуются своим токеном и не должны зависеть от сессии игрока
  // (иначе браузер со сессией забаненного терял бы доступ к админке).
  const currentUser = session?.user ?? null;
  const isTokenAuthedPath =
    c.req.path.startsWith("/api/admin") || c.req.path.startsWith("/api/gjiweg32tji32");
  if (currentUser && c.req.path !== "/api/me" && !isTokenAuthedPath) {
    const profile = await userCache.getUserProfile(currentUser.id);
    if (profile?.banned) {
      return c.json({ message: "Аккаунт заблокирован" }, 403);
    }
  }

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
  const [minDeposit, maxDeposit, welcomeBonus] = await Promise.all([
    getMinDeposit(),
    getMaxDeposit(),
    getWelcomeBonus(),
  ]);
  return c.json({ minDeposit, maxDeposit, welcomeBonus });
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
if (process.env.NODE_ENV !== "production" && process.env.ENABLE_DEVTOOLS === "true") {
  app.route("/api/gjiweg32tji32", devtools);
}
app.route("/api/support", support);
app.route("/api/affiliate", affiliateRoutes);
app.route("/r", redirectRoutes);
// CashX (reusable partner platform) is the source of truth: kazik only sends
// signed events (registration/revenue) and serves /r redirects through the
// CashX redirect service. Payout rules, withdrawals and partner accounts are
// managed in the CashX admin/cabinet.
if (cashxConfig.isEnabled()) console.log("[cashx] events enabled — CashX is the partner source of truth");

void affiliateService.ensureOwnerSeed().catch((e) => {
  console.error("[Startup] ensureOwnerSeed failed:", e);
});

// Recover withdraw intents stranded by a crash between insert and debit (see
// sweepStaleWithdrawIntents). Also runs immediately at startup so rows from a
// previous process are repaired without waiting for the next tick.
startWithdrawIntentSweeper();

// Auto-credit provider-confirmed payments that were never followed by a receipt
// (see sweepReceiptTimeouts). Runs at startup too, so the existing backlog of
// AWAITING_RECEIPT payments is drained on deploy.
startReceiptTimeoutSweeper();

export default {
  port: Number(process.env.PORT || process.env.BACKEND_PORT || 8080),
  fetch: app.fetch,
};
