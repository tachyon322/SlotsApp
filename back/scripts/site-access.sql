-- Идемпотентная установка site_access для прода.
--
-- Причина отдельного файла: на проде drizzle-журнал остановился на августе
-- (дальше схема обновлялась push'ем), поэтому `bun run db:migrate` попытается
-- заново применить десятки уже существующих миграций. Этот файл можно
-- запускать повторно: CREATE ... IF NOT EXISTS + ON CONFLICT DO NOTHING.
--
-- Запуск на сервере (после git pull):
--   docker exec -i kazik-db sh -lc 'psql -U "$POSTGRES_USER" -d kazik' \
--     < back/scripts/site-access.sql

CREATE TABLE IF NOT EXISTS "site_access" (
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
  "updated_at" timestamp with time zone NOT NULL,
  CONSTRAINT "site_access_user_id_users_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS "site_access_status_idx" ON "site_access" ("status");
CREATE INDEX IF NOT EXISTS "site_access_locked_at_idx" ON "site_access" ("locked_at");
CREATE INDEX IF NOT EXISTS "site_access_withdrawal_id_idx" ON "site_access" ("withdrawal_id");

-- Backfill: pending-заявки старше 30 дней на момент установки.
INSERT INTO "site_access" (
  "user_id", "status", "reason", "locked_at", "locked_until",
  "withdrawal_id", "amount", "source", "updated_at"
)
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
