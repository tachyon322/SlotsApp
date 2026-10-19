/**
 * Что сохраняем в БД по итогам хода ассистента.
 *
 * Раньше сохранялся только непустой текст, а шаг «вызвал инструмент, текста нет»
 * не оставлял в диалоге ничего. Но инструменты исполняет браузер: если
 * пользователь ушёл со страницы, проверка не состоялась, ответа не было вовсе —
 * и при возврате в чат он видел свой вопрос без ответа, без единого следа.
 * Поэтому: есть текст — сохраняем его; текста нет, а ход ушёл проверять данные
 * инструментами — сохраняем служебную строку, чтобы пользователь её увидел.
 */
export const TOOL_CHECK_NOTICE =
  "Сейчас проверю информацию по вашему счёту — одну минутку.";

/**
 * Служебная пометка времени, которой в промпте помечается каждое сообщение
 * истории: «[18.10 16:22 МСК]». Пользователь её видеть не должен — модель
 * иногда копирует формат из истории в свой ответ, поэтому пометку срезаем и в
 * стриме (stripServiceStamp), и в том, что сохраняем в БД.
 */
export const STAMP_PREFIX_RE = /^\[\d{2}\.\d{2}(?:\.\d{4})? \d{2}:\d{2} МСК\]/;

/**
 * Убирает служебные пометки времени из ответа модели — и в начале, и внутри
 * текста: пользователь их видеть не должен.
 */
export function stripStamps(text: string): string {
  return text.replace(/\[\d{2}\.\d{2}(?:\.\d{4})? \d{2}:\d{2} МСК\]\s?/g, "");
}

export function stripLeadingStamp(text: string): string {
  return stripStamps(text).trim();
}

export type AssistantSave = { messageId: string; content: string };

export function assistantSaveForStep(
  {
    text,
    callId,
    toolCallCount,
    allowNotice,
  }: {
    text?: string | null;
    callId?: string | null;
    toolCallCount: number;
    /** Страховочную строку пишем только на первом шаге хода: на последующих
     *  она уже сохранена предыдущим шагом, иначе в диалоге будет два «проверю». */
    allowNotice: boolean;
  },
  newId: () => string,
): AssistantSave | null {
  const content = stripLeadingStamp(text?.trim() ?? "");
  const id = callId?.trim() ? callId.trim() : newId();

  if (content) return { messageId: id, content };
  if (allowNotice && toolCallCount > 0) {
    return { messageId: `notice-${id}`, content: TOOL_CHECK_NOTICE };
  }
  return null;
}
