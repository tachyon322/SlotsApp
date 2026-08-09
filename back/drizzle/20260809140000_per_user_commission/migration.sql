-- Комиссия партнёра теперь привязана к конкретному пользователю (affiliate_user_commissions),
-- а не к потоку (affiliate_groups.commission_percent).

CREATE TABLE "affiliate_user_commissions" (
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL,
	"commission_percent" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "affiliate_user_commissions_user_id_unique" ON "affiliate_user_commissions" ("user_id");
--> statement-breakpoint
CREATE INDEX "affiliate_user_commissions_created_at_idx" ON "affiliate_user_commissions" ("created_at");
--> statement-breakpoint
ALTER TABLE "affiliate_groups" DROP COLUMN "commission_percent";
