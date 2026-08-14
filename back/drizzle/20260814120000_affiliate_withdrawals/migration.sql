CREATE TABLE IF NOT EXISTS "affiliate_withdrawals" (
	"id" text PRIMARY KEY NOT NULL,
	"partner_id" text NOT NULL,
	"amount" integer NOT NULL,
	"method" text NOT NULL,
	"rate" double precision,
	"usdt_amount" double precision,
	"fee" integer DEFAULT 0 NOT NULL,
	"bank" text,
	"requisites" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"comment" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "affiliate_withdrawals" ADD CONSTRAINT "affiliate_withdrawals_partner_id_affiliate_partners_id_fk" FOREIGN KEY ("partner_id") REFERENCES "affiliate_partners"("id") ON DELETE cascade;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "affiliate_withdrawals_partner_created_idx" ON "affiliate_withdrawals" ("partner_id","created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "affiliate_withdrawals_status_idx" ON "affiliate_withdrawals" ("status");
