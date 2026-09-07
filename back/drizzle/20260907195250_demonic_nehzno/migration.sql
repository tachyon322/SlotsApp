ALTER TABLE "support_conversations" ADD COLUMN "subject" text DEFAULT 'Обращение' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_conversations" ADD COLUMN "status" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "support_conversations" ADD COLUMN "code" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Бэкфилл номеров обращений для существующих тредов (детерминированно из id).
UPDATE "support_conversations"
SET "code" = 'T-' || lpad(((abs(hashtext("id")) % 900000000) + 100000000)::text, 9, '0')
WHERE "code" = '';
