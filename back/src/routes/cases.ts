import { Hono, type Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { db } from "../db";
import { casesRound, user } from "../db/schema";
import { auth } from "../lib/auth";
import { gameHistoryBuffer } from "../lib/gameHistoryBuffer";
import { userCache } from "../lib/userCache";
import { getBalanceScale, MAX_PAYOUT_PER_ROUND } from "../lib/balanceScaler";

type Variables = {
  user: typeof auth.$Infer.Session.user | null;
  session: typeof auth.$Infer.Session.session | null;
};

const cases = new Hono<{ Variables: Variables }>();

function fail(c: Context, message: string, status: ContentfulStatusCode) {
  return c.json({ message }, status);
}

export type CaseRarity = 'common' | 'uncommon' | 'epic' | 'legendary' | 'mythic';

export interface RarityDef {
  id: CaseRarity;
  label: string;
  weight: number;
  multipliers: number[];
  color: string;
  borderColor: string;
  bgGradient: string;
  winnerGradient: string;
}

export const RARITIES: Record<CaseRarity, RarityDef> = {
  common: {
    id: 'common',
    label: 'Обычный',
    weight: 650,
    multipliers: [0.2, 0.4],
    color: 'rgb(154, 166, 187)',
    borderColor: 'rgb(154, 166, 187)',
    bgGradient: 'linear-gradient(160deg, rgb(38, 42, 49) 0%, rgb(24, 27, 33) 100%)',
    winnerGradient: 'linear-gradient(160deg, rgb(135, 148, 168) 0%, rgb(81, 91, 110) 100%)',
  },
  uncommon: {
    id: 'uncommon',
    label: 'Необычный',
    weight: 220,
    multipliers: [0.7, 0.9, 1.2, 1.5],
    color: 'rgb(76, 195, 245)',
    borderColor: 'rgb(76, 195, 245)',
    bgGradient: 'linear-gradient(160deg, rgb(15, 39, 51) 0%, rgb(11, 28, 38) 100%)',
    winnerGradient: 'linear-gradient(160deg, rgb(76, 195, 245) 0%, rgb(29, 159, 212) 100%)',
  },
  epic: {
    id: 'epic',
    label: 'Эпический',
    weight: 90,
    multipliers: [2.4, 3.5, 5.0],
    color: 'rgb(184, 132, 255)',
    borderColor: 'rgb(184, 132, 255)',
    bgGradient: 'linear-gradient(160deg, rgb(34, 20, 54) 0%, rgb(25, 15, 42) 100%)',
    winnerGradient: 'linear-gradient(160deg, rgb(184, 132, 255) 0%, rgb(124, 58, 237) 100%)',
  },
  legendary: {
    id: 'legendary',
    label: 'Легендарный',
    weight: 35,
    multipliers: [7.2, 10.0, 15.0],
    color: 'rgb(255, 191, 77)',
    borderColor: 'rgb(255, 191, 77)',
    bgGradient: 'linear-gradient(160deg, rgb(46, 29, 16) 0%, rgb(36, 22, 12) 100%)',
    winnerGradient: 'linear-gradient(160deg, rgb(255, 191, 77) 0%, rgb(217, 119, 6) 100%)',
  },
  mythic: {
    id: 'mythic',
    label: 'Мифический',
    weight: 5,
    multipliers: [48.3, 100.0, 200.0],
    color: 'rgb(255, 121, 225)',
    borderColor: 'rgb(255, 121, 225)',
    bgGradient: 'linear-gradient(160deg, rgb(42, 20, 48) 0%, rgb(22, 26, 46) 100%)',
    winnerGradient: 'linear-gradient(135deg, rgb(255, 79, 216) 0%, rgb(139, 92, 246) 48%, rgb(52, 211, 224) 100%)',
  },
};

export const CASE_PRICES: Record<string, { id: string; name: string; price: number; icon: string }> = {
  common:    { id: 'common',    name: 'Обычный кейс',      price: 100,   icon: '🥉' },
  rare:      { id: 'rare',      name: 'Редкий кейс',       price: 500,   icon: '🥈' },
  legendary: { id: 'legendary', name: 'Легендарный кейс', price: 2000,  icon: '🥇' },
  mega:      { id: 'mega',      name: 'Мега кейс',          price: 5000,  icon: '💎' },
  elite:     { id: 'elite',     name: 'Элитный кейс',       price: 10000, icon: '💠' },
};

const TOTAL_WEIGHT = Object.values(RARITIES).reduce((acc, r) => acc + r.weight, 0);

// Масштаб выплат для RTP ≈ 1.90 (при текущих весах редкостей матожидание ≈ 1.7147).
const PAYOUT_SCALE = 1.1081;

function getRandomRarity(): CaseRarity {
  let rand = Math.random() * TOTAL_WEIGHT;
  for (const rarity of Object.values(RARITIES)) {
    if (rand < rarity.weight) {
      return rarity.id;
    }
    rand -= rarity.weight;
  }
  return 'common';
}

function getRandomMultiplier(rarityId: CaseRarity): number {
  const mults = RARITIES[rarityId].multipliers;
  const idx = Math.floor(Math.random() * mults.length);
  return mults[idx];
}

export interface CaseCardData {
  rarity: CaseRarity;
  rarityLabel: string;
  multiplier: number;
  prize: number;
}

function generateCard(lineBet: number, rarityId?: CaseRarity): CaseCardData {
  const rarity = rarityId || getRandomRarity();
  const mult = Number((getRandomMultiplier(rarity) * PAYOUT_SCALE).toFixed(2));
  const prize = Number((lineBet * mult).toFixed(2));
  return {
    rarity,
    rarityLabel: RARITIES[rarity].label,
    multiplier: mult,
    prize,
  };
}

const STRIP_LENGTH = 45;
const WINNER_INDEX = 38; // 0-indexed winner target position

cases.post("/spin", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const body = (await c.req.json().catch(() => ({}))) as {
    caseId?: string;
    lines?: number;
  };

  const caseKey = body.caseId && CASE_PRICES[body.caseId] ? body.caseId : 'common';
  const caseDef = CASE_PRICES[caseKey];
  const lineBet = caseDef.price;

  const linesCount = Math.min(3, Math.max(1, Math.floor(Number(body.lines) || 1)));
  const totalBet = lineBet * linesCount;

  // Резервируем ставку заранее — игра невозможна без достаточного баланса.
  try {
    await userCache.adjustUserBalance(u.id, -totalBet);
  } catch (e) {
    const msg = (e as Error).message;
    if (msg === "insufficient_balance") return fail(c, "Недостаточно средств", 402);
    if (msg === "user_not_found") return fail(c, "Пользователь не найден", 404);
    throw e;
  }

  const lineResults: Array<{
    lineIndex: number;
    winnerIndex: number;
    winningCard: CaseCardData;
    strip: CaseCardData[];
    linePayout: number;
    lineMultiplier: number;
    rarity: CaseRarity;
  }> = [];

  let totalPayout = 0;
  let highestRarityOrder = 0;
  const rarityOrderMap: Record<CaseRarity, number> = {
    common: 1,
    uncommon: 2,
    epic: 3,
    legendary: 4,
    mythic: 5,
  };
  let maxRarity: CaseRarity = 'common';

  // Регулятор баланса: масштаб выплат по текущему балансу.
  const payoutScale = await getBalanceScale(u.id);

  for (let l = 0; l < linesCount; l++) {
    const strip: CaseCardData[] = [];
    // Generate strip items
    for (let i = 0; i < STRIP_LENGTH; i++) {
      if (i === WINNER_INDEX) {
        // Pick winning card
        const winningCard = generateCard(lineBet);
        strip.push(winningCard);
      } else {
        strip.push(generateCard(lineBet));
      }
    }

    const winningCard = strip[WINNER_INDEX];
    // Масштабируем выигрышную карту под текущий баланс (показ и выплата согласованы).
    const scaledPrize = Math.floor(winningCard.prize * payoutScale);
    winningCard.prize = scaledPrize;
    winningCard.multiplier = Number((scaledPrize / lineBet).toFixed(2));
    const linePayout = scaledPrize;
    const lineMultiplier = winningCard.multiplier;
    totalPayout += linePayout;

    const rOrder = rarityOrderMap[winningCard.rarity];
    if (rOrder > highestRarityOrder) {
      highestRarityOrder = rOrder;
      maxRarity = winningCard.rarity;
    }

    lineResults.push({
      lineIndex: l,
      winnerIndex: WINNER_INDEX,
      winningCard,
      strip,
      linePayout,
      lineMultiplier,
      rarity: winningCard.rarity,
    });
  }

  totalPayout = Number(totalPayout.toFixed(2));
  // Потолок выплаты за раунд — защита от единичных выплат-миллионов.
  if (totalPayout > MAX_PAYOUT_PER_ROUND) totalPayout = MAX_PAYOUT_PER_ROUND;
  const aggregateMultiplier = Number((totalPayout / totalBet).toFixed(2));

  let outcome: 'win' | 'loss' | 'neutral' = 'loss';
  if (totalPayout > totalBet) {
    outcome = 'win';
  } else if (totalPayout > 0) {
    outcome = 'neutral';
  }

  const roundRecord = {
    id: crypto.randomUUID(),
    userId: u.id,
    bet: totalBet,
    caseId: caseKey,
    lines: linesCount,
    lineBet,
    rarity: maxRarity,
    multiplier: aggregateMultiplier,
    payout: Math.round(totalPayout),
    outcome,
    details: JSON.stringify(lineResults.map((l) => ({
      lineIndex: l.lineIndex,
      winningCard: l.winningCard,
      linePayout: l.linePayout,
      lineMultiplier: l.lineMultiplier,
    }))),
    createdAt: new Date(),
  };

  // Зачисляем выигрыш (0 при проигрыше).
  const newBalance = await userCache.adjustUserBalance(u.id, Math.round(totalPayout));
  void gameHistoryBuffer.pushRound('cases', u.id, roundRecord);

  return c.json({
    balance: newBalance,
    totalBet,
    totalPayout,
    multiplier: aggregateMultiplier,
    outcome,
    rarity: maxRarity,
    caseId: caseKey,
    linesCount,
    lineBet,
    winnerIndex: WINNER_INDEX,
    lines: lineResults,
  });
});

cases.get("/history", async (c) => {
  const u = c.get("user");
  if (!u) return fail(c, "Unauthorized", 401);

  const raw = Number(c.req.query("limit"));
  const limit = Math.min(50, Math.max(1, Number.isFinite(raw) ? Math.floor(raw) : 30));

  const items = await gameHistoryBuffer.getHistory('cases', u.id, limit);
  const stats = await gameHistoryBuffer.getStats('cases', u.id);

  return c.json({
    items,
    stats,
  });
});

export default cases;
