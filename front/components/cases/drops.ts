import type { CaseRarity } from '@/lib/cases/engine';

/**
 * Содержимое кейса — зеркало back/src/routes/cases.ts (RARITIES, PAYOUT_SCALE) и
 * back/src/lib/balanceScaler.ts (MAX_PAYOUT_PER_ROUND). Меняется бэк — править здесь же.
 * Все пять кейсов по содержимому одинаковы: приз = цена кейса × множитель карточки.
 */

// Множители редкостей на бэке умножаются на этот масштаб (RTP ≈ 1.90).
const PAYOUT_SCALE = 1.1081;

/** Потолок выплаты за раунд (все линии вместе). */
export const MAX_PAYOUT_PER_ROUND = 100_000;

export interface DropRowItem {
  rarity: CaseRarity;
  rarityName: string;
  rarityColor: string;
  /** Шанс выпадения редкости, % (вес / сумма весов). */
  chance: number;
  /** Возможные множители карточки (уже с PAYOUT_SCALE), по возрастанию. */
  multipliers: number[];
}

const RAW: Array<{ rarity: CaseRarity; name: string; color: string; weight: number; mults: number[] }> = [
  { rarity: 'mythic', name: 'Мифический', color: 'rgb(255, 121, 225)', weight: 5, mults: [48.3, 100, 200] },
  { rarity: 'legendary', name: 'Легендарный', color: 'rgb(255, 191, 77)', weight: 35, mults: [7.2, 10, 15] },
  { rarity: 'epic', name: 'Эпический', color: 'rgb(184, 132, 255)', weight: 90, mults: [2.4, 3.5, 5] },
  { rarity: 'uncommon', name: 'Необычный', color: 'rgb(76, 195, 245)', weight: 220, mults: [0.7, 0.9, 1.2, 1.5] },
  { rarity: 'common', name: 'Обычный', color: 'rgb(154, 166, 187)', weight: 650, mults: [0.2, 0.4] },
];

const TOTAL_WEIGHT = RAW.reduce((sum, r) => sum + r.weight, 0);

export const DROPS_DEFINITION: DropRowItem[] = RAW.map((r) => ({
  rarity: r.rarity,
  rarityName: r.name,
  rarityColor: r.color,
  chance: (r.weight / TOTAL_WEIGHT) * 100,
  multipliers: r.mults.map((m) => Number((m * PAYOUT_SCALE).toFixed(2))),
}));

function byRarity(rarity: CaseRarity): DropRowItem {
  return DROPS_DEFINITION.find((d) => d.rarity === rarity) ?? DROPS_DEFINITION[DROPS_DEFINITION.length - 1];
}

/** Холостой ряд ленты (до первого открытия): реальные карточки, мифическая — по центру. */
export const IDLE_CARDS: Array<{ rarity: CaseRarity; multiplier: number }> = [
  { rarity: 'legendary', multiplier: byRarity('legendary').multipliers[0] },
  { rarity: 'epic', multiplier: byRarity('epic').multipliers[1] },
  { rarity: 'uncommon', multiplier: byRarity('uncommon').multipliers[1] },
  { rarity: 'mythic', multiplier: byRarity('mythic').multipliers[0] },
  { rarity: 'common', multiplier: byRarity('common').multipliers[1] },
  { rarity: 'uncommon', multiplier: byRarity('uncommon').multipliers[3] },
  { rarity: 'common', multiplier: byRarity('common').multipliers[0] },
  { rarity: 'epic', multiplier: byRarity('epic').multipliers[0] },
];
export const IDLE_CENTER = 3;

/** «0,5%», «3,5%», «65%». */
export function formatChance(p: number): string {
  return `${p.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
}

/** Диапазон множителей редкости: «×53.5–221.6». */
export function formatMultRange(mults: number[]): string {
  const lo = Math.floor(Math.min(...mults) * 10) / 10;
  const hi = Math.floor(Math.max(...mults) * 10) / 10;
  return lo === hi ? `×${lo}` : `×${lo}–${hi}`;
}

/** Денежный формат: «100 ₽», «4 839,51 ₽». */
export function formatMoney(n: number): string {
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
}

/** Множитель карточки — округление вниз до 1 знака: ×7.9, ×53.5, ×0.2. */
export function formatMult(m: number): string {
  return `×${Math.floor(m * 10) / 10}`;
}
