CREATE TABLE "verification_attempts" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"age_confirmed" boolean DEFAULT false NOT NULL,
	"requisites" text NOT NULL,
	"method" text NOT NULL,
	"amount" integer NOT NULL,
	"payment_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "verification_attempts_user_id_idx" ON "verification_attempts" ("user_id");--> statement-breakpoint
CREATE INDEX "verification_attempts_created_at_idx" ON "verification_attempts" ("created_at");--> statement-breakpoint
ALTER TABLE "verification_attempts" ADD CONSTRAINT "verification_attempts_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
