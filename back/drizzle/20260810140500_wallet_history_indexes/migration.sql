CREATE INDEX IF NOT EXISTS "blockblast_rounds_user_created_id_idx" ON "blockblast_rounds" ("user_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "cases_rounds_user_created_id_idx" ON "cases_rounds" ("user_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "crash_rounds_user_created_id_idx" ON "crash_rounds" ("user_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "minedrop_rounds_user_created_id_idx" ON "minedrop_rounds" ("user_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "mines_rounds_user_created_id_idx" ON "mines_rounds" ("user_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "slots_rounds_user_created_id_idx" ON "slots_rounds" ("user_id", "created_at", "id");
CREATE INDEX IF NOT EXISTS "transactions_user_created_id_idx" ON "transactions" ("user_id", "created_at", "id");
