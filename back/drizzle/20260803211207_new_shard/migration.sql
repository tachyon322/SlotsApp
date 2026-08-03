CREATE TABLE "blockblast_rounds" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"bet" integer NOT NULL,
	"placements" integer DEFAULT 0 NOT NULL,
	"multiplier" double precision DEFAULT 0 NOT NULL,
	"payout" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cases_rounds" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"bet" integer NOT NULL,
	"case_id" text NOT NULL,
	"lines" integer NOT NULL,
	"line_bet" integer NOT NULL,
	"rarity" text NOT NULL,
	"multiplier" double precision DEFAULT 0 NOT NULL,
	"payout" integer DEFAULT 0 NOT NULL,
	"outcome" text NOT NULL,
	"details" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "promo_activations" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"code" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"status" text DEFAULT 'success' NOT NULL,
	"method" text,
	"details" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "blockblast_rounds_user_id_idx" ON "blockblast_rounds" ("user_id");--> statement-breakpoint
CREATE INDEX "blockblast_rounds_created_at_idx" ON "blockblast_rounds" ("created_at");--> statement-breakpoint
CREATE INDEX "cases_rounds_user_id_idx" ON "cases_rounds" ("user_id");--> statement-breakpoint
CREATE INDEX "cases_rounds_created_at_idx" ON "cases_rounds" ("created_at");--> statement-breakpoint
CREATE INDEX "promo_activations_user_id_idx" ON "promo_activations" ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_activations_user_code_unique" ON "promo_activations" ("user_id","code");--> statement-breakpoint
CREATE INDEX "transactions_user_id_idx" ON "transactions" ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_created_at_idx" ON "transactions" ("created_at");--> statement-breakpoint
CREATE INDEX "transactions_type_idx" ON "transactions" ("type");--> statement-breakpoint
ALTER TABLE "blockblast_rounds" ADD CONSTRAINT "blockblast_rounds_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "cases_rounds" ADD CONSTRAINT "cases_rounds_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "promo_activations" ADD CONSTRAINT "promo_activations_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;