// Чистая игровая логика MineDrop: поле, инструменты, разрешение колонн
// и множители считаются на клиенте; деньги — на сервере через /api/minedrop.

export const FIELD_ROWS = 6;
export const FIELD_COLS = 5;
export const SLOTS_PER_COL = 3;

export const HOUSE_EDGE = 0.96;

/** Цена блока (она же HP). Сумма цен разрушенных блоков = «очки» выплаты. Сундук — джекпот. */
export const BLOCK_PRICE: Record<string, number> = {
  grass: 2,
  dirt: 3,
  stone: 6,
  redstone: 8,
  coal: 10,
  iron: 15,
  gold: 30,
  diamond: 38,
  chest: 250,
};

/** Картинки блоков (background-image). */
export const BLOCK_IMAGE: Record<string, string> = {
  grass: '/img/minecraft/grassBlock.png',
  dirt: '/img/minecraft/dirtBlock.png',
  stone: '/img/minecraft/stoneBlock.png',
  redstone: '/img/minecraft/redstoneBlock.png',
  coal: '/img/minecraft/coalBlock.png',
  iron: '/img/minecraft/ironBlock.png',
  gold: '/img/minecraft/goldBlock.png',
  diamond: '/img/minecraft/diamondBlock.png',
  chest: '/img/minecraft/chestBlock.png',
};

/** Фиксированное поле 6×5 сверху вниз (как в макете). */
export const FIELD_LAYOUT: string[][] = [
  ['grass', 'grass', 'grass', 'grass', 'dirt'],
  ['coal', 'stone', 'stone', 'stone', 'stone'],
  ['redstone', 'redstone', 'iron', 'coal', 'coal'],
  ['gold', 'gold', 'redstone', 'redstone', 'redstone'],
  ['gold', 'gold', 'diamond', 'diamond', 'gold'],
  ['chest', 'chest', 'chest', 'chest', 'chest'],
];

/** Инструменты с «уроном» из правил. Урон пересчитывается в эффективные HP-единицы. */
export interface ToolDef {
  id: string;
  label: string;
  damage: number;
  image: string;
  eye?: boolean;
}

export const TOOLS: ToolDef[] = [
  { id: 'wooden_shovel', label: 'Лопата (Деревянная)', damage: 8, image: '/img/minecraft/woodenShovel.png' },
  { id: 'iron_shovel', label: 'Лопата (Железная)', damage: 11, image: '/img/minecraft/ironShovel.png' },
  { id: 'diamond_shovel', label: 'Лопата (Алмазная)', damage: 14, image: '/img/minecraft/diamondShovel.png' },
  { id: 'wooden_axe', label: 'Топор (Деревянный)', damage: 11, image: '/img/minecraft/woodenAxe.png' },
  { id: 'iron_axe', label: 'Топор (Железный)', damage: 15, image: '/img/minecraft/ironAxe.png' },
  { id: 'diamond_axe', label: 'Топор (Алмазный)', damage: 20, image: '/img/minecraft/diamondAxe.png' },
  { id: 'wooden_pickaxe', label: 'Кирка (Деревянная)', damage: 15, image: '/img/minecraft/woodenPickaxe.png' },
  { id: 'iron_pickaxe', label: 'Кирка (Железная)', damage: 21, image: '/img/minecraft/ironPickaxe.png' },
  { id: 'diamond_pickaxe', label: 'Кирка (Алмазная)', damage: 27, image: '/img/minecraft/diamondPickaxe.png' },
  { id: 'eye', label: 'Око Эндера', damage: 0, image: '/img/minecraft/enderEye.png', eye: true },
];

export const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(
  TOOLS.map((t) => [t.id, t]),
);

export const EMPTY_TOOL = 'empty';

export const PRESETS = [10, 50, 100, 500, 1000];
export const DEFAULT_BET = 100;

/** Эффективный урон инструмента в HP-единицах блока (урон/1.6, минимум 1). */
export function effectiveDamage(toolId: string): number {
  const t = TOOL_BY_ID[toolId];
  if (!t) return 0;
  return Math.max(1, Math.round(t.damage / 1.6));
}

/**
 * Веса пула рейла: инструменты — основная масса (чтобы всегда были видны),
 * Око — редкий джекпот, «пусто» — редкость.
 * Итоговый RTP ≈ 1.10 при этих весах и уроне ÷1.6.
 */
const TOOL_WEIGHT = 13;
const EYE_WEIGHT = 0.08;
const EMPTY_WEIGHT = 5;

export interface ReelSpin {
  /** 3 слота колонны: id инструмента или 'empty'. */
  slots: string[];
  /** Очки колонны: сумма цен разрушенных блоков (250 — сундук через Око). */
  multiplier: number;
  /** Число разрушенных блоков сверху. */
  destroyed: number;
  /** Колонна уничтожена молнией Ока. */
  jackpot: boolean;
}

export interface SpinResult {
  columns: ReelSpin[];
  /** Суммарные очки по всем колоннам. */
  totalMultiplier: number;
  /** Итоговый множитель выплаты = 0.96 × Σ очков / 100. */
  multiplier: number;
}

function pickSlot(rand: () => number): string {
  const total = TOOLS.reduce((s, t) => s + (t.eye ? EYE_WEIGHT : TOOL_WEIGHT), 0) + EMPTY_WEIGHT;
  let r = rand() * total;
  for (const t of TOOLS) {
    r -= t.eye ? EYE_WEIGHT : TOOL_WEIGHT;
    if (r <= 0) return t.id;
  }
  return EMPTY_TOOL;
}

function comboMultiplier(toolId: string, count: number): number {
  if (count === 2) return 1.5;
  if (count === 3) return 2;
  return 1;
}

function resolveColumn(columnIndex: number, slots: string[]): ReelSpin {
  const counts = new Map<string, number>();
  for (const s of slots) counts.set(s, (counts.get(s) ?? 0) + 1);

  if (slots.some((s) => s === 'eye')) {
    return { slots, multiplier: BLOCK_PRICE.chest, destroyed: FIELD_ROWS, jackpot: true };
  }

  let damage = 0;
  for (const s of slots) {
    if (s === EMPTY_TOOL) continue;
    damage += effectiveDamage(s) * comboMultiplier(s, counts.get(s) ?? 0);
  }

  const column = FIELD_LAYOUT.map((row) => row[columnIndex]);
  let cum = 0;
  let points = 0;
  let destroyed = 0;
  for (const block of column) {
    cum += BLOCK_PRICE[block];
    if (damage >= cum) {
      points += BLOCK_PRICE[block];
      destroyed += 1;
    } else {
      break;
    }
  }

  return { slots, multiplier: points, destroyed, jackpot: false };
}

/** Крутит один спин: 5 рейлов по 3 инструмента и считает итоговый множитель. */
export function resolveSpin(rand: () => number = Math.random): SpinResult {
  const columns: ReelSpin[] = [];
  let total = 0;
  for (let c = 0; c < FIELD_COLS; c++) {
    const slots = Array.from({ length: SLOTS_PER_COL }, () => pickSlot(rand));
    const col = resolveColumn(c, slots);
    columns.push(col);
    total += col.multiplier;
  }
  const multiplier = Math.floor(HOUSE_EDGE * total) / 100;
  return { columns, totalMultiplier: total, multiplier };
}

export function formatRub(amount: number): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
}

export function formatMultiplier(m: number): string {
  return `×${m.toFixed(2)}`;
}
