CREATE TABLE "user_referrals" (
	"id" text PRIMARY KEY,
	"referrer_id" text NOT NULL,
	"referred_id" text NOT NULL,
	"reward_amount" integer DEFAULT 500 NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_referral_codes" (
	"user_id" text PRIMARY KEY,
	"code" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_referrals_referred_id_unique" ON "user_referrals" ("referred_id");--> statement-breakpoint
CREATE INDEX "user_referrals_referrer_id_idx" ON "user_referrals" ("referrer_id");--> statement-breakpoint
CREATE INDEX "user_referrals_created_at_idx" ON "user_referrals" ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_referral_codes_code_unique" ON "user_referral_codes" ("code");--> statement-breakpoint
ALTER TABLE "user_referrals" ADD CONSTRAINT "user_referrals_referrer_id_users_id_fkey" FOREIGN KEY ("referrer_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_referrals" ADD CONSTRAINT "user_referrals_referred_id_users_id_fkey" FOREIGN KEY ("referred_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "user_referral_codes" ADD CONSTRAINT "user_referral_codes_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;