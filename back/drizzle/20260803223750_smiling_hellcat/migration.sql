CREATE TABLE "minedrop_rounds" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"bet" integer NOT NULL,
	"multiplier" double precision DEFAULT 0 NOT NULL,
	"payout" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"details" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "minedrop_rounds_user_id_idx" ON "minedrop_rounds" ("user_id");--> statement-breakpoint
CREATE INDEX "minedrop_rounds_created_at_idx" ON "minedrop_rounds" ("created_at");--> statement-breakpoint
ALTER TABLE "minedrop_rounds" ADD CONSTRAINT "minedrop_rounds_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;