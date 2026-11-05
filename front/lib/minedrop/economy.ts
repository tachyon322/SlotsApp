// ВНИМАНИЕ: файл продублирован 1-в-1 в front/lib/minedrop/economy.ts и back/src/lib/minedropEconomy.ts.
// Правь оба: интерфейс показывает полосы выплат из этой копии, сервер платит по своей.
//
// Экономика MineDrop.
//
// Раунд всегда попадает в одну из трёх полос выплат (множитель к ставке):
//   выигрыш — ×1.05–2.0;
//   возврат — ×0.30–0.90 (частичный возврат, как LDW в слотах);
//   джекпот — от ×3 до ×125 (редко, только алмаз/сундук).
//
// Какую полосу получит раунд, решает винрейт. Винрейт зависит от баланса:
// чем выше баланс, тем реже выигрыш. Точка равновесия — около 40 000 ₽:
// ниже баланс растёт, выше — сползает обратно, поэтому он держится 30–50 тыс.

import { randomSeed, simulateRound, type PickaxeRound } from './pickaxeEngine';

export type RoundClass = 'win' | 'loss' | 'jackpot';

/** Полоса выигрышного раунда. */
export const WIN_BAND: readonly [number, number] = [1.05, 2.0];
/** Полоса частичного возврата. */
export const LOSS_BAND: readonly [number, number] = [0.3, 0.9];
/** Джекпот (сундук/алмаз) — редкий раунд. */
export const JACKPOT_MIN = 3;
export const JACKPOT_MAX = 125;
/** Вероятность джекпота за раунд. */
export const JACKPOT_CHANCE = 0.005;

/**
 * Кривая винрейта: пары [баланс, вероятность выигрыша].
 * Между точками — линейно, выше последней — последнее значение.
 * Откалибрована Монте-Карло на движке: RTP пересекает 1.0 на ~40 000 ₽.
 */
export const WIN_RATE_CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.72],
  [10_000, 0.6],
  [30_000, 0.5],
  [40_000, 0.46],
  [50_000, 0.42],
  [100_000, 0.32],
  [300_000, 0.2],
  [1_000_000, 0.1],
];

/** Вероятность выигрыша для текущего баланса. */
export function winRateForBalance(balance: number): number {
  const b = Math.max(0, balance);
  const first = WIN_RATE_CURVE[0];
  if (b <= first[0]) return first[1];
  for (let i = 1; i < WIN_RATE_CURVE.length; i++) {
    const [b0, p0] = WIN_RATE_CURVE[i - 1];
    const [b1, p1] = WIN_RATE_CURVE[i];
    if (b <= b1) return p0 + ((p1 - p0) * (b - b0)) / (b1 - b0);
  }
  return WIN_RATE_CURVE[WIN_RATE_CURVE.length - 1][1];
}

/** Класс раунда по балансу. */
export function pickRoundClass(balance: number, rng: () => number = Math.random): RoundClass {
  const roll = rng();
  if (roll < JACKPOT_CHANCE) return 'jackpot';
  return roll < JACKPOT_CHANCE + winRateForBalance(balance) ? 'win' : 'loss';
}

/**
 * Полоса выплат для класса раунда. Джекпот ограничивается сверху так,
 * чтобы выплата за раунд не превысила maxPayout.
 */
export function bandForClass(
  cls: RoundClass,
  bet: number,
  maxPayout = 100_000,
): readonly [number, number] {
  if (cls === 'jackpot') {
    const cap = maxPayout / Math.max(1, bet);
    return [JACKPOT_MIN, Math.max(JACKPOT_MIN, Math.min(JACKPOT_MAX, cap))];
  }
  return cls === 'win' ? WIN_BAND : LOSS_BAND;
}

/** Сколько seed'ов перебираем, прежде чем взять ближайший. */
export const MAX_SEED_ATTEMPTS = 60;

export interface FoundRound {
  seed: number;
  round: PickaxeRound;
  /** Попал ли раунд в полосу. false — исчерпали попытки, взяли ближайший. */
  inBand: boolean;
  attempts: number;
}

/**
 * Подбирает seed, чей раунд попадает в полосу выплат.
 * Раунд при этом настоящий: клиент проигрывает его по тому же seed,
 * и выплата равна стоимости разбитой руды × коэффициент — правила не врут.
 */
export function findRoundInBand(band: readonly [number, number]): FoundRound {
  let best: FoundRound | null = null;
  let bestDistance = Infinity;

  for (let attempt = 1; attempt <= MAX_SEED_ATTEMPTS; attempt++) {
    const seed = randomSeed();
    const round = simulateRound(seed);
    const m = round.multiplier;
    if (m >= band[0] && m <= band[1]) {
      return { seed, round, inBand: true, attempts: attempt };
    }
    const distance = m < band[0] ? band[0] - m : m - band[1];
    if (distance < bestDistance) {
      bestDistance = distance;
      best = { seed, round, inBand: false, attempts: attempt };
    }
  }

  return best!;
}
