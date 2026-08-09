-- Баланс партнёра: комиссия с депозитов приглашённых начисляется на balance
-- (snapshot процента на момент депозита), история начислений — в ledger.

ALTER TABLE "affiliate_partners" ADD COLUMN "balance" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE "affiliate_transactions" (
	"id" text PRIMARY KEY,
	"partner_id" text NOT NULL,
	"type" text DEFAULT 'commission' NOT NULL,
	"amount" integer NOT NULL,
	"ref_user_id" text,
	"deposit_amount" integer,
	"commission_percent" double precision,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "affiliate_transactions_partner_created_idx" ON "affiliate_transactions" ("partner_id","created_at");
--> statement-breakpoint
CREATE INDEX "affiliate_transactions_ref_user_id_idx" ON "affiliate_transactions" ("ref_user_id");
--> statement-breakpoint
ALTER TABLE "affiliate_transactions" ADD CONSTRAINT "affiliate_transactions_partner_id_affiliate_partners_id_fkey" FOREIGN KEY ("partner_id") REFERENCES "affiliate_partners"("id") ON DELETE CASCADE;
