import type { AchievementView } from '@/lib/api';

// Арт раздела «Бонусы»: всё — объекты «матовое стекло» с прозрачным фоном.
const ACH = '/images/web-hub/v1/pages/achievements';
const LG = '/lg/img';

const achArt = (name: string) => `${ACH}/achievement-${name}-320w.webp`;

/** Награды недели: от монеты к сундукам растущей редкости, 7-й день — джекпот. */
export const DAY_ART = [
  `${LG}/token.webp`,
  `${LG}/gift.webp`,
  `${LG}/cases-common.webp`,
  `${LG}/cases-uncommon.webp`,
  `${LG}/cases-epic.webp`,
  `${LG}/cases-legendary.webp`,
  `${LG}/cases-mythic.webp`,
];

export const LEVEL_ART = `${LG}/cup.png`;
export const INVITE_ART = achArt('referral-network-node');
export const EMPTY_ART = `${LG}/obj-trophy.webp`;

/** Иконка достижения или задания дня: по игре, иначе по метрике. */
export function achievementArt(item: Pick<AchievementView, 'metric' | 'game' | 'target'>): string {
  switch (item.metric) {
    case 'winStreak':
    case 'winStreakGame':
    case 'highMultStreak':
      return achArt('win-streak-chain');
    case 'winAfterLosses':
      return achArt('comeback-return-arc');
    case 'bigMult':
      return achArt('multiplier-breakthrough-core');
  }
  if (item.game) return achArt(`game-${item.game}-object`);
  switch (item.metric) {
    case 'rounds':
      return achArt(item.target <= 1 ? 'round-activation-core' : 'round-volume-orbit');
    case 'wins':
      return achArt('victory-count-core');
    case 'distinctGames':
      return achArt('game-diversity-constellation');
    case 'bets':
      return achArt('wager-volume-core');
    case 'promos':
      return achArt('promo-ticket');
    case 'wheel':
      return `${LG}/wheel-256.webp`;
    default:
      return EMPTY_ART;
  }
}

export interface AchievementGroup {
  key: string;
  label: string;
  art: string;
  match: (item: AchievementView) => boolean;
}

const general = (metrics: string[]) => (a: AchievementView) => !a.game && metrics.includes(a.metric);
const byGame = (game: string) => (a: AchievementView) => a.game === game;

/** Группы на странице достижений: сначала общие по смыслу, затем по играм. */
export const ACHIEVEMENT_GROUPS: AchievementGroup[] = [
  { key: 'play', label: 'Игра', art: achArt('round-volume-orbit'), match: general(['rounds', 'distinctGames', 'wheel']) },
  { key: 'wins', label: 'Победы', art: achArt('victory-count-core'), match: general(['wins']) },
  {
    key: 'streaks',
    label: 'Серии и множители',
    art: achArt('win-streak-chain'),
    match: general(['winStreak', 'winAfterLosses', 'highMultStreak', 'bigMult']),
  },
  { key: 'bets', label: 'Ставки и промокоды', art: achArt('wager-volume-core'), match: general(['bets', 'promos']) },
  { key: 'slots', label: 'Слоты', art: achArt('game-slots-object'), match: byGame('slots') },
  { key: 'crash', label: 'Crash', art: achArt('game-crash-object'), match: byGame('crash') },
  { key: 'mines', label: 'Mines', art: achArt('game-mines-object'), match: byGame('mines') },
  { key: 'cases', label: 'Кейсы', art: achArt('game-cases-object'), match: byGame('cases') },
  { key: 'minedrop', label: 'Mine Drop', art: achArt('game-minedrop-object'), match: byGame('minedrop') },
  { key: 'blockblast', label: 'Block Blast', art: achArt('game-blockblast-object'), match: byGame('blockblast') },
];

export const OTHER_GROUP: AchievementGroup = { key: 'other', label: 'Другое', art: EMPTY_ART, match: () => true };
