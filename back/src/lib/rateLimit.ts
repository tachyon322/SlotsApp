import { redis } from "./redis";

export interface RateLimitRule {
  window: number;
  max: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfter: number;
  remaining: number;
}

export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
): Promise<RateLimitResult> {
  const rlKey = `rl:${key}`;
  try {
    const count = await redis.incr(rlKey);
    if (count === 1) {
      await redis.expire(rlKey, rule.window);
    }
    if (count > rule.max) {
      const ttl = await redis.ttl(rlKey);
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
