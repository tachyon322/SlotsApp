import type { CSSProperties } from 'react';

/**
 * Атлас символов 4×3 (public/images/games/uiux-v2/slots/symbol-atlas-1536w.*).
 * Позиции ячеек — 1:1 из референса (data-symbol + --symbol-x/--symbol-y):
 *   ряд 0: cherry, lemon, grape, bell
 *   ряд 1: star, diamond, money_bag, seven
 *   ряд 2: watermelon, wild (автомат), scatter (корона), purple_heart
 * Наш движок (lib/slots/engine) использует 8 символов — маппим эмодзи сетки
 * на ячейки атласа; символы референса, которых у нас нет, не используются.
 */
interface SymbolArtInfo {
  symbol: string;
  x: number;
  y: number;
  label: string;
}

export const SYMBOL_ART_BY_EMOJI: Record<string, SymbolArtInfo> = {
  '🍒': { symbol: 'cherry', x: 0, y: 0, label: 'Вишня' },
  '🍋': { symbol: 'lemon', x: 33.33333333333333, y: 0, label: 'Лимон' },
  '🔔': { symbol: 'bell', x: 100, y: 0, label: 'Колокольчик' },
  '⭐': { symbol: 'star', x: 0, y: 50, label: 'Звезда' },
  '💎': { symbol: 'diamond', x: 33.33333333333333, y: 50, label: 'Алмаз' },
  '💰': { symbol: 'money_bag', x: 66.66666666666666, y: 50, label: 'Мешок денег' },
  '7️⃣': { symbol: 'seven', x: 100, y: 50, label: 'Семёрка' },
  '🃏': { symbol: 'wild', x: 33.33333333333333, y: 100, label: 'Вайлд' },
};

/** Символы, прокручивающиеся в барабане во время спина. */
export const SPIN_STRIP_EMOJIS = ['🍒', '🍋', '🔔', '💎', '⭐', '💰', '7️⃣', '🃏'];

export function SymbolArt({
  emoji,
  spinning = false,
  className = 'slsym-symbolArt',
}: {
  emoji: string;
  spinning?: boolean;
  className?: string;
}) {
  const info = SYMBOL_ART_BY_EMOJI[emoji];
  if (!info) {
    // Неизвестный символ — референсный фолбэк (конусный градиент, [data-symbol=unknown]).
    return <span className={className} data-symbol="unknown" aria-hidden="true" />;
  }
  const style = {
    '--symbol-x': `${info.x}%`,
    '--symbol-y': `${info.y}%`,
  } as CSSProperties;
  return (
    <span
      className={className}
      data-symbol={info.symbol}
      data-spinning={spinning}
      style={style}
      aria-label={info.label}
      role="img"
    />
  );
}

/** Денежный формат референса: «1 000 ₽». */
export function formatRub(amount: number): string {
  return `${Math.round(amount).toLocaleString('ru-RU')} ₽`;
}
