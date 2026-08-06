// Чистая игровая логика Block Blast: поле, фигуры, сгорание линий и
// множители считаются на клиенте, деньги — на сервере через /api/blockblast.

export const GRID_SIZE = 8;
export const TARGET_PLACEMENTS = 10;
export const STEP_MULT = 0.16;
export const MAX_MULT = 3.2;
export const LINE_BONUS_RATIO = 0.16;
export const BETS = [10, 50, 100, 500, 1000];
export const DEFAULT_BET = 50;
export const PALETTE_SIZE = 3;

export interface Shape {
  id: string;
  name: string;
  cells: number[][];
}

export const SHAPES: Shape[] = [
  { id: 'single', name: 'single', cells: [[1]] },
  { id: 'line_2', name: 'line_2', cells: [[1, 1]] },
  { id: 'line_3', name: 'line_3', cells: [[1, 1, 1]] },
  { id: 'line_4', name: 'line_4', cells: [[1, 1, 1, 1]] },
  { id: 'line_5', name: 'line_5', cells: [[1, 1, 1, 1, 1]] },
  { id: 'square_2x2', name: 'square_2x2', cells: [[1, 1], [1, 1]] },
  { id: 'corner_3', name: 'L', cells: [[1, 0], [1, 1]] },
  { id: 'l_4', name: 'L-4', cells: [[1, 0], [1, 0], [1, 1]] },
  { id: 's', name: 'S', cells: [[0, 1, 1], [1, 1, 0]] },
  { id: 'z', name: 'Z', cells: [[1, 1, 0], [0, 1, 1]] },
  { id: 't', name: 'T', cells: [[1, 1, 1], [0, 1, 0]] },
];

export function randomShape(): Shape {
  return SHAPES[Math.floor(Math.random() * SHAPES.length)];
}

export function randomPalette(count = PALETTE_SIZE): Shape[] {
  return Array.from({ length: count }, () => randomShape());
}

export function emptyBoard(): number[][] {
  return Array.from({ length: GRID_SIZE }, () => Array<number>(GRID_SIZE).fill(0));
}

export function shapeCells(shape: Shape): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  shape.cells.forEach((row, r) => {
    row.forEach((v, c) => {
      if (v === 1) out.push([r, c]);
    });
  });
  return out;
}

export function canPlace(board: number[][], shape: Shape, row: number, col: number): boolean {
  return shapeCells(shape).every(([r, c]) => {
    const rr = row + r;
    const cc = col + c;
    if (rr < 0 || rr >= GRID_SIZE || cc < 0 || cc >= GRID_SIZE) return false;
    return board[rr][cc] === 0;
  });
}

export function canPlaceSomewhere(board: number[][], shape: Shape): boolean {
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (canPlace(board, shape, r, c)) return true;
    }
  }
  return false;
}

export function canAnyPiecePlace(board: number[][], pieces: Shape[]): boolean {
  return pieces.some((p) => canPlaceSomewhere(board, p));
}

/** Все валидные позиции (row, col) размещения фигуры на доске. */
export function validPositions(board: number[][], shape: Shape): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    for (let c = 0; c < GRID_SIZE; c++) {
      if (canPlace(board, shape, r, c)) out.push([r, c]);
    }
  }
  return out;
}

export interface PlaceResult {
  board: number[][];
  clearedRows: number[];
  clearedCols: number[];
  linesCleared: number;
}

/** Ставит фигуру, убирает полные строки/колонки. */
export function placePiece(board: number[][], shape: Shape, row: number, col: number): PlaceResult | null {
  if (!canPlace(board, shape, row, col)) return null;

  const next = board.map((r) => [...r]);
  shapeCells(shape).forEach(([r, c]) => {
    next[row + r][col + c] = 1;
  });

  const clearedRows: number[] = [];
  const clearedCols: number[] = [];
  for (let r = 0; r < GRID_SIZE; r++) {
    if (next[r].every((v) => v === 1)) clearedRows.push(r);
  }
  for (let c = 0; c < GRID_SIZE; c++) {
    let full = true;
    for (let r = 0; r < GRID_SIZE; r++) {
      if (next[r][c] === 0) {
        full = false;
        break;
      }
    }
    if (full) clearedCols.push(c);
  }

  clearedRows.forEach((r) => {
    next[r] = Array<number>(GRID_SIZE).fill(0);
  });
  clearedCols.forEach((c) => {
    for (let r = 0; r < GRID_SIZE; r++) next[r][c] = 0;
  });

  return {
    board: next,
    clearedRows,
    clearedCols,
    linesCleared: clearedRows.length + clearedCols.length,
  };
}

/**
 * Лучшая валидная позиция для фигуры рядом с тапнутой клеткой.
 * Сначала ищем позиции, где фигура накрывает тапнутую клетку (тапнутая клетка
 * становится частью фигуры), среди них — с ближайшим якорем. Если таких нет —
 * берём позицию, чей центр фигуры ближе всего к тапнутой клетке.
 */
export function findBestPlacement(
  board: number[][],
  shape: Shape,
  targetRow: number,
  targetCol: number,
): { row: number; col: number } | null {
  const valid = validPositions(board, shape);
  if (valid.length === 0) return null;

  const cells = shapeCells(shape);
  const cellsCount = cells.length;

  const dist = (a: number, b: number, x: number, y: number) =>
    Math.hypot(a - x, b - y);

  // Приоритет: позиции, накрывающие тапнутую клетку.
  let best: { row: number; col: number } | null = null;
  let bestD = Infinity;
  for (const [r, c] of valid) {
    let covers = false;
    for (const [sr, sc] of cells) {
      if (r + sr === targetRow && c + sc === targetCol) {
        covers = true;
        break;
      }
    }
    if (covers) {
      const d = dist(r, c, targetRow, targetCol);
      if (d < bestD) {
        bestD = d;
        best = { row: r, col: c };
      }
    }
  }
  if (best) return best;

  // Фолбэк: позиция с центром фигуры ближе всего к тапнутой клетке.
  let sr = 0;
  let sc = 0;
  cells.forEach(([rr, cc]) => {
    sr += rr;
    sc += cc;
  });
  let fallback: { row: number; col: number } | null = null;
  let fallbackD = Infinity;
  for (const [r, c] of valid) {
    const centerR = r + sr / cellsCount;
    const centerC = c + sc / cellsCount;
    const d = dist(centerR, centerC, targetRow, targetCol);
    if (d < fallbackD) {
      fallbackD = d;
      fallback = { row: r, col: c };
    }
  }
  return fallback;
}

/** Множитель по числу размещений: n шагов = n × 0.1, на 10-м — ×1. */
export function multiplierFor(placements: number): number {
  return Math.min(MAX_MULT, Math.max(0, placements * STEP_MULT));
}

/** Время на ход (сек): чем дальше — тем меньше. */
export function moveTime(placements: number): number {
  return Math.max(3, 10 - placements * 0.5);
}

export function lineBonus(bet: number): number {
  return Math.round(bet * LINE_BONUS_RATIO);
}

export function formatRub(amount: number): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
}

export function formatMultiplier(m: number): string {
  return `×${m.toFixed(1)}`;
}
