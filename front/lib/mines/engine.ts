// Чистая игровая логика Mines: минное поле и множители считаются на клиенте,
// деньги (ставка/выплата) — на сервере через /api/mines.

export const GRID_SIZE = 25;

/** House edge — доля «преимущества заведения» в вероятности выживания. */
export const HOUSE_EDGE = 0.96;

export interface Difficulty {
  risk: 'low' | 'mid' | 'high' | 'max';
  mines: number;
  name: string;
}

export const DIFFICULTIES: Difficulty[] = [
  { risk: 'low', mines: 3, name: 'Лёгкий' },
  { risk: 'mid', mines: 5, name: 'Средний' },
  { risk: 'high', mines: 7, name: 'Сложный' },
  { risk: 'max', mines: 10, name: 'Безумный' },
];

export const PRESETS = [50, 100, 250, 500];

export const DEFAULT_DIFFICULTY_MINES = 5;
export const DEFAULT_BET = 100;

/**
 * Случайно размещает `mines` мин на поле 5×5. Возвращает индексы минных клеток.
 */
export function generateMinefield(mines: number): number[] {
  const cells = Array.from({ length: GRID_SIZE }, (_, i) => i);
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cells[i], cells[j]] = [cells[j], cells[i]];
  }
  return cells.slice(0, mines).sort((a, b) => a - b);
}

/**
 * Множитель после `revealed` безопасных открытий при `mines` минах:
 * multiplier = edge / P(выжить), где P — вероятность не наткнуться на мину.
 */
export function multiplierForReveals(mines: number, revealed: number): number {
  if (revealed <= 0) return 1;
  let p = 1;
  for (let i = 0; i < revealed; i++) {
    p *= (GRID_SIZE - mines - i) / (GRID_SIZE - i);
  }
  if (p <= 0) return 1;
  return Math.max(1, Math.floor((HOUSE_EDGE / p) * 100) / 100);
}

/** Максимальный множитель сложности (все безопасные клетки открыты). */
export function maxMultiplier(mines: number): number {
  return multiplierForReveals(mines, GRID_SIZE - mines);
}

export function formatRub(amount: number): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
}

export function formatMultiplier(m: number): string {
  return `×${m.toFixed(2)}`;
}
