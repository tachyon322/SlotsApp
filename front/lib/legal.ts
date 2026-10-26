/**
 * Единый источник данных для юридических документов (Пользовательское
 * соглашение, Политика конфиденциальности) и ссылок на них.
 *
 * Правило: контакты, название сервиса и дата редакции берутся ТОЛЬКО отсюда.
 * Если значение неизвестно — оставляем пустую строку: блок контакта не
 * рендерится, и в документе не появляется вымышленный адрес.
 */

/** Полное название сервиса в документах. */
export const SERVICE_NAME = "STARX GAMES";

/** Короткое название (бренд в тексте документов). */
export const SERVICE_SHORT_NAME = "STARX";

/** Домен, на котором размещён сервис. */
export const SERVICE_HOST = "starxgame.com";

/** Адрес поддержки. Пустая строка — блок не рендерится. */
export const SUPPORT_EMAIL = "support@starxgame.com";

/** Минимальный возраст пользователя. */
export const MIN_AGE = 18;

/** Дата последней редакции документов (отображается на страницах). */
export const LEGAL_UPDATED = "29.09.2026";

/** Маршруты документов — используются в футере, форме входа и перелинковке. */
export const TERMS_HREF = "/terms";
export const PRIVACY_HREF = "/privacy";
export const RULES_HREF = "/rules";
export const RESPONSIBLE_HREF = "/responsible";
export const SUPPORT_HREF = "/support";
