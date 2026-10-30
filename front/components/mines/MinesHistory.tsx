'use client';

import type { MinesHistoryItem } from '@/lib/api';
import { formatMultiplier, formatRub } from '@/lib/mines/engine';
import { pluralRu } from '@/lib/format';

interface MinesHistoryProps {
  history: MinesHistoryItem[];
}

function whenLabel(iso: string): string {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const now = Date.now();
  const diff = now - t.getTime();
  if (diff >= 0 && diff < 60_000) return 'только что';
  if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)} мин назад`;
  const time = t.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (t.toDateString() === new Date(now).toDateString()) return `сегодня, ${time}`;
  return t.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
}

export function MinesHistory({ history }: MinesHistoryProps) {
  return (
    <section className="mn2-hist" aria-labelledby="mn2-hist-title">
      <div className="mn2-hist-head">
        <h2 id="mn2-hist-title">История</h2>
        <span>
          {history.length} {pluralRu(history.length, ['раунд', 'раунда', 'раундов'])}
        </span>
      </div>
      {history.length === 0 ? (
        <p className="mn2-hist-empty">Пока нет сыгранных раундов</p>
      ) : (
        <ul className="mn2-hist-list">
          {history.map((h) => {
            const win = h.outcome === 'win';
            return (
              <li key={h.id}>
                <span className="mn2-hist-tag">
                  {h.mines}
                  <i className="mn2-ico" data-kind="bomb" aria-hidden="true" />
                </span>
                <span className="mn2-hist-mid">
                  <b>
                    {formatRub(h.bet)} · открыто {h.opened}
                  </b>
                  <small>{whenLabel(h.createdAt)}</small>
                </span>
                <span className="mn2-hist-res" data-tone={win ? 'pos' : 'neg'}>
                  <b>{win ? `+${formatRub(h.payout)}` : `−${formatRub(h.bet)}`}</b>
                  <small>{win ? formatMultiplier(h.multiplier) : 'мина'}</small>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
