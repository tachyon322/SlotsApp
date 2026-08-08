import type { SecondaryStorage } from "@better-auth/core/db";
import { redis } from "./redis";

function jsonParse(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export const redisSecondaryStorage: SecondaryStorage = {
  get: async (key) => {
    const value = await redis.get(key);
    return jsonParse(value);
  },
  set: async (key, value, ttl) => {
    if (ttl) {
      await redis.set(key, value, "EX", ttl);
    } else {
      await redis.set(key, value);
    }
  },
  delete: async (key) => {
    await redis.del(key);
  },
  increment: async (key, ttl) => {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, ttl);
    }
    return count;
  },
};
