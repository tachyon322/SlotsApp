'use client';

import type { SlotsHistoryItem } from '@/lib/api';
import { pluralRu } from '@/lib/format';
import { formatRub } from '@/components/slots/symbols';

interface SlotsHistoryProps {
  history: SlotsHistoryItem[];
  stats: {
    totalWinnings: number;
    maxWin: number;
    totalCount: number;
  };
}

function formatWhen(dateStr: string): string {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return '';
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000);
  if (diff === 0) return `сегодня, ${time}`;
  if (diff === 1) return `вчера, ${time}`;
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

function formatMult(m: number): string {
  return `×${m.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function SlotsHistory({ history, stats }: SlotsHistoryProps) {
  return (
    <section className="sg-hist" aria-labelledby="sg-hist-title">
      <div className="sg-hist-head">
        <h2 id="sg-hist-title">История</h2>
        <span>
          за всё время · {stats.totalCount} {pluralRu(stats.totalCount, ['раунд', 'раунда', 'раундов'])}
        </span>
      </div>

      <div className="sg-hist-stats">
        <div>
          <small>Выплаты</small>
          <b data-tone="pos">{formatRub(stats.totalWinnings)}</b>
        </div>
        <div>
          <small>Лучший</small>
          <b>{formatRub(stats.maxWin)}</b>
        </div>
        <div>
          <small>Раундов</small>
          <b>{stats.totalCount.toLocaleString('ru-RU')}</b>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="sg-hist-empty">История пуста — сыграйте первый раунд</p>
      ) : (
        <ul className="sg-hist-list">
          {history.map((item) => {
            const paid = item.payout > 0;
            const tone = item.outcome === 'win' ? 'pos' : paid ? 'mute' : 'neg';
            return (
              <li key={item.id}>
                <span className="sg-hist-tag" data-mode={item.mode}>
                  {item.mode === 'mega' ? 'МЕГА' : '3×3'}
                </span>
                <div>
                  <b>
                    {item.lines > 0
                      ? `${formatRub(item.lineBet)} × ${item.lines} ${pluralRu(item.lines, ['линия', 'линии', 'линий'])}`
                      : formatRub(item.bet)}
                  </b>
                  <span>{formatWhen(item.createdAt)}</span>
                </div>
                <div className="sg-hist-res">
                  <b data-tone={tone}>{paid ? `+${formatRub(item.payout)}` : `−${formatRub(item.bet)}`}</b>
                  <span>{item.outcome === 'win' ? formatMult(item.multiplier) : paid ? 'возврат' : 'ставка'}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
