import { Hono } from "hono";
import { cors } from "hono/cors";
import { auth } from "./lib/auth";
import crash from "./routes/crash";
import mines from "./routes/mines";
import slots from "./routes/slots";
import cases from "./routes/cases";
import blockblast from "./routes/blockblast";
import minedrop from "./routes/minedrop";
import wallet from "./routes/wallet";
import { gameHistoryBuffer } from "./lib/gameHistoryBuffer";
import { userCache } from "./lib/userCache";

process.on("SIGINT", async () => {
  console.log("Shutting down... Flushing buffers");
  await gameHistoryBuffer.destroy();
  await userCache.destroy();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  console.log("Shutting down... Flushing buffers");
  await gameHistoryBuffer.destroy();
  await userCache.destroy();
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

app.get("/api/me", async (c) => {
  const user = c.get("user");
  if (!user) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const cachedProfile = await userCache.getUserProfile(user.id);
  return c.json({ user: cachedProfile || user });
});

app.route("/api/crash", crash);
app.route("/api/mines", mines);
app.route("/api/slots", slots);
app.route("/api/cases", cases);
app.route("/api/blockblast", blockblast);
app.route("/api/minedrop", minedrop);
app.route("/api/wallet", wallet);


export default {
  port: 8080,
  fetch: app.fetch,
};
