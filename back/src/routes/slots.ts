import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { slotsRound, user } from "../db/schema";
import { auth } from "../lib/auth";
import { gameHistoryBuffer } from "../lib/gameHistoryBuffer";
import { userCache } from "../lib/userCache";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const slots = new Hono<{ Variables: Variables }>();

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
  '7':       { id: '7',       weight: 3,  payouts: { 3: 50, 4: 200, 5: 1000 } },
  'diamond': { id: 'diamond', weight: 5,  payouts: { 3: 25, 4: 100, 5: 500 } },
  'bag':     { id: 'bag',     weight: 8,  payouts: { 3: 15, 4: 60,  5: 300 } },
  'star':    { id: 'star',    weight: 12, payouts: { 3: 10, 4: 40,  5: 200 } },
  'bell':    { id: 'bell',    weight: 18, payouts: { 3: 5,  4: 20,  5: 100 } },
  'lemon':   { id: 'lemon',   weight: 24, payouts: { 3: 3,  4: 10,  5: 50 } },
  'cherry':  { id: 'cherry',  weight: 25, payouts: { 3: 2,  4: 5,   5: 25 } },
  'wild':    { id: 'wild',    weight: 2,  payouts: { 3: 100, 4: 400, 5: 2000 } },
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

export interface WinLineInfo {
  lineId: number;
  symbol: SlotSymbolId;
  count: number;
  payout: number;
  coords: Array<[number, number]>;
}

function evaluateGrid(grid: SlotSymbolId[][], activeLinesCount: number, mode: 'classic' | 'mega', lineBet: number) {
  const paylines = (mode === 'mega' ? MEGA_PAYLINES : CLASSIC_PAYLINES).slice(0, activeLinesCount);
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
        const linePayout = mult * lineBet;
        totalPayout += linePayout;
        winLines.push({
          lineId: line.id,
          symbol: baseSymbol,
          count: matchCount,
          payout: linePayout,
          coords: matchCoords,
        });
      }
    }
  }

  return { totalPayout, winLines };
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

  const colsCount = mode === 'mega' ? 5 : 3;
  const rowsCount = 3;

  // Generate grid [row][col]
  const grid: SlotSymbolId[][] = [];
  for (let r = 0; r < rowsCount; r++) {
    const row: SlotSymbolId[] = [];
    for (let c = 0; c < colsCount; c++) {
      row.push(getRandomSymbol());
    }
    grid.push(row);
  }

  const { totalPayout, winLines } = evaluateGrid(grid, lines, mode, lineBet);
  const multiplier = Number((totalPayout / totalBet).toFixed(2));
  
  let outcome: 'win' | 'loss' | 'ldw' = 'loss';
  if (totalPayout > totalBet) {
    outcome = 'win';
  } else if (totalPayout > 0) {
    outcome = 'ldw';
  }

  let newBalance = 0;
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

  const netChange = totalPayout - totalBet;
  try {
    newBalance = await userCache.adjustUserBalance(u.id, netChange);
    void gameHistoryBuffer.pushRound('slots', u.id, roundRecord);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient_balance") return fail(c, "Недостаточно средств", 402);
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }

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
