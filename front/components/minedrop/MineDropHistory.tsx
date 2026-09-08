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
    <section className="md-history" aria-label="История игр">
      <header className="md-historyHead">
        <span className="md-historyTitle">
          <Clock3 className="md-historyTitleIcon" />
          История раундов
        </span>
        <span className="md-historyBadge">{history.length} всего</span>
      </header>

      {history.length > 0 && (
        <div className="md-historyStats">
          <span className="md-historyStat">
            Выигрыши: <strong>{formatRub(totalWinnings)}</strong>
          </span>
          <span className="md-historyStat">
            Макс: <strong>{formatRub(maxWin)}</strong>
          </span>
        </div>
      )}

      {history.length === 0 ? (
        <p className="md-historyEmpty">Пока нет сыгранных раундов</p>
      ) : (
        <ul className="md-historyList">
          {history.map((h) => {
            const win = h.outcome === 'win';
            const result = win ? `+${formatRub(h.payout)}` : `−${formatRub(h.bet)}`;
            return (
              <li key={h.id}>
                <div className="md-historyCard" data-outcome={h.outcome}>
                  <div className="md-cardTop">
                    <span className="md-cardTag">MineDrop</span>
                    <span className="md-cardWhen">{whenLabel(h.createdAt)}</span>
                  </div>
                  <div className="md-cardStats">
                    <span className="md-cardStat">
                      <span className="md-cardStatLabel">Ставка</span>
                      <span className="md-cardStatValue">{formatRub(h.bet)}</span>
                    </span>
                    <span className="md-cardStat">
                      <span className="md-cardStatLabel">Множ.</span>
                      <span className="md-cardStatValue">
                        {formatMultiplier(h.multiplier)}
                      </span>
                    </span>
                    <span className="md-cardStat">
                      <span className="md-cardStatLabel">Результат</span>
                      <span className="md-cardResult" data-outcome={h.outcome}>
                        {win ? (
                          <TrendingUp className="md-cardResultIcon" />
                        ) : (
                          <TrendingDown className="md-cardResultIcon" />
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
