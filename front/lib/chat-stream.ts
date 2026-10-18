/**
 * Стрим ответа модели для браузера, отвязанный от соединения клиента.
 *
 * Зачем: раньше ответ жил только внутри запроса браузера — стрим провайдера
 * читался ПОСЛЕ паузы «живого оператора» (10-20 с), и если пользователь закрывал
 * вкладку или телефон усыплял её, соединение обрывалось, модель даже не начинала
 * отвечать, а `onFinish`/`onError` не срабатывали: в БД не оставалось ни ответа,
 * ни заглушки (в логах — ответы по 21-45 байт, только хартбиты).
 *
 * Теперь upstream выкачивается сразу и до конца в фоне: реплика сохранится
 * (onFinish) даже если клиент ушёл, и он увидит её при возврате в чат. Пауза и
 * доставка касаются только соединения с браузером.
 */
export function createDelayedClientStream(
  upstream: ReadableStream<Uint8Array>,
  delayMs: number,
  onClientGone?: () => void,
): ReadableStream<Uint8Array> {
  const reader = upstream.getReader();
  const encoder = new TextEncoder();
  const buffered: Uint8Array[] = [];

  let upstreamDone = false;
  let upstreamError: unknown = null;
  let notify: (() => void) | null = null;
  let clientGone = false;

  const wake = () => {
    const resolve = notify;
    notify = null;
    resolve?.();
  };
  const waitForMore = () =>
    new Promise<void>((resolve) => {
      notify = resolve;
    });

  // Фоновая выкачка ответа модели: клиентский abort её НЕ останавливает.
  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          buffered.push(value);
          wake();
        }
      }
    } catch (error) {
      upstreamError = error;
      console.error("[chat] фоновая выкачка ответа прервана:", error);
    } finally {
      upstreamDone = true;
      wake();
    }
  })();

  const markClientGone = () => {
    if (clientGone) return;
    clientGone = true;
    onClientGone?.();
    wake();
  };

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let heartbeat: ReturnType<typeof setInterval> | null = null;

      const enqueueBytes = (bytes: Uint8Array): boolean => {
        try {
          controller.enqueue(bytes);
          return true;
        } catch {
          markClientGone();
          return false;
        }
      };
      const sendComment = (comment: string) => enqueueBytes(encoder.encode(comment));

      try {
        // Сразу отдаём заголовки и держим соединение живым во время паузы.
        // SSE-комментарии (`: ...`) клиент игнорирует.
        sendComment(": connected\n\n");
        heartbeat = setInterval(() => sendComment(": ping\n\n"), 3000);

        // Пауза «живого оператора» — только на выдачу: модель уже отвечает.
        await new Promise((resolve) => setTimeout(resolve, delayMs));

        while (!clientGone) {
          const chunk = buffered.shift();
          if (chunk) {
            if (!enqueueBytes(chunk)) break;
            continue;
          }
          if (upstreamDone) break;
          await waitForMore();
        }

        if (!clientGone) {
          if (upstreamError) controller.error(upstreamError);
          else controller.close();
        }
      } catch (error) {
        markClientGone();
        try {
          controller.error(error);
        } catch {
          // поток уже закрыт
        }
      } finally {
        if (heartbeat) clearInterval(heartbeat);
      }
    },
    cancel() {
      // Клиент ушёл: upstream НЕ отменяем — ответ должен дозаписаться в БД.
      markClientGone();
    },
  });
}
