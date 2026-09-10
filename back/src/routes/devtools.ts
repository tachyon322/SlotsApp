import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "../lib/auth";
import { redis } from "../lib/redis";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const devtools = new Hono<{ Variables: Variables }>();

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

devtools.get("/redis/check", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const startedAt = Date.now();
  const steps: { name: string; ok: boolean; ms: number; detail?: string }[] = [];
  let error: string | null = null;

  const run = async (
    name: string,
    fn: () => Promise<unknown>,
    detail?: (result: unknown) => string,
  ) => {
    const t = Date.now();
    try {
      const result = await fn();
      steps.push({
        name,
        ok: true,
        ms: Date.now() - t,
        detail: detail ? detail(result) : undefined,
      });
    } catch (err) {
      steps.push({ name, ok: false, ms: Date.now() - t, detail: (err as Error).message });
    }
  };

  const key = `devtool:redis:${crypto.randomUUID()}`;

  await run("PING", () => redis.ping(), (r) => String(r));
  await run("SET", () => redis.set(key, "ok"), () => key);
  await run("GET", () => redis.get(key), (r) => String(r ?? "null"));
  await run(
    "INFO",
    () => redis.info("server"),
    (r) => {
      const match = /redis_version:([^\r\n]+)/.exec(String(r));
      return (match?.[1] ?? "unknown").trim();
    },
  );
  await run("TTL", () => redis.pexpire(key, 10000).then(() => redis.pttl(key)), (r) => `${r}ms`);
  await run("DEL", () => redis.del(key), () => key);

  const ok = steps.every((s) => s.ok);
  if (!ok) {
    const failed = steps.find((s) => !s.ok);
    error = failed?.detail ?? "Redis check failed";
  }

  return c.json({
    ok,
    steps,
    totalMs: Date.now() - startedAt,
    error,
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  });
});

export default devtools;
