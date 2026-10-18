/**
 * Обёртка fetch для запросов к LLM-провайдеру.
 *
 * Зачем: апстрим-DNS прод-VPS периодически теряет UDP-запросы (замер: 1-2%),
 * контейнер получает `getaddrinfo EAI_AGAIN routerai.ru` — и ход умирает,
 * пользователь видит заглушку «произошла техническая заминка». `maxRetries`
 * у AI SDK такую ошибку не вытягивает. Здесь повторяем ТОЛЬКО сетевые сбои
 * соединения; HTTP-ответы (включая 5xx) не трогаем — их разбирает SDK.
 */

const RETRYABLE_CODES = new Set([
  "EAI_AGAIN",
  "EAI_FAIL",
  "EAI_NODATA",
  "ENOTFOUND",
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "EPIPE",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
]);

const RETRYABLE_MESSAGE_RE =
  /EAI_AGAIN|EAI_FAIL|getaddrinfo|socket hang up|other side closed/i;

const ATTEMPTS = 3;
const BASE_DELAY_MS = 250;

/** Коды ошибки по всей цепочке `cause` (у fetch-ошибок причина бывает вложенной). */
function errorCodes(error: unknown): string[] {
  const codes: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 5; depth += 1) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === "string") codes.push(candidate.code);
    current = candidate.cause;
  }
  return codes;
}

export function isRetryableNetworkError(error: unknown): boolean {
  const message = String((error as Error | undefined)?.message ?? "");
  if (RETRYABLE_MESSAGE_RE.test(message)) return true;
  return errorCodes(error).some((code) => RETRYABLE_CODES.has(code));
}

/** Тело можно отправить повторно, только если это не поток. */
function isReplayableBody(body: BodyInit | null | undefined): boolean {
  return body == null || typeof body === "string" || body instanceof Uint8Array;
}

export function createRetryingFetch(inner: typeof fetch = fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let lastError: unknown;

    for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
      try {
        return await inner(input, init);
      } catch (error) {
        lastError = error;
        const replayable = isReplayableBody(init?.body);
        if (attempt === ATTEMPTS || !replayable || !isRetryableNetworkError(error)) {
          throw error;
        }
        console.warn(
          `[provider-fetch] сетевой сбой (${errorCodes(error).join("/") || "без кода"}), повтор ${attempt}/${ATTEMPTS - 1}`,
        );
        await new Promise((resolve) =>
          setTimeout(resolve, BASE_DELAY_MS * attempt + Math.random() * 100),
        );
      }
    }

    throw lastError;
  };
}
