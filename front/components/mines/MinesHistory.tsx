'use client';

import { Bomb, Clock3, TrendingDown, TrendingUp } from 'lucide-react';
import type { MinesHistoryItem } from '@/lib/api';
import { formatMultiplier, formatRub } from '@/lib/mines/engine';

interface MinesHistoryProps {
  history: MinesHistoryItem[];
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

export function MinesHistory({ history }: MinesHistoryProps) {
  return (
    <section className="mines-history_history" aria-label="История игр">
      <header className="mines-history_historyHead">
        <span className="mines-history_historyTitle">
          <Clock3 className="mines-history_historyTitleIcon" />
          История раундов
        </span>
        <span className="mines-history_historyBadge">{history.length} всего</span>
      </header>
      {history.length === 0 ? (
        <p className="mines-history_empty">Пока нет сыгранных раундов</p>
      ) : (
        <ul className="mines-history_historyList">
          {history.map((h) => {
            const win = h.outcome === 'win';
            const result = win ? `+${formatRub(h.payout)}` : `−${formatRub(h.bet)}`;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  className="mines-history_historyCard"
                  data-outcome={h.outcome}
                  aria-label={`Открыть чек раунда от ${whenLabel(h.createdAt)}`}
                >
                  <span className="mines-history_cardTop">
                    <span className="mines-history_cardTag">
                      <Bomb className="mines-history_cardResultIcon" />
                      {win ? `Mines · ${h.mines}💣` : 'Mines'}
                    </span>
                    <span className="mines-history_cardWhen">{whenLabel(h.createdAt)}</span>
                  </span>
                  <span className="mines-history_cardStats">
                    <span className="mines-history_cardStat">
                      <span className="mines-history_cardStatLabel">Ставка</span>
                      <span className="mines-history_cardStatValue">{formatRub(h.bet)}</span>
                    </span>
                    <span className="mines-history_cardStat">
                      <span className="mines-history_cardStatLabel">Открыто</span>
                      <span className="mines-history_cardStatValue">
                        {h.outcome === 'loss' && h.opened === 0 ? '—' : h.opened}
                      </span>
                    </span>
                    <span className="mines-history_cardStat">
                      <span className="mines-history_cardStatLabel">Множ.</span>
                      <span className="mines-history_cardStatValue">
                        {formatMultiplier(h.multiplier)}
                      </span>
                    </span>
                    <span className="mines-history_cardStat">
                      <span className="mines-history_cardStatLabel">Результат</span>
                      <span className="mines-history_cardResult" data-outcome={h.outcome}>
                        {win ? (
                          <TrendingUp className="mines-history_cardResultIcon" />
                        ) : (
                          <TrendingDown className="mines-history_cardResultIcon" />
                        )}
                        {result}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
