/**
 * Обёртка над трекером Umami.
 *
 * Трекер грузится после гидратации (strategy="afterInteractive"), поэтому
 * события, случившиеся раньше, складываются в очередь и уходят в onLoad.
 * Если NEXT_PUBLIC_UMAMI_* не заданы (dev, локаль), window.umami не появится,
 * а события тихо отбрасываются — приложение от этого не падает.
 */

export type AnalyticsData = Record<string, string | number | boolean | undefined>;

interface UmamiTracker {
  track: (name: string, data?: AnalyticsData) => Promise<void> | void;
  identify: (id: string, data?: AnalyticsData) => Promise<void> | void;
}

declare global {
  interface Window {
    umami?: UmamiTracker;
  }
}

const MAX_QUEUE = 50;
const queue: { name: string; data?: AnalyticsData }[] = [];
let pendingIdentity: { id: string; data?: AnalyticsData } | null = null;

/**
 * window.umami может оказаться не трекером, а DOM-элементом с id="umami",
 * поэтому проверяем именно метод, а не наличие объекта. Ошибки аналитики
 * наружу не выпускаем: они не должны ломать обработчики интерфейса.
 */
function ready(): UmamiTracker | null {
  const tracker = window.umami;
  return typeof tracker?.track === 'function' ? tracker : null;
}

export function track(name: string, data?: AnalyticsData): void {
  if (typeof window === 'undefined') return;

  const tracker = ready();

  if (tracker) {
    try {
      void tracker.track(name, data);
    } catch {
      // аналитика не должна ронять UI
    }
    return;
  }

  if (queue.length >= MAX_QUEUE) queue.shift();
  queue.push({ name, data });
}

export function identify(id: string, data?: AnalyticsData): void {
  if (typeof window === 'undefined' || !id) return;

  const tracker = ready();

  if (!tracker) {
    pendingIdentity = { id, data };
    return;
  }

  try {
    void tracker.identify(id, data);
  } catch {
    // аналитика не должна ронять UI
  }
}

export function flushQueue(): void {
  if (typeof window === 'undefined') return;

  const tracker = ready();
  if (!tracker) return;

  while (queue.length > 0) {
    const item = queue.shift();
    if (item) {
      try {
        void tracker.track(item.name, item.data);
      } catch {
        // пропускаем событие
      }
    }
  }

  if (pendingIdentity) {
    const { id, data } = pendingIdentity;
    pendingIdentity = null;
    try {
      void tracker.identify(id, data);
    } catch {
      // пропускаем идентификацию
    }
  }
}
