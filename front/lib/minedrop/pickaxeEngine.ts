// ВНИМАНИЕ: этот файл продублирован 1-в-1 в back/src/lib/pickaxeEngine.ts и front/lib/minedrop/pickaxeEngine.ts.
// Сервер считает выплату по seed, клиент по тому же seed проигрывает анимацию.
// Любое изменение вносить в ОБА файла, иначе анимация разойдётся с выплатой.
//
// Детерминизм: случайность — целочисленный mulberry32, физика — обычные double
// только с операциями + − × ÷ и Math.sqrt (по IEEE 754 они дают одинаковый
// результат в Bun/JSC и в любом браузере). Math.sin/cos/atan2 и прочие
// «приближённые» функции в симуляции использовать НЕЛЬЗЯ.

export const ENGINE_VERSION = 4;

/** Ширина шахты в блоках. */
export const COLS = 7;
/** Максимальная глубина шахты (страховка от бесконечного раунда). */
export const MAX_DEPTH = 220;
/** Сколько прочности снимает один удар. */
export const HIT_COST = 1;
/** Сколько прочности даёт блок починки. */
export const REPAIR_AMOUNT = 20;

// ── Физика ────────────────────────────────────────────────────────────
// Единица длины — один блок, время — секунды.

/** Частота записи траектории (кадров симуляции в секунду). */
export const TICK_HZ = 60;
/** Подшагов физики на один тик (чтобы не проскакивать сквозь блоки). */
const SUBSTEPS = 4;
const DT = 1 / (TICK_HZ * SUBSTEPS);
/** Радиус инструмента для столкновений (в блоках). */
export const TOOL_RADIUS = 0.42;
/** Ускорение свободного падения (блоков/с²). */
const GRAVITY = 50;
/** Скорость подскока после удара сверху (блоков/с) — подлетает невысоко. */
const HOP_SPEED = 4.2;
/** Предельная скорость падения. */
const MAX_FALL = 16;
/** Ниже этой скорости соприкосновение не считается ударом. */
const HIT_MIN_SPEED = 1.2;
/** Где появляется инструмент (координата центра по Y). */
export const SPAWN_Y = -2.2;
/** Страховка: максимальная длина раунда в тиках. */
const MAX_TICKS = TICK_HZ * 180;

export type BlockId =
  | 'air'
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'coal'
  | 'iron'
  | 'redstone'
  | 'gold'
  | 'diamond'
  | 'chest'
  | 'tnt'
  | 'repair';

export interface BlockDef {
  id: BlockId;
  label: string;
  /** Прочность блока (сколько единиц урона нужно). */
  hp: number;
  /** Стоимость в тысячных долях ставки (1000 = ×1). */
  value: number;
}

export const BLOCKS: Record<BlockId, BlockDef> = {
  air: { id: 'air', label: 'Воздух', hp: 0, value: 0 },
  grass: { id: 'grass', label: 'Трава', hp: 2, value: 0 },
  dirt: { id: 'dirt', label: 'Земля', hp: 2, value: 0 },
  stone: { id: 'stone', label: 'Камень', hp: 4, value: 0 },
  coal: { id: 'coal', label: 'Уголь', hp: 4, value: 30 },
  iron: { id: 'iron', label: 'Железо', hp: 5, value: 80 },
  redstone: { id: 'redstone', label: 'Редстоун', hp: 5, value: 120 },
  gold: { id: 'gold', label: 'Золото', hp: 6, value: 300 },
  diamond: { id: 'diamond', label: 'Алмаз', hp: 8, value: 2000 },
  chest: { id: 'chest', label: 'Сундук', hp: 5, value: 23250 },
  tnt: { id: 'tnt', label: 'TNT', hp: 1, value: 0 },
  repair: { id: 'repair', label: 'Починка', hp: 1, value: 0 },
};

export interface ToolDef {
  id: string;
  label: string;
  /** Прочность инструмента. Каждый удар снимает HIT_COST. */
  durability: number;
  /** Урон за удар. */
  power: number;
  /** Вес выпадения (из 1000). */
  weight: number;
  image: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'wooden_shovel', label: 'Деревянная лопата', durability: 80, power: 1, weight: 190, image: '/img/minecraft/woodenShovel.png' },
  { id: 'wooden_axe', label: 'Деревянный топор', durability: 95, power: 1, weight: 170, image: '/img/minecraft/woodenAxe.png' },
  { id: 'wooden_pickaxe', label: 'Деревянная кирка', durability: 110, power: 1, weight: 150, image: '/img/minecraft/woodenPickaxe.png' },
  { id: 'iron_shovel', label: 'Железная лопата', durability: 105, power: 2, weight: 130, image: '/img/minecraft/ironShovel.png' },
  { id: 'iron_axe', label: 'Железный топор', durability: 120, power: 2, weight: 110, image: '/img/minecraft/ironAxe.png' },
  { id: 'iron_pickaxe', label: 'Железная кирка', durability: 135, power: 2, weight: 90, image: '/img/minecraft/ironPickaxe.png' },
  { id: 'diamond_shovel', label: 'Алмазная лопата', durability: 145, power: 3, weight: 75, image: '/img/minecraft/diamondShovel.png' },
  { id: 'diamond_axe', label: 'Алмазный топор', durability: 165, power: 3, weight: 55, image: '/img/minecraft/diamondAxe.png' },
  { id: 'diamond_pickaxe', label: 'Алмазная кирка', durability: 185, power: 4, weight: 30, image: '/img/minecraft/diamondPickaxe.png' },
];

export const TOOL_BY_ID: Record<string, ToolDef> = Object.fromEntries(TOOLS.map((t) => [t.id, t]));

/**
 * Итоговый множитель = Σ стоимостей × PAYOUT_NUM / PAYOUT_DEN / 1000.
 * Коэффициент подобран так, чтобы полосы выплат (см. economy.ts) попадали
 * в плотную часть распределения раундов; сам RTP задаёт динамический винрейт.
 */
export const PAYOUT_NUM = 500;
export const PAYOUT_DEN = 1000;

/** Потолок множителя за раунд. */
export const MAX_MULTIPLIER = 500;

/** t — номер тика симуляции (TICK_HZ в секунду), когда событие произошло. */
export type PickaxeEvent =
  /** Удар по блоку (x, y). hp — остаток прочности блока, dur — прочность инструмента после удара. */
  | { k: 'hit'; t: number; x: number; y: number; hp: number; dur: number }
  /** Блок разрушен. v — стоимость (тысячные ставки), total — накопленная сумма. */
  | { k: 'break'; t: number; x: number; y: number; b: BlockId; v: number; total: number }
  /** Взрыв TNT в клетке (x, y). */
  | { k: 'boom'; t: number; x: number; y: number }
  /** Починка инструмента. */
  | { k: 'repair'; t: number; amount: number; dur: number }
  /** Инструмент сломался / раунд окончен. */
  | { k: 'end'; t: number };

export interface PickaxeRound {
  version: number;
  seed: number;
  tool: ToolDef;
  startX: number;
  /** Сгенерированная шахта: grid[y][x]. */
  grid: BlockId[][];
  events: PickaxeEvent[];
  /**
   * Траектория инструмента для анимации: по тройке [x, y, угол] на каждый тик,
   * начиная с тика 0. Координаты — центр инструмента в блоках. Заполняется,
   * только если simulateRound вызван с withPath = true.
   */
  path: number[] | null;
  /** Длина раунда в тиках. */
  ticks: number;
  /** Сумма стоимостей разрушенных блоков (тысячные ставки). */
  rawValue: number;
  /** Итоговый множитель к ставке (с потолком). */
  multiplier: number;
  blocksBroken: number;
  depth: number;
}

// ── PRNG ──────────────────────────────────────────────────────────────

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };
}

type Rng = ReturnType<typeof mulberry32>;

function randInt(rng: Rng, n: number): number {
  return rng() % n;
}

/** Случайное число в [0, 1). */
function rand01(rng: Rng): number {
  return rng() / 4294967296;
}

function pickWeighted<T>(rng: Rng, items: ReadonlyArray<readonly [T, number]>): T {
  let total = 0;
  for (const [, w] of items) total += w;
  let r = randInt(rng, total);
  for (const [it, w] of items) {
    if (r < w) return it;
    r -= w;
  }
  return items[items.length - 1][0];
}

// ── Генерация шахты ───────────────────────────────────────────────────

const ORES: ReadonlySet<BlockId> = new Set(['coal', 'iron', 'redstone', 'gold', 'diamond']);

function rowWeights(y: number): Array<readonly [BlockId, number]> {
  if (y === 0) return [['grass', 92], ['air', 8]];
  if (y <= 3) {
    return [['dirt', 55], ['stone', 18], ['air', 18], ['coal', 6], ['iron', 3]];
  }
  // Чем глубже — тем больше руды (до глубины 60 рост, дальше плато).
  const d = Math.min(y, 60);
  return [
    ['stone', 380 - d * 2],
    ['air', 190],
    ['coal', 110],
    ['iron', 70 + d],
    ['redstone', 45 + d],
    ['gold', 22 + d],
    ['diamond', 4 + Math.floor(d / 4)],
    ['chest', d >= 20 ? 1 : 0],
    ['tnt', 22],
    ['repair', 12],
  ];
}

function generateRow(rng: Rng, grid: BlockId[][], y: number): BlockId[] {
  const row: BlockId[] = [];
  const weights = rowWeights(y);
  for (let x = 0; x < COLS; x++) {
    // Жилы: руда «прилипает» к соседу слева или сверху.
    const left = x > 0 ? row[x - 1] : 'air';
    const up = y > 0 ? grid[y - 1][x] : 'air';
    const r = randInt(rng, 100);
    if (ORES.has(left) && r < 30) {
      row.push(left);
      continue;
    }
    if (ORES.has(up) && r >= 30 && r < 55) {
      row.push(up);
      continue;
    }
    row.push(pickWeighted(rng, weights));
  }
  return row;
}

/** Сундук открывается со случайным призом (тысячные ставки). Среднее ≈ ×23. */
export const CHEST_TABLE: ReadonlyArray<readonly [number, number]> = [
  [5000, 50],
  [10000, 25],
  [25000, 15],
  [100000, 7],
  [250000, 3],
];

// ── Симуляция ─────────────────────────────────────────────────────────

/** Генерирует seed для нового раунда (uint32). */
export function randomSeed(): number {
  return Math.floor(Math.random() * 0x100000000) >>> 0;
}

/**
 * Прогоняет раунд целиком. withPath = true дополнительно записывает траекторию
 * для анимации (серверу она не нужна — выплата от неё не зависит).
 */
export function simulateRound(seed: number, withPath = false): PickaxeRound {
  const rng = mulberry32(seed);
  const tool = pickWeighted(rng, TOOLS.map((t) => [t, t.weight] as const));
  const grid: BlockId[][] = [];
  const original: BlockId[][] = [];
  const hp: number[][] = [];

  const ensureRow = (y: number) => {
    while (grid.length <= y && grid.length < MAX_DEPTH) {
      const row = generateRow(rng, grid, grid.length);
      grid.push(row);
      original.push(row.slice());
      hp.push(row.map((b) => BLOCKS[b].hp));
    }
  };
  const cell = (x: number, y: number): BlockId => {
    if (y < 0) return 'air';
    ensureRow(y);
    if (y >= grid.length) return 'air';
    return grid[y][x];
  };

  const events: PickaxeEvent[] = [];
  const path: number[] | null = withPath ? [] : null;
  let dur = tool.durability;
  let total = 0;
  let broken = 0;
  let tick = 0;

  const startX = randInt(rng, COLS);
  const R = TOOL_RADIUS;
  // Состояние инструмента: позиция центра, скорость, угол и угловая скорость.
  let px = startX + 0.5;
  let py = SPAWN_Y;
  let vx = 0;
  let vy = 0;
  let ang = -0.6;
  let om = 7;

  const destroy = (x: number, y: number, chain: Array<[number, number]>) => {
    const b = grid[y][x];
    if (b === 'air') return;
    grid[y][x] = 'air';
    hp[y][x] = 0;
    broken++;
    const v = b === 'chest' ? pickWeighted(rng, CHEST_TABLE) : BLOCKS[b].value;
    total += v;
    events.push({ k: 'break', t: tick, x, y, b, v, total });
    if (b === 'repair') {
      const amount = Math.min(REPAIR_AMOUNT, tool.durability - dur);
      dur += amount;
      events.push({ k: 'repair', t: tick, amount, dur });
    } else if (b === 'tnt') {
      chain.push([x, y]);
    }
  };

  const explode = (sx: number, sy: number) => {
    const queue: Array<[number, number]> = [[sx, sy]];
    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      events.push({ k: 'boom', t: tick, x: cx, y: cy });
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx;
          const ny = cy + dy;
          if (nx < 0 || nx >= COLS || ny < 0) continue;
          ensureRow(ny);
          if (ny >= grid.length) continue;
          destroy(nx, ny, queue);
        }
      }
      // Взрывная волна подбрасывает инструмент, если он рядом.
      const ddx = px - (cx + 0.5);
      const ddy = py - (cy + 0.5);
      if (ddx * ddx + ddy * ddy < 6.25) {
        vy = Math.min(vy, -7);
        vx += ddx >= 0 ? 2.5 : -2.5;
        om = ddx >= 0 ? 14 : -14;
      }
    }
  };

  /** Удар по блоку. Возвращает true, если блок разрушен. */
  const strike = (x: number, y: number): boolean => {
    dur = Math.max(0, dur - HIT_COST);
    hp[y][x] = Math.max(0, hp[y][x] - tool.power);
    events.push({ k: 'hit', t: tick, x, y, hp: hp[y][x], dur });
    if (hp[y][x] > 0) return false;
    const chain: Array<[number, number]> = [];
    destroy(x, y, chain);
    for (const [cx, cy] of chain) explode(cx, cy);
    return true;
  };

  /** Столкновение с блоками: обрабатываем самое глубокое касание за подшаг. */
  const collide = () => {
    const ci = Math.floor(px);
    const cj = Math.floor(py);
    let hit = false;
    let bi = 0;
    let bj = 0;
    let bnx = 0;
    let bny = 0;
    let bpen = 0;
    for (let j = cj - 1; j <= cj + 1; j++) {
      if (j < 0) continue;
      for (let i = ci - 1; i <= ci + 1; i++) {
        if (i < 0 || i >= COLS) continue;
        if (cell(i, j) === 'air') continue;
        const qx = px < i ? i : px > i + 1 ? i + 1 : px;
        const qy = py < j ? j : py > j + 1 ? j + 1 : py;
        const dx = px - qx;
        const dy = py - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= R * R) continue;
        let nx = 0;
        let ny = -1;
        let d = 0;
        if (d2 > 1e-12) {
          d = Math.sqrt(d2);
          nx = dx / d;
          ny = dy / d;
        }
        const pen = R - d;
        if (!hit || pen > bpen) {
          hit = true;
          bi = i;
          bj = j;
          bnx = nx;
          bny = ny;
          bpen = pen;
        }
      }
    }
    if (!hit) return;

    const vn = vx * bnx + vy * bny;
    if (-vn >= HIT_MIN_SPEED) {
      if (strike(bi, bj)) {
        // Блок разбит — инструмент проваливается дальше, чуть потеряв скорость.
        vx *= 0.85;
        vy *= 0.75;
        return;
      }
      if (dur <= 0) return;
    }

    // Выталкиваем из блока.
    px += bnx * bpen;
    py += bny * bpen;
    if (vn >= 0) return; // уже расходимся

    if (bny < -0.55) {
      // Удар сверху: невысокий подскок с небольшим сносом в сторону.
      vy = -HOP_SPEED * (0.8 + 0.4 * rand01(rng));
      vx = vx * 0.45 + bnx * 1.6 + (rand01(rng) - 0.5) * 2.6;
      om = om * 0.4 + vx * 3 + (rand01(rng) - 0.5) * 10;
    } else {
      // Бок или потолок: отражение с потерей энергии.
      vx -= 1.4 * vn * bnx;
      vy -= 1.4 * vn * bny;
      om = -om * 0.6 + (rand01(rng) - 0.5) * 4;
    }
  };

  if (path) path.push(px, py, ang);

  let ended = false;
  while (!ended && dur > 0 && tick < MAX_TICKS) {
    tick++;
    for (let s = 0; s < SUBSTEPS; s++) {
      vy += GRAVITY * DT;
      if (vy > MAX_FALL) vy = MAX_FALL;
      px += vx * DT;
      py += vy * DT;
      ang += om * DT;
      // Стенки шахты — отскок без урона.
      if (px < R) {
        px = R;
        if (vx < 0) vx = -vx * 0.5;
      } else if (px > COLS - R) {
        px = COLS - R;
        if (vx > 0) vx = -vx * 0.5;
      }
      collide();
      if (dur <= 0) break;
      if (py + R >= MAX_DEPTH) {
        ended = true; // дно шахты
        break;
      }
    }
    if (path) path.push(px, py, ang);
  }
  events.push({ k: 'end', t: tick });

  const scaled = Math.floor((total * PAYOUT_NUM) / PAYOUT_DEN);
  const multiplier = Math.min(MAX_MULTIPLIER, scaled / 1000);

  return {
    version: ENGINE_VERSION,
    seed,
    tool,
    startX,
    grid: original,
    events,
    path,
    ticks: tick,
    rawValue: total,
    multiplier,
    blocksBroken: broken,
    depth: Math.max(0, Math.floor(py)),
  };
}
