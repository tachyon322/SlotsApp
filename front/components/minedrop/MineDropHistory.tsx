'use client';

import { ChevronRight } from 'lucide-react';
import type { MinedropHistoryItem } from '@/lib/api';
import { formatMultiplier, formatRub } from '@/lib/minedrop/engine';
import { pluralRu } from '@/lib/format';
import { blockArt, deepestBlock, parseDetails, type RoundView } from '@/components/minedrop/art';

interface MineDropHistoryProps {
  history: MinedropHistoryItem[];
  onOpen: (round: RoundView) => void;
}

export function whenLabel(iso: string): string {
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

export function MineDropHistory({ history, onOpen }: MineDropHistoryProps) {
  return (
    <section className="md2-hist" aria-labelledby="md2-hist-title">
      <div className="md2-hist-head">
        <h2 id="md2-hist-title">История</h2>
        <span>
          {history.length} {pluralRu(history.length, ['раунд', 'раунда', 'раундов'])}
        </span>
      </div>
      {history.length === 0 ? (
        <p className="md2-hist-empty">Пока нет сыгранных раундов</p>
      ) : (
        <ul className="md2-hist-list">
          {history.map((h) => {
            const columns = parseDetails(h.details);
            const points = columns ? columns.reduce((s, c) => s + c.points, 0) : null;
            const deepest = deepestBlock(columns);
            const net = h.payout - h.bet;
            return (
              <li key={h.id}>
                <button
                  type="button"
                  aria-label={`Чек раунда от ${whenLabel(h.createdAt)}`}
                  onClick={() =>
                    onOpen({
                      id: h.id,
                      bet: h.bet,
                      multiplier: h.multiplier,
                      payout: h.payout,
                      outcome: h.outcome,
                      createdAt: h.createdAt,
                      columns,
                    })
                  }
                >
                  <span className="md2-hist-tag" data-chest={columns?.some((c) => c.jackpot) || undefined}>
                    {deepest ? <i style={{ backgroundImage: `url(${blockArt(deepest)})` }} /> : <em>0</em>}
                  </span>
                  <span className="md2-hist-mid">
                    <b>
                      {formatRub(h.bet)}
                      {points !== null && <> · {points} очк.</>}
                    </b>
                    <small>{whenLabel(h.createdAt)}</small>
                  </span>
                  <span className="md2-hist-res" data-tone={net > 0 ? 'pos' : 'neg'}>
                    <b>{net > 0 ? `+${formatRub(net)}` : net < 0 ? `−${formatRub(-net)}` : '±0 ₽'}</b>
                    <small>{formatMultiplier(h.multiplier)}</small>
                  </span>
                  <ChevronRight className="md2-hist-go" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
