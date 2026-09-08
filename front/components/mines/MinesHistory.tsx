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
    <section className="mn-history" aria-label="История игр">
      <header className="mn-historyHead">
        <span className="mn-historyTitle">
          <Clock3 className="mn-historyTitleIcon" />
          История раундов
        </span>
        <span className="mn-historyBadge">{history.length} всего</span>
      </header>
      {history.length === 0 ? (
        <p className="mn-historyEmpty">Пока нет сыгранных раундов</p>
      ) : (
        <ul className="mn-historyList">
          {history.map((h) => {
            const win = h.outcome === 'win';
            const result = win ? `+${formatRub(h.payout)}` : `−${formatRub(h.bet)}`;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  className="mn-historyCard"
                  data-outcome={h.outcome}
                  aria-label={`Открыть чек раунда от ${whenLabel(h.createdAt)}`}
                >
                  <span className="mn-cardTop">
                    <span className="mn-cardTag">
                      <Bomb className="mn-cardResultIcon" />
                      {win ? `Mines · ${h.mines}💣` : 'Mines'}
                    </span>
                    <span className="mn-cardWhen">{whenLabel(h.createdAt)}</span>
                  </span>
                  <span className="mn-cardStats">
                    <span className="mn-cardStat">
                      <span className="mn-cardStatLabel">Ставка</span>
                      <span className="mn-cardStatValue">{formatRub(h.bet)}</span>
                    </span>
                    <span className="mn-cardStat">
                      <span className="mn-cardStatLabel">Открыто</span>
                      <span className="mn-cardStatValue">
                        {h.outcome === 'loss' && h.opened === 0 ? '—' : h.opened}
                      </span>
                    </span>
                    <span className="mn-cardStat">
                      <span className="mn-cardStatLabel">Множ.</span>
                      <span className="mn-cardStatValue">
                        {formatMultiplier(h.multiplier)}
                      </span>
                    </span>
                    <span className="mn-cardStat">
                      <span className="mn-cardStatLabel">Результат</span>
                      <span className="mn-cardResult" data-outcome={h.outcome}>
                        {win ? (
                          <TrendingUp className="mn-cardResultIcon" />
                        ) : (
                          <TrendingDown className="mn-cardResultIcon" />
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
