'use client';

import { Blocks, Clock3, TrendingDown, TrendingUp } from 'lucide-react';
import type { BlockblastHistoryItem } from '@/lib/api';
import { formatMultiplier, formatRub } from '@/lib/blockblast/engine';

interface BlockBlastHistoryProps {
  history: BlockblastHistoryItem[];
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

export function BlockBlastHistory({ history }: BlockBlastHistoryProps) {
  return (
    <section className="blockblast_history" aria-label="История игр">
      <header className="blockblast_historyHead">
        <span className="blockblast_historyTitle">
          <Clock3 className="blockblast_historyTitleIcon" />
          История игр
        </span>
        <span className="blockblast_historyBadge">{history.length} игр</span>
      </header>
      {history.length === 0 ? (
        <div className="blockblast_historyEmpty">
          <Clock3 className="blockblast_historyEmptyIcon" />
          <span>История пуста — сыграй первый раунд</span>
        </div>
      ) : (
        <ul className="blockblast_historyList">
          {history.map((h) => {
            const win = h.outcome === 'win';
            const result = win ? `+${formatRub(h.payout)}` : `−${formatRub(h.bet - h.payout)}`;
            return (
              <li key={h.id}>
                <div className="blockblast_historyCard" data-outcome={h.outcome}>
                  <span className="blockblast_historyCardTop">
                    <span className="blockblast_historyCardTag">
                      <Blocks className="blockblast_historyCardResultIcon" />
                      BlockBlast
                    </span>
                    <span className="blockblast_historyCardWhen">{whenLabel(h.createdAt)}</span>
                  </span>
                  <span className="blockblast_historyCardStats">
                    <span className="blockblast_historyCardStat">
                      <span className="blockblast_historyCardStatLabel">Ставка</span>
                      <span className="blockblast_historyCardStatValue">{formatRub(h.bet)}</span>
                    </span>
                    <span className="blockblast_historyCardStat">
                      <span className="blockblast_historyCardStatLabel">Фигур</span>
                      <span className="blockblast_historyCardStatValue">{h.placements}</span>
                    </span>
                    <span className="blockblast_historyCardStat">
                      <span className="blockblast_historyCardStatLabel">Множ.</span>
                      <span className="blockblast_historyCardStatValue">
                        {formatMultiplier(h.multiplier)}
                      </span>
                    </span>
                    <span className="blockblast_historyCardStat">
                      <span className="blockblast_historyCardStatLabel">Результат</span>
                      <span className="blockblast_historyCardResult" data-outcome={h.outcome}>
                        {win ? (
                          <TrendingUp className="blockblast_historyCardResultIcon" />
                        ) : (
                          <TrendingDown className="blockblast_historyCardResultIcon" />
                        )}
                        {result}
                      </span>
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
