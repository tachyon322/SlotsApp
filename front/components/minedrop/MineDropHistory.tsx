'use client';

import { Clock3, TrendingUp, TrendingDown } from 'lucide-react';
import type { MinedropHistoryItem } from '@/lib/api';
import { formatMultiplier, formatRub } from '@/lib/minedrop/engine';

interface MineDropHistoryProps {
  history: MinedropHistoryItem[];
}

function whenLabel(iso: string): string {
  const t = new Date(iso);
  const now = Date.now();
  const diff = now - t.getTime();
  if (diff >= 0 && diff < 60_000) return 'Только что';
  if (diff >= 0 && diff < 3_600_000) {
    const m = Math.floor(diff / 60_000);
    return `${m} мин назад`;
  }
  const sameDay = t.toDateString() === new Date(now).toDateString();
  if (sameDay) return t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return t.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function MineDropHistory({ history }: MineDropHistoryProps) {
  const totalWinnings = history.reduce((s, h) => (h.payout > 0 ? s + h.payout : s), 0);
  const maxWin = history.reduce((s, h) => Math.max(s, h.payout), 0);

  return (
    <section className="minedrop-history_history" aria-label="История игр">
      <header className="minedrop-history_historyHead">
        <span className="minedrop-history_historyTitle">
          <Clock3 className="minedrop-history_historyTitleIcon" />
          История раундов
        </span>
        <span className="minedrop-history_historyBadge">{history.length} всего</span>
      </header>

      {history.length > 0 && (
        <div className="minedrop-history_stats">
          <span className="minedrop-history_stat">
            Выигрыши: <strong>{formatRub(totalWinnings)}</strong>
          </span>
          <span className="minedrop-history_stat">
            Макс: <strong>{formatRub(maxWin)}</strong>
          </span>
        </div>
      )}

      {history.length === 0 ? (
        <p className="minedrop-history_empty">Пока нет сыгранных раундов</p>
      ) : (
        <ul className="minedrop-history_historyList">
          {history.map((h) => {
            const win = h.outcome === 'win';
            const result = win ? `+${formatRub(h.payout)}` : `−${formatRub(h.bet)}`;
            return (
              <li key={h.id}>
                <div className="minedrop-history_historyCard" data-outcome={h.outcome}>
                  <div className="minedrop-history_cardTop">
                    <span className="minedrop-history_cardTag">MineDrop</span>
                    <span className="minedrop-history_cardWhen">{whenLabel(h.createdAt)}</span>
                  </div>
                  <div className="minedrop-history_cardStats">
                    <span className="minedrop-history_cardStat">
                      <span className="minedrop-history_cardStatLabel">Ставка</span>
                      <span className="minedrop-history_cardStatValue">{formatRub(h.bet)}</span>
                    </span>
                    <span className="minedrop-history_cardStat">
                      <span className="minedrop-history_cardStatLabel">Множ.</span>
                      <span className="minedrop-history_cardStatValue">
                        {formatMultiplier(h.multiplier)}
                      </span>
                    </span>
                    <span className="minedrop-history_cardStat">
                      <span className="minedrop-history_cardStatLabel">Результат</span>
                      <span className="minedrop-history_cardResult" data-outcome={h.outcome}>
                        {win ? (
                          <TrendingUp className="minedrop-history_cardResultIcon" />
                        ) : (
                          <TrendingDown className="minedrop-history_cardResultIcon" />
                        )}
                        {result}
                      </span>
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
