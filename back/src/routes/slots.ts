import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { auth } from "../lib/auth";
import { gameHistoryBuffer } from "../lib/gameHistoryBuffer";
import { redis } from "../lib/redis";
import { userCache } from "../lib/userCache";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const slots = new Hono<{ Variables: Variables }>();

// Расписание исходов по режиму: длина цикла + индексы проигрыша внутри цикла.
// Классика 2 выигрыша из 5 (40%), мега 2 из 4 (50%). Прежние 75% отменены.
const WIN_SCHEDULE: Record<'classic' | 'mega', { length: number; lossIndexes: number[] }> = {
  classic: { length: 5, lossIndexes: [1, 3, 4] },
  mega: { length: 4, lossIndexes: [1, 3] },
};
// Потолок выигрыша: не больше 3× ставки и не больше 100 000 ₽ за спин.
const MAX_WIN_MULTIPLIER = 3;
const MAX_WIN_AMOUNT = 100_000;
// Минимум возврата при проигрыше: 30% ставки (если достижимо сеткой).
const LOSS_RETURN_FLOOR = 0.3;
const MAX_OUTCOME_GENERATION_ATTEMPTS = 200;

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

// Symbol keys
export type SlotSymbolId = '7' | 'diamond' | 'bag' | 'star' | 'bell' | 'lemon' | 'cherry' | 'wild';

interface SymbolDef {
  id: SlotSymbolId;
  weight: number;
  payouts: Record<number, number>; // matchLength -> multiplier
}

const SYMBOLS: Record<SlotSymbolId, SymbolDef> = {
  '7':       { id: '7',       weight: 4,  payouts: { 3: 5,   4: 20,  5: 80 } },
  'diamond': { id: 'diamond', weight: 6,  payouts: { 3: 4,   4: 15,  5: 60 } },
  'bag':     { id: 'bag',     weight: 10, payouts: { 3: 3,   4: 10,  5: 40 } },
  'star':    { id: 'star',    weight: 14, payouts: { 3: 2,   4: 8,   5: 30 } },
  'bell':    { id: 'bell',    weight: 26, payouts: { 3: 1.5, 4: 6,   5: 20 } },
  'lemon':   { id: 'lemon',   weight: 38, payouts: { 3: 1.2, 4: 4,   5: 15 } },
  'cherry':  { id: 'cherry',  weight: 45, payouts: { 3: 1,   4: 3,   5: 12 } },
  'wild':    { id: 'wild',    weight: 3,  payouts: { 3: 10,  4: 40,  5: 150 } },
};

const WEIGHTED_POOL: SlotSymbolId[] = [];
for (const [id, def] of Object.entries(SYMBOLS)) {
  for (let i = 0; i < def.weight; i++) {
    WEIGHTED_POOL.push(id as SlotSymbolId);
  }
}

function getRandomSymbol(): SlotSymbolId {
  const idx = Math.floor(Math.random() * WEIGHTED_POOL.length);
  return WEIGHTED_POOL[idx];
}

function randomGrid(colsCount: number): SlotSymbolId[][] {
  return Array.from({ length: 3 }, () =>
    Array.from({ length: colsCount }, () => getRandomSymbol()),
  );
}

// Paylines definitions
// Classic (3x3): rows 0, 1, 2
const CLASSIC_PAYLINES: Array<{ id: number; coords: Array<[number, number]> }> = [
  { id: 1, coords: [[1, 0], [1, 1], [1, 2]] }, // Center
  { id: 2, coords: [[0, 0], [0, 1], [0, 2]] }, // Top
  { id: 3, coords: [[2, 0], [2, 1], [2, 2]] }, // Bottom
];

// Mega (5x3)
const MEGA_PAYLINES: Array<{ id: number; coords: Array<[number, number]> }> = [
  { id: 1, coords: [[1, 0], [1, 1], [1, 2], [1, 3], [1, 4]] }, // Center
  { id: 2, coords: [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]] }, // Top
  { id: 3, coords: [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]] }, // Bottom
  { id: 4, coords: [[0, 0], [1, 1], [2, 2], [1, 3], [0, 4]] }, // V-shape
  { id: 5, coords: [[2, 0], [1, 1], [0, 2], [1, 3], [2, 4]] }, // Inverted V-shape
];

// Факторы выплат по режиму (подобраны эмпирически, Монте-Карло):
// при частом перекруте классика даёт ~70-80% чистых выигрышей, мега — заметно крупнее.
const MODE_PAYOUT_FACTOR: Record<'classic' | 'mega', number> = {
  classic: 2.2,
  mega: 1.4,
};

export interface WinLineInfo {
  lineId: number;
  symbol: SlotSymbolId;
  count: number;
  payout: number;
  coords: Array<[number, number]>;
}

function evaluateGrid(grid: SlotSymbolId[][], activeLinesCount: number, mode: 'classic' | 'mega', lineBet: number) {
  const paylines = (mode === 'mega' ? MEGA_PAYLINES : CLASSIC_PAYLINES).slice(0, activeLinesCount);
  const factor = MODE_PAYOUT_FACTOR[mode];
  const winLines: WinLineInfo[] = [];
  let totalPayout = 0;

  for (const line of paylines) {
    const symbolsOnLine = line.coords.map(([r, c]) => grid[r][c]);
    if (symbolsOnLine.length === 0) continue;

    // Determine target matching symbol (first non-wild symbol or 'wild')
    let baseSymbol: SlotSymbolId = 'wild';
    for (const sym of symbolsOnLine) {
      if (sym !== 'wild') {
        baseSymbol = sym;
        break;
      }
    }

    let matchCount = 0;
    const matchCoords: Array<[number, number]> = [];

    for (let i = 0; i < symbolsOnLine.length; i++) {
      const sym = symbolsOnLine[i];
      if (sym === baseSymbol || sym === 'wild') {
        matchCount++;
        matchCoords.push(line.coords[i]);
      } else {
        break;
      }
    }

    if (matchCount >= 3) {
      const symDef = SYMBOLS[baseSymbol];
      const mult = symDef?.payouts[matchCount] || 0;
      if (mult > 0) {
        const linePayout = mult * lineBet * factor;
        totalPayout += linePayout;
        winLines.push({
          lineId: line.id,
          symbol: baseSymbol,
          count: matchCount,
          payout: Math.round(linePayout),
          coords: matchCoords,
        });
      }
    }
  }

  totalPayout = Math.round(totalPayout);

  return { totalPayout, winLines };
}

function guaranteedWinGrid(mode: 'classic' | 'mega'): SlotSymbolId[][] {
  const colsCount = mode === 'mega' ? 5 : 3;
  const grid = randomGrid(colsCount);
  const firstLine = (mode === 'mega' ? MEGA_PAYLINES : CLASSIC_PAYLINES)[0].coords;

  // A full 7-line is above the bet even when every available line is active.
  for (const [row, col] of firstLine) grid[row][col] = '7';
  return grid;
}

function guaranteedLossGrid(mode: 'classic' | 'mega', lines: number, lineBet: number): SlotSymbolId[][] {
  const colsCount = mode === 'mega' ? 5 : 3;
  const totalBet = lines * lineBet;

  // A loss is normally found quickly. Keep the fallback bounded so a malformed
  // future payline table cannot leave the request in an infinite loop.
  for (let attempt = 0; attempt < MAX_OUTCOME_GENERATION_ATTEMPTS; attempt++) {
    const grid = randomGrid(colsCount);
    const result = evaluateGrid(grid, lines, mode, lineBet);
    if (result.totalPayout <= totalBet) return grid;
  }

  // No matching symbols means zero payout for the current payline definitions.
  const symbols: SlotSymbolId[] = ['cherry', 'lemon', 'bell', 'star', 'bag'];
  return Array.from({ length: 3 }, (_, row) =>
    Array.from({ length: colsCount }, (_, col) => symbols[(row + col) % symbols.length]),
  );
}

async function nextScheduledOutcome(userId: string, mode: 'classic' | 'mega'): Promise<'win' | 'loss'> {
  const schedule = WIN_SCHEDULE[mode];
  const roundNumber = await redis.incr(`slots:schedule:${userId}:${mode}`);
  return schedule.lossIndexes.includes(roundNumber % schedule.length) ? 'loss' : 'win';
}

function generateGridForOutcome(
  outcome: 'win' | 'loss',
  mode: 'classic' | 'mega',
  lines: number,
  lineBet: number,
  winUpper: number,
  lossFloor: number,
) {
  const colsCount = mode === 'mega' ? 5 : 3;
  const totalBet = lines * lineBet;

  for (let attempt = 0; attempt < MAX_OUTCOME_GENERATION_ATTEMPTS; attempt++) {
    const grid = randomGrid(colsCount);
    const result = evaluateGrid(grid, lines, mode, lineBet);
    const isWin = result.totalPayout > totalBet && result.totalPayout <= winUpper;
    const isLoss = result.totalPayout <= totalBet && result.totalPayout >= lossFloor;
    if ((outcome === 'win' && isWin) || (outcome === 'loss' && isLoss)) {
      return { grid, result };
    }
  }

  const grid = outcome === 'win'
    ? guaranteedWinGrid(mode)
    : guaranteedLossGrid(mode, lines, lineBet);
  return { grid, result: evaluateGrid(grid, lines, mode, lineBet) };
}

slots.post("/spin", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    mode?: string;
    lines?: number;
    lineBet?: number;
  };

  const mode = body.mode === 'mega' ? 'mega' : 'classic';
  const maxLines = mode === 'mega' ? 5 : 3;
  const lines = Math.min(maxLines, Math.max(1, Math.floor(Number(body.lines) || 1)));

  const lineBet = Math.floor(Number(body.lineBet));
  if (!Number.isFinite(lineBet) || lineBet <= 0) return fail(c, "Некорректная ставка на линию", 400);
  if (lineBet > 100_000) return fail(c, "Слишком большая ставка", 400);

  const totalBet = lines * lineBet;
  if (totalBet > 500_000) return fail(c, "Слишком большая общая ставка", 400);

  // Резервируем ставку заранее — игра невозможна без достаточного баланса.
  try {
    await userCache.adjustUserBalance(u.id, -totalBet);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient_balance") return fail(c, "Недостаточно средств", 402);
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }

  const scheduledOutcome = await nextScheduledOutcome(u.id, mode);
  const winUpper = Math.max(totalBet + 1, Math.min(totalBet * MAX_WIN_MULTIPLIER, MAX_WIN_AMOUNT));
  const lossFloor = Math.floor(totalBet * LOSS_RETURN_FLOOR);
  const generated = generateGridForOutcome(scheduledOutcome, mode, lines, lineBet, winUpper, lossFloor);
  const { grid } = generated;
  const { winLines } = generated.result;
  // Кредит в рамках потолка/минимума (фолбэк-сетка может выходить за границы).
  let totalPayout = generated.result.totalPayout;
  totalPayout = totalPayout > totalBet
    ? Math.min(totalPayout, winUpper)
    : Math.max(totalPayout, lossFloor);
  const multiplier = Number((totalPayout / totalBet).toFixed(2));
  
  let outcome: 'win' | 'loss' | 'ldw' = 'loss';
  if (totalPayout > totalBet) {
    outcome = 'win';
  } else if (totalPayout > 0) {
    outcome = 'ldw';
  }

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: totalBet,
    mode,
    lines,
    lineBet,
    symbols: JSON.stringify(grid),
    winLines: JSON.stringify(winLines),
    multiplier,
    payout: totalPayout,
    outcome,
    createdAt: new Date(),
  };

  // Зачисляем выигрыш (0 при проигрыше).
  const newBalance = await userCache.adjustUserBalance(u.id, totalPayout);
  void gameHistoryBuffer.pushRound('slots', u.id, roundRecord);

  return c.json({
    balance: newBalance,
    grid,
    winLines,
    totalPayout,
    multiplier,
    outcome,
    totalBet,
  });
});

slots.get("/history", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const raw = Number(c.req.query("limit"));
  const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 30));

  const items = await gameHistoryBuffer.getHistory('slots', u.id, limit);
  const stats = await gameHistoryBuffer.getStats('slots', u.id);

  return c.json({
    items,
    stats,
  });
});

export default slots;
