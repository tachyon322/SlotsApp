// UI-хелперы MineDrop. Игровая логика — в ./pickaxeEngine (общая с сервером).

import type { BlockId } from './pickaxeEngine';

export const PRESETS = [10, 50, 100, 500, 1000];
export const DEFAULT_BET = 100;

/** Текстуры блоков (null — рисуется процедурно на canvas). */
export const BLOCK_IMAGE: Record<BlockId, string | null> = {
  air: null,
  grass: '/img/minecraft/grassBlock.png',
  dirt: '/img/minecraft/dirtBlock.png',
  stone: '/img/minecraft/stoneBlock.png',
  coal: '/img/minecraft/coalBlock.png',
  iron: '/img/minecraft/ironBlock.png',
  redstone: '/img/minecraft/redstoneBlock.png',
  gold: '/img/minecraft/goldBlock.png',
  diamond: '/img/minecraft/diamondBlock.png',
  chest: '/img/minecraft/chestBlock.png',
  tnt: null,
  repair: null,
};

/** Основной цвет блока — для частиц и превью без текстуры. */
export const BLOCK_COLOR: Record<BlockId, string> = {
  air: 'transparent',
  grass: '#5fa33a',
  dirt: '#8b5a2b',
  stone: '#8a8a8a',
  coal: '#3a3a3a',
  iron: '#d8af93',
  redstone: '#d42a2a',
  gold: '#f5c542',
  diamond: '#5de0e6',
  chest: '#b07a2a',
  tnt: '#d23b2b',
  repair: '#35c759',
};

export function formatRub(amount: number): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
}

export function formatMultiplier(m: number): string {
  return `×${m.toFixed(2)}`;
}
