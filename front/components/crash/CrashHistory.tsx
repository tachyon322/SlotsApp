'use client';

import { Clock3, TrendingDown, TrendingUp } from 'lucide-react';
import type { CrashHistoryItem } from '@/lib/api';

interface CrashHistoryProps {
  history: CrashHistoryItem[];
}

function formatRub(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
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

export function CrashHistory({ history }: CrashHistoryProps) {
  return (
    <section className="crash-history_history" aria-label="История игр">
      <header className="crash-history_historyHead">
        <span className="crash-history_historyTitle">
          <Clock3 className="crash-history_historyTitleIcon" />
          История раундов
        </span>
        <span className="crash-history_historyBadge">{history.length} всего</span>
      </header>
      {history.length === 0 ? (
        <p className="crash-history_empty">Пока нет сыгранных раундов</p>
      ) : (
        <ul className="crash-history_historyList">
          {history.map((h) => {
            const win = h.outcome === 'win';
            const result = win ? `+${formatRub(h.payout)}` : `−${formatRub(h.bet)}`;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  className="crash-history_historyCard"
                  data-outcome={h.outcome}
                  aria-label={`Открыть чек раунда от ${whenLabel(h.createdAt)}`}
                >
                  <span className="crash-history_cardTop">
                    <span className="crash-history_cardTag">
                      <TrendingUp className="crash-history_cardResultIcon" />
                      Crash
                    </span>
                    <span className="crash-history_cardWhen">{whenLabel(h.createdAt)}</span>
                  </span>
                  <span className="crash-history_cardStats">
                    <span className="crash-history_cardStat">
                      <span className="crash-history_cardStatLabel">Ставка</span>
                      <span className="crash-history_cardStatValue">{formatRub(h.bet)}</span>
                    </span>
                    <span className="crash-history_cardStat">
                      <span className="crash-history_cardStatLabel">Краш</span>
                      <span className="crash-history_cardStatValue">
                        {h.crashPoint.toFixed(2)}×
                      </span>
                    </span>
                    <span className="crash-history_cardStat">
                      <span className="crash-history_cardStatLabel">Вывод</span>
                      <span className="crash-history_cardStatValue">
                        {win ? `${h.multiplier.toFixed(2)}×` : '—'}
                      </span>
                    </span>
                    <span className="crash-history_cardStat">
                      <span className="crash-history_cardStatLabel">Результат</span>
                      <span className="crash-history_cardResult" data-outcome={h.outcome}>
                        {win ? (
                          <TrendingUp className="crash-history_cardResultIcon" />
                        ) : (
                          <TrendingDown className="crash-history_cardResultIcon" />
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
