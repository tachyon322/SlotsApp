import { Hono, type Context, type Next } from "hono";
import { consumeRateLimit } from "./rateLimit";
import { auth } from "./auth";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

type KeyKind = "ip" | "user";

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

interface Rule {
  name: string;
  match: RegExp;
  window: number;
  max: number;
  keyKind: KeyKind;
  methods?: HttpMethod[];
}

const RULES: Rule[] = [
  {
    name: "quick-auth",
    match: /^\/api\/quick-auth(\/|$)/,
    window: 600,
    max: 10,
    keyKind: "ip",
  },
  {
    name: "wallet-promo",
    match: /^\/api\/wallet\/promo(\/|$)/,
    window: 600,
    max: 10,
    keyKind: "user",
    methods: ["POST"],
  },
  {
    name: "wallet-payment",
    match: /^\/api\/wallet\/payment(\/|$)/,
    window: 600,
    max: 20,
    keyKind: "user",
    methods: ["POST"],
  },
  {
    name: "wallet-withdraw",
    match: /^\/api\/wallet\/withdraw(\/|$)/,
    window: 600,
    max: 5,
    keyKind: "user",
    methods: ["POST"],
  },
  {
    name: "affiliate-auth",
    match: /^\/api\/affiliate\/auth\/(login|register)(\/|$)/,
    window: 600,
    max: 10,
    keyKind: "ip",
  },
  {
    name: "redirect",
    match: /^\/r\/.+/,
    window: 600,
    max: 60,
    keyKind: "ip",
  },
  {
    name: "game-bets",
    match: /^\/api\/(crash|mines|slots|cases|blockblast|minedrop)\//,
    window: 60,
    max: 120,
    keyKind: "user",
    methods: ["POST"],
  },
  {
    name: "support-thread",
    match: /^\/api\/support\/thread(\/|$)/,
    window: 60,
    max: 30,
    keyKind: "user",
  },
  {
    name: "support-stream",
    match: /^\/api\/support\/stream(\/|$)/,
    window: 60,
    max: 30,
    keyKind: "user",
  },
  {
    name: "global",
    match: /^\/api\//,
    window: 60,
    max: 300,
    keyKind: "ip",
  },
];

function clientIp(c: Context): string {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return c.req.header("cf-connecting-ip") || c.req.header("x-real-ip") || "unknown";
}

export async function rateLimitMiddleware(
  c: Context<{ Variables: Variables }>,
  next: Next,
): Promise<Response | void> {
  const path = c.req.path;
  if (path.startsWith("/api/auth")) return next();

  const rule = RULES.find(
    (r) =>
      r.match.test(path) &&
      (!r.methods || r.methods.includes(c.req.method as HttpMethod)),
  );
  if (!rule) return next();

  let key: string;
  const user = c.get("user");
  if (rule.keyKind === "user" && user?.id) {
    key = `u:${user.id}`;
  } else {
    key = `ip:${clientIp(c)}`;
  }

  const result = await consumeRateLimit(`${rule.name}:${key}`, {
    window: rule.window,
    max: rule.max,
  });
  if (!result.allowed) {
    c.header("Retry-After", String(result.retryAfter));
    return c.json({ message: "Слишком много запросов, попробуйте позже" }, 429);
  }
  return next();
}
