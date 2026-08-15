-- Роль «админ»: владелец может выдавать её партнёрам, админы видят
-- список всех партнёров с балансами и игроков (только чтение).

ALTER TABLE "affiliate_partners" ADD COLUMN "is_admin" boolean DEFAULT false NOT NULL;
