export type GameId = 'slots' | 'mines' | 'crash' | 'cases' | 'blockblast' | 'minedrop';

export const GAME_IDS: GameId[] = ['slots', 'mines', 'crash', 'cases', 'blockblast', 'minedrop'];

export type AchievementMetric =
  | 'rounds'
  | 'roundsGame'
  | 'wins'
  | 'winsGame'
  | 'distinctGames'
  | 'bets'
  | 'winStreak'
  | 'winStreakGame'
  | 'winAfterLosses'
  | 'highMultStreak'
  | 'bigMult'
  | 'wheel'
  | 'promos';

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  emoji: string;
  reward: number;
  metric: AchievementMetric;
  target: number;
  game?: GameId;
}

export interface ChallengeDef {
  id: string;
  title: string;
  description: string;
  emoji: string;
  reward: number;
  metric: AchievementMetric;
  target: number;
  game?: GameId;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Первые шаги
  { id: 'first_round', title: 'Первый спин', description: 'Сыграй свой первый раунд', emoji: '🎰', reward: 100, metric: 'rounds', target: 1 },
  { id: 'first_win', title: 'Первый выигрыш', description: 'Выиграй раунд в любой игре', emoji: '🎯', reward: 250, metric: 'wins', target: 1 },
  { id: 'rounds_3', title: 'Первый осмотр', description: 'Сыграй 3 раунда', emoji: '🧭', reward: 300, metric: 'rounds', target: 3 },
  { id: 'first_slots', title: 'Слотовод', description: 'Сыграй раунд в Слот-Машине', emoji: '🎰', reward: 100, metric: 'roundsGame', target: 1, game: 'slots' },
  { id: 'first_crash', title: 'Пилот', description: 'Сыграй раунд в Crash', emoji: '🚀', reward: 100, metric: 'roundsGame', target: 1, game: 'crash' },
  { id: 'first_mines', title: 'Сапёр', description: 'Сыграй раунд в Mines', emoji: '💣', reward: 100, metric: 'roundsGame', target: 1, game: 'mines' },
  { id: 'first_cases', title: 'Кейсовод', description: 'Открой свой первый кейс', emoji: '📦', reward: 100, metric: 'roundsGame', target: 1, game: 'cases' },
  { id: 'first_minedrop', title: 'Шахтёр', description: 'Сыграй раунд в MineDrop', emoji: '🪙', reward: 100, metric: 'roundsGame', target: 1, game: 'minedrop' },
  { id: 'first_blockblast', title: 'Подрывник', description: 'Сыграй раунд в BlockBlast', emoji: '🧱', reward: 100, metric: 'roundsGame', target: 1, game: 'blockblast' },
  { id: 'first_wheel', title: 'Первое колесо', description: 'Крутани Колесо Фортуны впервые', emoji: '🎡', reward: 150, metric: 'wheel', target: 1 },
  { id: 'first_promo', title: 'Первый промокод', description: 'Активируй первый промокод', emoji: '🎟️', reward: 150, metric: 'promos', target: 1 },

  // Разные игры
  { id: 'explore_2', title: 'Исследователь', description: 'Сыграй в 2 разные игры', emoji: '🔀', reward: 100, metric: 'distinctGames', target: 2 },
  { id: 'universal_4', title: 'Универсал', description: 'Сыграй в 4 разные игры', emoji: '🧭', reward: 250, metric: 'distinctGames', target: 4 },
  { id: 'all_games', title: 'Разыгравшийся', description: 'Сыграй во все 6 игр', emoji: '🌈', reward: 500, metric: 'distinctGames', target: 6 },

  // Раунды
  { id: 'rounds_50', title: 'Разогрев', description: 'Сыграй 50 раундов', emoji: '🔢', reward: 500, metric: 'rounds', target: 50 },
  { id: 'rounds_250', title: 'Завсегдатай', description: 'Сыграй 250 раундов', emoji: '📈', reward: 1000, metric: 'rounds', target: 250 },
  { id: 'rounds_1000', title: 'Тысячник', description: 'Сыграй 1000 раундов', emoji: '🏅', reward: 3000, metric: 'rounds', target: 1000 },
  { id: 'slots_100', title: 'Маньяк слотов', description: 'Сыграй 100 раундов в Слот-Машине', emoji: '🎰', reward: 200, metric: 'roundsGame', target: 100, game: 'slots' },
  { id: 'crash_100', title: 'Сотня взлётов', description: 'Сыграй 100 раундов в Crash', emoji: '🚀', reward: 200, metric: 'roundsGame', target: 100, game: 'crash' },
  { id: 'cases_100', title: 'Коллекционер', description: 'Открой 100 кейсов', emoji: '📦', reward: 200, metric: 'roundsGame', target: 100, game: 'cases' },
  { id: 'mines_100', title: 'Минный король', description: 'Сыграй 100 раундов в Mines', emoji: '💣', reward: 200, metric: 'roundsGame', target: 100, game: 'mines' },
  { id: 'minedrop_100', title: 'Глубокая шахта', description: 'Сыграй 100 раундов в MineDrop', emoji: '🔥', reward: 200, metric: 'roundsGame', target: 100, game: 'minedrop' },
  { id: 'blockblast_100', title: 'Разрушитель', description: 'Сыграй 100 раундов в BlockBlast', emoji: '🔥', reward: 200, metric: 'roundsGame', target: 100, game: 'blockblast' },

  // Победы
  { id: 'wins_50', title: 'Полусотня побед', description: 'Выиграй 50 раундов', emoji: '🏆', reward: 700, metric: 'wins', target: 50 },
  { id: 'wins_250', title: 'Победитель', description: 'Выиграй 250 раундов', emoji: '👑', reward: 2000, metric: 'wins', target: 250 },
  { id: 'wins_1000', title: 'Чемпион', description: 'Выиграй 1000 раундов', emoji: '🌟', reward: 500, metric: 'wins', target: 1000 },
  { id: 'wins_cases_10', title: 'Везучий кейсовод', description: 'Выиграй 10 раундов в Кейсах', emoji: '🍀', reward: 150, metric: 'winsGame', target: 10, game: 'cases' },
  { id: 'wins_minedrop_10', title: 'Везучий шахтёр', description: 'Выиграй 10 раундов в MineDrop', emoji: '🍀', reward: 150, metric: 'winsGame', target: 10, game: 'minedrop' },
  { id: 'wins_crash_10', title: 'Удачный пилот', description: 'Выиграй 10 раундов в Crash', emoji: '🍀', reward: 150, metric: 'winsGame', target: 10, game: 'crash' },
  { id: 'wins_slots_10', title: 'Везучий слотовод', description: 'Выиграй 10 раундов в Слотах', emoji: '🍀', reward: 150, metric: 'winsGame', target: 10, game: 'slots' },
  { id: 'wins_mines_10', title: 'Осторожный сапёр', description: 'Выиграй 10 раундов в Mines', emoji: '🍀', reward: 150, metric: 'winsGame', target: 10, game: 'mines' },
  { id: 'wins_blockblast_10', title: 'Везучий подрывник', description: 'Выиграй 10 раундов в BlockBlast', emoji: '🍀', reward: 150, metric: 'winsGame', target: 10, game: 'blockblast' },
  { id: 'wins_slots_50', title: 'Мастер слотов', description: 'Выиграй 50 раундов в Слотах', emoji: '🏆', reward: 500, metric: 'winsGame', target: 50, game: 'slots' },
  { id: 'wins_crash_50', title: 'Ас', description: 'Выиграй 50 раундов в Crash', emoji: '🏆', reward: 500, metric: 'winsGame', target: 50, game: 'crash' },
  { id: 'wins_cases_50', title: 'Мастер кейсов', description: 'Выиграй 50 раундов в Кейсах', emoji: '🏆', reward: 500, metric: 'winsGame', target: 50, game: 'cases' },
  { id: 'wins_mines_50', title: 'Мастер минного поля', description: 'Выиграй 50 раундов в Mines', emoji: '🏆', reward: 500, metric: 'winsGame', target: 50, game: 'mines' },
  { id: 'wins_minedrop_50', title: 'Мастер шахты', description: 'Выиграй 50 раундов в MineDrop', emoji: '🏆', reward: 500, metric: 'winsGame', target: 50, game: 'minedrop' },
  { id: 'wins_blockblast_50', title: 'Мастер блоков', description: 'Выиграй 50 раундов в BlockBlast', emoji: '🏆', reward: 500, metric: 'winsGame', target: 50, game: 'blockblast' },

  // Серии
  { id: 'streak_3', title: 'Три подряд', description: 'Выиграй 3 раунда подряд', emoji: '🔥', reward: 300, metric: 'winStreak', target: 3 },
  { id: 'streak_5', title: 'Пятёрка', description: 'Выиграй 5 раундов подряд', emoji: '🔥', reward: 600, metric: 'winStreak', target: 5 },
  { id: 'streak_10', title: 'Несокрушимый', description: 'Выиграй 10 раундов подряд', emoji: '🌋', reward: 1500, metric: 'winStreak', target: 10 },
  { id: 'streak_crash_3', title: 'Тройной взлёт', description: 'Выиграй 3 раунда Crash подряд', emoji: '🚀', reward: 700, metric: 'winStreakGame', target: 3, game: 'crash' },
  { id: 'comeback', title: 'Возвращение', description: 'Выиграй после 5 поражений подряд', emoji: '↩️', reward: 500, metric: 'winAfterLosses', target: 1 },
  { id: 'high_streak_3', title: 'Крупная серия', description: 'Выиграй 3 раунда подряд с множителем ≥ 2x', emoji: '⚡', reward: 800, metric: 'highMultStreak', target: 3 },

  // Множители
  { id: 'mult_10', title: 'Десятикратник', description: 'Выиграй раунд с множителем ≥ 10x', emoji: '💥', reward: 1000, metric: 'bigMult', target: 10 },
  { id: 'mult_50', title: 'Мегавыигрыш', description: 'Выиграй раунд с множителем ≥ 50x', emoji: '🌟', reward: 3000, metric: 'bigMult', target: 50 },

  // Ставки
  { id: 'bets_1000', title: 'Крупная игра', description: 'Сделай ставок на 1000 ₽ суммарно', emoji: '💰', reward: 500, metric: 'bets', target: 1000 },
  { id: 'bets_10000', title: 'Хайроллер', description: 'Сделай ставок на 10 000 ₽ суммарно', emoji: '💎', reward: 2000, metric: 'bets', target: 10000 },

  // Промокоды
  { id: 'promos_5', title: 'Охотник за промокодами', description: 'Активируй 5 промокодов', emoji: '🎟️', reward: 300, metric: 'promos', target: 5 },
];

export const CHALLENGES: ChallengeDef[] = [
  { id: 'daily_rounds', title: '10 раундов', description: 'Сыграй 10 раундов', emoji: '🎰', reward: 100, metric: 'rounds', target: 10 },
  { id: 'daily_wins', title: '3 победы', description: 'Выиграй 3 раунда', emoji: '🏆', reward: 150, metric: 'wins', target: 3 },
  { id: 'daily_bets', title: '500 ₽ ставок', description: 'Сделай ставок на 500 ₽', emoji: '💰', reward: 100, metric: 'bets', target: 500 },
  { id: 'daily_crash', title: 'Crash ×3', description: 'Сыграй 3 раунда в Crash', emoji: '🚀', reward: 100, metric: 'roundsGame', target: 3, game: 'crash' },
  { id: 'daily_slots', title: 'Слоты ×5', description: 'Сыграй 5 раундов в Слотах', emoji: '🎰', reward: 100, metric: 'roundsGame', target: 5, game: 'slots' },
  { id: 'daily_wheel', title: 'Колесо', description: 'Крутани Колесо Фортуны', emoji: '🎡', reward: 50, metric: 'wheel', target: 1 },
];

export const ACHIEVEMENT_BY_ID = new Map<string, AchievementDef>(ACHIEVEMENTS.map((a) => [a.id, a]));
export const CHALLENGE_BY_ID = new Map<string, ChallengeDef>(CHALLENGES.map((c) => [c.id, c]));
