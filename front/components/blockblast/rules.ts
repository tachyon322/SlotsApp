import { MAX_MULT, STEP_MULT, TARGET_PLACEMENTS } from '@/lib/blockblast/engine';

/**
 * Возврат до кэшаута — зеркало back/src/routes/blockblast.ts (/end):
 * n фигур → (n / 15) × 0.9 ставки, не больше 0.6. Меняется бэк — править здесь же.
 */
const END_RETURN_RATIO = 0.6;
const END_RETURN_SLOPE = 0.9;

export function refundRatio(placements: number): number {
  return Math.min(END_RETURN_RATIO, (placements / TARGET_PLACEMENTS) * END_RETURN_SLOPE);
}

/** С какой фигуры возврат упирается в потолок 60% (10). */
export const REFUND_CAP_AT = Math.ceil((END_RETURN_RATIO / END_RETURN_SLOPE) * TARGET_PLACEMENTS);

/** С какой фигуры множитель кэшаута упирается в потолок ×2 (20). */
export const MAX_MULT_AT = Math.round(MAX_MULT / STEP_MULT);

export function percent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}
