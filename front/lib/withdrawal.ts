export const WITHDRAWAL_PROCESSING_TEXT =
  'Вывод средств будет выполнен в течение 30 дней. Срок поступления средств зависит от вашего банка.';

// ─────────────────────────────────────────────────────────────────────────────
// Движение средств по заявке (вывод / возврат)
// ─────────────────────────────────────────────────────────────────────────────

export type MovementKind = 'withdrawal' | 'refund';
export type MovementStageKey = 'processing' | 'gateway' | 'queue' | 'final_check';
export type MovementStepState = 'done' | 'current' | 'pending' | 'failed';

export interface MovementStep {
  key: MovementStageKey;
  title: string;
  description: string;
  state: MovementStepState;
  at: string | null;
  endsAt: string | null;
}

export interface MovementQueue {
  position: number;
  total: number;
  nextUpdateAt: string | null;
}

export interface MovementTimeline {
  kind: MovementKind;
  current: MovementStageKey | 'expired';
  steps: MovementStep[];
  queue: MovementQueue | null;
  deadline: string;
  expired: boolean;
}

/** Человеческий остаток для длинных стадий: «2 ч 14 мин», «1 дн 3 ч», «8 мин». */
export function formatMovementRemaining(remainingMs: number): string {
  const totalMinutes = Math.max(0, Math.ceil(remainingMs / 60000));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return hours > 0 ? `${days} дн ${hours} ч` : `${days} дн`;
  if (hours > 0) return minutes > 0 ? `${hours} ч ${minutes} мин` : `${hours} ч`;
  return `${minutes} мин`;
}

export function formatQueuePosition(position: number): string {
  return position.toLocaleString('ru-RU');
}

export function movementCurrentStep(timeline: MovementTimeline): MovementStep | null {
  return (
    timeline.steps.find((step) => step.state === 'current') ??
    timeline.steps.find((step) => step.state === 'failed') ??
    null
  );
}

/**
 * Название текущей стадии без места в очереди — для компактных плашек,
 * где место показывается отдельным блоком.
 */
export function movementStageName(timeline: MovementTimeline): string {
  if (timeline.expired) {
    return timeline.kind === 'withdrawal' ? 'Вывод не выполнен' : 'Финальная проверка';
  }
  switch (timeline.current) {
    case 'processing':
      return 'Заявка обрабатывается';
    case 'gateway':
      return 'В платёжном шлюзе';
    case 'final_check':
      return 'Финальная проверка';
    case 'queue':
      return timeline.kind === 'withdrawal' ? 'Очередь на вывод' : 'Очередь на возврат';
    default:
      return 'В обработке';
  }
}

/**
 * Короткая подпись стадии для строк истории и компактных плашек.
 * В очереди добавляет место, чтобы пользователь видел движение.
 */
export function movementStageLabel(timeline: MovementTimeline): string {
  const stage = movementStageName(timeline);
  if (timeline.expired || timeline.current !== 'queue' || !timeline.queue) return stage;
  return `${stage} · место ${formatQueuePosition(timeline.queue.position)}`;
}

export function formatDeadlineDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  } catch {
    return '';
  }
}
