import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "../db";
import { affiliateAuthSchema } from "./schema";
import { redisSecondaryStorage } from "../lib/authStorage";

/**
 * Separate better-auth instance for affiliate partners (webmasters).
 * Uses its own user/session/account/verification tables prefixed with
 * `affiliate_partner_*`, so it never touches the casino core auth.
 */
export const partnerAuth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema: affiliateAuthSchema }),
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.FRONTEND_ORIGIN!],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 6,
    autoSignIn: false,
  },
  secondaryStorage: redisSecondaryStorage,
  rateLimit: {
    enabled: true,
    window: 60,
    max: 60,
    storage: "secondary-storage",
  },
  user: {
    additionalFields: {
      authToken: { type: "string", required: false, input: false },
      isOwner: { type: "boolean", required: false, defaultValue: false, input: false },
      isActive: { type: "boolean", required: false, defaultValue: true, input: false },
      comment: { type: "string", required: false, input: false },
    },
  },
  advanced: {
    cookiePrefix: "kazik_partner",
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for", "x-real-ip"],
    },
  },
});
