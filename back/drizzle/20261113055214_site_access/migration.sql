CREATE TABLE "site_access" (
	"user_id" text PRIMARY KEY,
	"status" text DEFAULT 'locked' NOT NULL,
	"reason" text NOT NULL,
	"locked_at" timestamp with time zone NOT NULL,
	"locked_until" timestamp with time zone,
	"withdrawal_id" text,
	"amount" integer,
	"source" text DEFAULT 'auto' NOT NULL,
	"unlocked_at" timestamp with time zone,
	"unlocked_by" text,
	"unlock_reason" text,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "site_access_status_idx" ON "site_access" ("status");--> statement-breakpoint
CREATE INDEX "site_access_locked_at_idx" ON "site_access" ("locked_at");--> statement-breakpoint
CREATE INDEX "site_access_withdrawal_id_idx" ON "site_access" ("withdrawal_id");--> statement-breakpoint
ALTER TABLE "site_access" ADD CONSTRAINT "site_access_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Защёлка задним числом: все, у кого pending-заявка на вывод старше 30 дней
-- на момент внедрения, сразу считаются заблокированными. locked_at — момент,
-- когда истёк срок заявки (а не момент миграции), чтобы в админке была
-- корректная дата.
INSERT INTO "site_access" ("user_id", "status", "reason", "locked_at", "locked_until", "withdrawal_id", "amount", "source", "updated_at")
SELECT
  t."user_id",
  'locked',
  'withdrawal_expired',
  t."created_at" + interval '30 days',
  NULL,
  t."id",
  t."amount",
  'auto',
  now()
FROM "transactions" t
WHERE t."type" = 'withdrawal'
  AND t."status" = 'pending'
  AND t."created_at" < now() - interval '30 days'
ON CONFLICT ("user_id") DO NOTHING;