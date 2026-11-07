// ВНИМАНИЕ: файл продублирован 1-в-1 в front/lib/minedrop/economy.ts и back/src/lib/minedropEconomy.ts.
// Правь оба: интерфейс показывает полосы выплат из этой копии, сервер платит по своей.
//
// Экономика MineDrop.
//
// Раунд всегда попадает в одну из трёх полос выплат (множитель к ставке):
//   выигрыш — ×1.05–1.75;
//   возврат — ×0.20–0.50 (частичный возврат, как LDW в слотах);
//   джекпот — от ×3 до ×125 (редко, только алмаз/сундук), 0.3% раундов.
//
// Какую полосу получит раунд, решает винрейт. Винрейт зависит от баланса:
// до 100 000 ₽ он высокий (85% на нуле, 65% на 30 тыс.), выше — заметно ниже
// (45% на 100 тыс., 18% на миллионе). Точка равновесия ≈ 38 000 ₽:
// ниже баланс растёт, выше — сползает обратно, поэтому он держится 30–50 тыс.
// Кривая откалибрована Монте-Карло на движке (2 500 раундов на точку):
// RTP 1.27 при нуле, 1.05 на 30 тыс., 1.01 на 40 тыс., 0.86 на 100 тыс.,
// 0.74 на 300 тыс., 0.61 на миллионе.

import { randomSeed, simulateRound, type PickaxeRound } from './pickaxeEngine';

export type RoundClass = 'win' | 'loss' | 'jackpot';

/** Полоса выигрышного раунда. */
export const WIN_BAND: readonly [number, number] = [1.05, 1.75];
/** Полоса частичного возврата. */
export const LOSS_BAND: readonly [number, number] = [0.2, 0.5];
/** Джекпот (сундук/алмаз) — редкий раунд. */
export const JACKPOT_MIN = 3;
export const JACKPOT_MAX = 125;
/** Вероятность джекпота за раунд. */
export const JACKPOT_CHANCE = 0.003;

/**
 * Кривая винрейта: пары [баланс, вероятность выигрыша].
 * Между точками — линейно, выше последней — последнее значение.
 * Откалибрована Монте-Карло на движке: RTP пересекает 1.0 на ~38 000 ₽.
 */
export const WIN_RATE_CURVE: ReadonlyArray<readonly [number, number]> = [
  [0, 0.85],
  [10_000, 0.82],
  [20_000, 0.72],
  [30_000, 0.64],
  [40_000, 0.6],
  [50_000, 0.58],
  [70_000, 0.52],
  [100_000, 0.45],
  [200_000, 0.36],
  [300_000, 0.3],
  [1_000_000, 0.18],
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
