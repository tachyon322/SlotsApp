import type { CaseRarity } from '@/lib/cases/engine';

/**
 * Таблица дропов (содержимое кейса) — множители зеркалят back/src/routes/cases.ts.
 * Используется в модалке «Содержимое» и в idle-ряде рулетки (порядок idle —
 * как в референсе: legendary, epic, uncommon, mythic (featured), common, common).
 */
export interface DropRowItem {
  rarity: CaseRarity;
  rarityName: string;
  rarityColor: string;
  swatchGradient: string;
  multText: string;
  multFactor: number;
  chanceText: string;
}

export const DROPS_DEFINITION: DropRowItem[] = [
  {
    rarity: 'mythic',
    rarityName: 'Мифический',
    rarityColor: 'rgb(255, 121, 225)',
    swatchGradient: 'linear-gradient(135deg, rgb(255, 79, 216) 0%, rgb(139, 92, 246) 48%, rgb(52, 211, 224) 100%)',
    multText: '×48.3',
    multFactor: 48.3951,
    chanceText: '0.50%',
  },
  {
    rarity: 'legendary',
    rarityName: 'Легендарный',
    rarityColor: 'rgb(255, 191, 77)',
    swatchGradient: 'linear-gradient(160deg, rgb(255, 194, 77) 0%, rgb(240, 118, 60) 100%)',
    multText: '×7.2',
    multFactor: 7.2593,
    chanceText: '2.5%',
  },
  {
    rarity: 'epic',
    rarityName: 'Эпический',
    rarityColor: 'rgb(184, 132, 255)',
    swatchGradient: 'linear-gradient(160deg, rgb(176, 123, 255) 0%, rgb(124, 58, 237) 100%)',
    multText: '×2.4',
    multFactor: 2.4198,
    chanceText: '7.0%',
  },
  {
    rarity: 'uncommon',
    rarityName: 'Необычный',
    rarityColor: 'rgb(76, 195, 245)',
    swatchGradient: 'linear-gradient(160deg, rgb(76, 195, 245) 0%, rgb(29, 159, 212) 100%)',
    multText: '×0.9',
    multFactor: 0.9679,
    chanceText: '15.0%',
  },
  {
    rarity: 'common',
    rarityName: 'Обычный',
    rarityColor: 'rgb(154, 166, 187)',
    swatchGradient: 'linear-gradient(160deg, rgb(135, 148, 168) 0%, rgb(81, 91, 110) 100%)',
    multText: '×0.4',
    multFactor: 0.483951,
    chanceText: '25.0%',
  },
  {
    rarity: 'common',
    rarityName: 'Обычный',
    rarityColor: 'rgb(154, 166, 187)',
    swatchGradient: 'linear-gradient(160deg, rgb(135, 148, 168) 0%, rgb(81, 91, 110) 100%)',
    multText: '×0.2',
    multFactor: 0.241951,
    chanceText: '50.0%',
  },
];

/** Порядок idle-ряда рулетки (индексы в DROPS_DEFINITION), 1:1 из референса. */
export const IDLE_ORDER = [1, 2, 3, 0, 4, 5];

export const LEGEND_ITEMS = [
  { label: 'Обычный', color: 'rgb(154, 166, 187)' },
  { label: 'Необычный', color: 'rgb(76, 195, 245)' },
  { label: 'Редкий', color: 'rgb(91, 155, 255)' },
  { label: 'Эпический', color: 'rgb(184, 132, 255)' },
  { label: 'Легендарный', color: 'rgb(255, 191, 77)' },
  { label: 'Мифический', color: 'rgb(255, 121, 225)' },
];

/** Денежный формат референса: «100 ₽», «4 839,51 ₽». */
export function formatMoney(n: number): string {
  return `${n.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ₽`;
}

/** Множитель карточки референса — округление вниз до 1 знака: ×7.2, ×48.3, ×0.2. */
export function formatMult(m: number): string {
  return `×${Math.floor(m * 10) / 10}`;
}
