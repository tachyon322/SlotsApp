'use client';

import { ChevronRight } from 'lucide-react';
import { CASES_LIST, RARITY_STYLES } from '@/lib/cases/engine';
import type { CasesHistoryItem } from '@/lib/api';
import { formatMoney } from '@/components/cases/drops';
import { caseArt } from '@/components/cases/CasesPicker';
import { pluralRu } from '@/lib/format';

interface CasesHistoryProps {
  history: CasesHistoryItem[];
  stats: { totalWinnings: number; maxWin: number; totalCount: number };
  onOpenReceipt: (item: CasesHistoryItem) => void;
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

export function CasesHistory({ history, stats, onOpenReceipt }: CasesHistoryProps) {
  return (
    <section className="kc-hist" aria-labelledby="kc-hist-title">
      <div className="kc-hist-head">
        <h2 id="kc-hist-title">История</h2>
        <span>
          {stats.totalCount} {pluralRu(stats.totalCount, ['раунд', 'раунда', 'раундов'])} за всё время
        </span>
      </div>

      <div className="kc-hist-stats">
        <div>
          <small>Выплачено всего</small>
          <b>{formatMoney(stats.totalWinnings)}</b>
        </div>
        <div>
          <small>Лучший приз</small>
          <b data-tone="gold">{formatMoney(stats.maxWin)}</b>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="kc-hist-empty">Пока нет открытых кейсов</p>
      ) : (
        <ul className="kc-hist-list">
          {history.map((h) => {
            const net = h.payout - h.bet;
            const name = CASES_LIST.find((c) => c.id === h.caseId)?.name ?? h.caseId;
            const rarity = RARITY_STYLES[h.rarity] || RARITY_STYLES.common;
            return (
              <li key={h.id}>
                <button type="button" onClick={() => onOpenReceipt(h)} aria-label={`Чек раунда: ${name}`}>
                  <i className="kc-art" style={{ backgroundImage: `url(${caseArt(h.caseId)})` }} aria-hidden="true" />
                  <span className="kc-hist-mid">
                    <b>
                      {name}
                      {h.lines > 1 && <em> · {h.lines} линии</em>}
                    </b>
                    <small>
                      <span style={{ color: rarity.color }}>{rarity.label}</span> · {whenLabel(h.createdAt)}
                    </small>
                  </span>
                  <span className="kc-hist-res" data-tone={net > 0 ? 'pos' : 'neg'}>
                    <b>{net > 0 ? `+${formatMoney(net)}` : `−${formatMoney(-net)}`}</b>
                    <small>приз {formatMoney(h.payout)}</small>
                  </span>
                  <ChevronRight className="kc-hist-go" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
