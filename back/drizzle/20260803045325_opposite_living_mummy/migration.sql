CREATE TABLE "slots_rounds" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"bet" integer NOT NULL,
	"mode" text NOT NULL,
	"lines" integer NOT NULL,
	"line_bet" integer NOT NULL,
	"symbols" text NOT NULL,
	"win_lines" text NOT NULL,
	"multiplier" double precision DEFAULT 0 NOT NULL,
	"payout" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "slots_rounds_user_id_idx" ON "slots_rounds" ("user_id");--> statement-breakpoint
CREATE INDEX "slots_rounds_created_at_idx" ON "slots_rounds" ("created_at");--> statement-breakpoint
ALTER TABLE "slots_rounds" ADD CONSTRAINT "slots_rounds_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;