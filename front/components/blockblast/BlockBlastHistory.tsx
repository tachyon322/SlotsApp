'use client';

import type { BlockblastHistoryItem } from '@/lib/api';
import { formatMultiplier, formatRub } from '@/lib/blockblast/engine';
import { percent } from '@/components/blockblast/rules';
import { pluralRu } from '@/lib/format';

interface BlockBlastHistoryProps {
  history: BlockblastHistoryItem[];
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

export function BlockBlastHistory({ history }: BlockBlastHistoryProps) {
  return (
    <section className="bx-hist" aria-labelledby="bx-hist-title">
      <div className="bx-hist-head">
        <h2 id="bx-hist-title">История</h2>
        <span>
          {history.length} {pluralRu(history.length, ['раунд', 'раунда', 'раундов'])}
        </span>
      </div>
      {history.length === 0 ? (
        <p className="bx-hist-empty">Пока нет сыгранных раундов</p>
      ) : (
        <ul className="bx-hist-list">
          {history.map((h) => {
            const win = h.outcome === 'win';
            const net = h.payout - h.bet;
            return (
              <li key={h.id}>
                <span className="bx-hist-tag" data-tone={win ? 'win' : undefined}>
                  <b>{h.placements}</b>
                  <i aria-hidden="true" />
                </span>
                <span className="bx-hist-mid">
                  <b>
                    {formatRub(h.bet)} · {win ? 'кэшаут' : 'тупик'}
                  </b>
                  <small>{whenLabel(h.createdAt)}</small>
                </span>
                <span className="bx-hist-res" data-tone={net > 0 ? 'pos' : 'neg'}>
                  <b>{net > 0 ? `+${formatRub(net)}` : net < 0 ? `−${formatRub(-net)}` : '±0 ₽'}</b>
                  <small>{win ? formatMultiplier(h.multiplier) : `возврат ${percent(h.multiplier)}`}</small>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
