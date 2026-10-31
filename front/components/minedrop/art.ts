import {
  BLOCK_IMAGE,
  BLOCK_PRICE,
  EMPTY_TOOL,
  FIELD_COLS,
  FIELD_LAYOUT,
  FIELD_ROWS,
  HOUSE_EDGE,
  TOOL_BY_ID,
} from '@/lib/minedrop/engine';

/** Русские названия блоков (сверху вниз по глубине). */
export const BLOCK_NAME: Record<string, string> = {
  grass: 'Трава',
  dirt: 'Земля',
  stone: 'Камень',
  redstone: 'Редстоун',
  coal: 'Уголь',
  iron: 'Железо',
  gold: 'Золото',
  diamond: 'Алмаз',
  chest: 'Сундук',
};

export const BLOCK_ORDER = ['grass', 'dirt', 'stone', 'redstone', 'coal', 'iron', 'gold', 'diamond', 'chest'];

export function blockArt(block: string): string {
  return BLOCK_IMAGE[block] ?? BLOCK_IMAGE.grass;
}

export function toolArt(toolId: string): string | null {
  if (toolId === EMPTY_TOOL) return null;
  return TOOL_BY_ID[toolId]?.image ?? null;
}

/** Очки → множитель так же, как в resolveSpin: floor(1.653 × очки) / 100. */
export function pointsToMultiplier(points: number): number {
  return Math.floor(HOUSE_EDGE * points) / 100;
}

/** Потолок множителя раунда: все 5 колонн — сундуки через Око (×20.66). */
export const MAX_ROUND_MULT = pointsToMultiplier(FIELD_COLS * BLOCK_PRICE.chest);

/** Очки колонны по числу разрушенных сверху блоков (как resolveColumn); Око — сразу сундук. */
export function columnPoints(col: number, destroyed: number, jackpot: boolean): number {
  if (jackpot) return BLOCK_PRICE.chest;
  let points = 0;
  for (let r = 0; r < Math.min(destroyed, FIELD_ROWS); r++) points += BLOCK_PRICE[FIELD_LAYOUT[r][col]];
  return points;
}

/** Обратное: сколько блоков сверху разрушено при данных очках колонны. */
export function columnDepth(col: number, points: number, jackpot: boolean): number {
  if (jackpot) return FIELD_ROWS;
  let cum = 0;
  for (let r = 0; r < FIELD_ROWS; r++) {
    cum += BLOCK_PRICE[FIELD_LAYOUT[r][col]];
    if (cum > points) return r;
  }
  return FIELD_ROWS;
}

export interface RoundColumn {
  slots: string[];
  points: number;
  destroyed: number;
  jackpot: boolean;
}

export interface RoundView {
  id?: string;
  bet: number;
  multiplier: number;
  payout: number;
  outcome: 'win' | 'loss';
  createdAt?: string;
  columns: RoundColumn[] | null;
}

/** Колонны раунда из поля details истории (JSON [{slots, multiplier}]). Битые данные → null. */
export function parseDetails(details: string): RoundColumn[] | null {
  try {
    const raw = JSON.parse(details) as Array<{ slots?: unknown; multiplier?: unknown }>;
    if (!Array.isArray(raw) || raw.length !== FIELD_COLS) return null;
    return raw.map((c, i) => {
      const slots = Array.isArray(c.slots) ? c.slots.map(String) : [];
      const points = Number(c.multiplier) || 0;
      const jackpot = slots.includes('eye');
      return { slots, points, destroyed: columnDepth(i, points, jackpot), jackpot };
    });
  } catch {
    return null;
  }
}

/** Самый глубокий блок, до которого дошёл раунд (для иконки в истории). */
export function deepestBlock(columns: RoundColumn[] | null): string | null {
  if (!columns) return null;
  let best: string | null = null;
  let bestDepth = 0;
  columns.forEach((c, i) => {
    if (c.destroyed > bestDepth) {
      bestDepth = c.destroyed;
      best = FIELD_LAYOUT[c.destroyed - 1][i];
    }
  });
  return best;
}

/** Рамка до первого спина — постоянный набор (палитра хука случайна → SSR разошёлся бы с клиентом). */
export const DEMO_REELS: string[][] = [
  ['wooden_pickaxe', 'iron_shovel', 'diamond_axe'],
  ['iron_axe', 'eye', 'wooden_shovel'],
  ['diamond_pickaxe', 'wooden_axe', 'iron_pickaxe'],
  ['iron_shovel', 'diamond_shovel', 'wooden_pickaxe'],
  ['wooden_axe', 'iron_pickaxe', 'diamond_axe'],
];

/** Лента вращения колонны (повторяется дважды для бесшовной прокрутки). */
export const SPIN_STRIP = [
  'iron_pickaxe',
  'wooden_shovel',
  'diamond_axe',
  'eye',
  'iron_shovel',
  'wooden_pickaxe',
  'diamond_shovel',
  'iron_axe',
];
