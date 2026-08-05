import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "../db";
import { schema } from "../db/schema";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 6,
  },
  user: {
    additionalFields: {
      balance: { type: "number", required: false, defaultValue: 0, input: false },
      level: { type: "number", required: false, defaultValue: 1, input: false },
      xp: { type: "number", required: false, defaultValue: 0, input: false },
      verifiedForPayment: { type: "boolean", required: false, defaultValue: false, input: false },
      premiumUntil: { type: "date", required: false, input: false },
    },
  },
  baseURL: process.env.BETTER_AUTH_URL,
  secret: process.env.BETTER_AUTH_SECRET,
  trustedOrigins: [process.env.FRONTEND_ORIGIN!],
  advanced: {
    cookiePrefix: "kazik",
  },
});
