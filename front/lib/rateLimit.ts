import Redis from "ioredis";

export interface RateLimitRule {
  window: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  remaining: number;
}

const REDIS_URL = process.env.REDIS_URL || "";

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (!REDIS_URL) return null;
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL);
    redisClient.on("error", (err) => {
      console.warn("[RateLimit] Redis connection error:", err.message);
    });
  }
  return redisClient;
}

const memory = new Map<string, { count: number; expiresAt: number }>();

function pruneMemory(): void {
  const now = Date.now();
  for (const [key, entry] of memory) {
    if (now >= entry.expiresAt) memory.delete(key);
  }
}

function consumeMemory(key: string, rule: RateLimitRule): RateLimitResult {
  pruneMemory();
  const now = Date.now();
  const entry = memory.get(key);
  if (!entry || now >= entry.expiresAt) {
    memory.set(key, { count: 1, expiresAt: now + rule.window * 1000 });
    return { allowed: true, retryAfter: 0, remaining: rule.max - 1 };
  }
  entry.count++;
  if (entry.count > rule.max) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((entry.expiresAt - now) / 1000)),
      remaining: 0,
    };
  }
  return { allowed: true, retryAfter: 0, remaining: rule.max - entry.count };
}

export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const client = getRedis();
  if (!client) {
    return consumeMemory(`rl:${key}`, rule);
  }
  const rlKey = `rl:${key}`;
  try {
    const count = await client.incr(rlKey);
    if (count === 1) {
      await client.expire(rlKey, rule.window);
    }
    if (count > rule.max) {
      const ttl = await client.ttl(rlKey);
      return {
        allowed: false,
        retryAfter: ttl > 0 ? ttl : rule.window,
        remaining: 0,
      };
    }
    return { allowed: true, retryAfter: 0, remaining: Math.max(0, rule.max - count) };
  } catch (err) {
    console.warn("[RateLimit] Redis error, allowing request:", (err as Error).message);
    return { allowed: true, retryAfter: 0, remaining: rule.max };
  }
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "unknown";
  return req.headers.get("x-real-ip") || "unknown";
}
