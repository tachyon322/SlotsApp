ALTER TABLE "affiliate_partners" ADD COLUMN "commission_percent" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
DROP TABLE "affiliate_user_commissions";
