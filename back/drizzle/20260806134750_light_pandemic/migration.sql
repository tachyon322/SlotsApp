CREATE TABLE "achievement_claims" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"achievement_id" text NOT NULL,
	"amount" integer NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_claims" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "challenge_claims" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"date" text NOT NULL,
	"amount" integer NOT NULL,
	"claimed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "purpose" text DEFAULT 'deposit' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "verified_for_payment" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "premium_until" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "achievement_claims_user_achievement_unique" ON "achievement_claims" ("user_id","achievement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bonus_claims_user_type_unique" ON "bonus_claims" ("user_id","type");--> statement-breakpoint
CREATE UNIQUE INDEX "challenge_claims_user_challenge_date_unique" ON "challenge_claims" ("user_id","challenge_id","date");--> statement-breakpoint
ALTER TABLE "achievement_claims" ADD CONSTRAINT "achievement_claims_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "bonus_claims" ADD CONSTRAINT "bonus_claims_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "challenge_claims" ADD CONSTRAINT "challenge_claims_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;