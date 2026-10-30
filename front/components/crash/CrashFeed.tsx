'use client';

import { memo } from 'react';
import type { PlayerBet, BotBet } from '@/hooks/useCrashGame';

interface CrashFeedProps {
  bots: BotBet[];
  player: PlayerBet | null;
  totalBets: number;
  userName: string | null;
}

function formatRub(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
}

type FeedStatus = PlayerBet['status'];
/** Статусы строк: in / cashed / burned. */
type RowStatus = 'in' | 'cashed' | 'burned';

interface Row {
  key: string;
  isPlayer: boolean;
  name: string;
  letter: string;
  color: string;
  amount: number;
  status: FeedStatus;
  cashedAt: number | null;
}

function rowStatus(s: FeedStatus): RowStatus {
  if (s === 'cashed') return 'cashed';
  if (s === 'out') return 'burned';
  return 'in';
}

function resultCell(s: FeedStatus, amount: number, cashedAt: number | null) {
  const status = rowStatus(s);
  if (status === 'in') {
    return (
      <span className="cr-feed-res" data-status="in">
        <b>в игре</b>
      </span>
    );
  }
  if (status === 'burned') {
    return (
      <span className="cr-feed-res" data-status="burned">
        <b>−{formatRub(amount)}</b>
      </span>
    );
  }
  const win = Math.round(amount * (cashedAt ?? 1));
  return (
    <span className="cr-feed-res" data-status="cashed">
      <b>+{formatRub(win)}</b>
      <small>{(cashedAt ?? 0).toFixed(2)}×</small>
    </span>
  );
}

export const CrashFeed = memo(function CrashFeed({ bots, player, totalBets, userName }: CrashFeedProps) {
  const rows: Row[] = [];
  if (player) {
    const name = userName ?? 'Вы';
    rows.push({
      key: 'player',
      isPlayer: true,
      name,
      letter: name.trim().charAt(0).toUpperCase() || '?',
      color: '#ffffff',
      amount: player.amount,
      status: player.status,
      cashedAt: player.cashedAt,
    });
  }
  for (const b of bots) {
    rows.push({
      key: b.id,
      isPlayer: false,
      name: b.name,
      letter: b.letter,
      color: b.color,
      amount: b.amount,
      status: b.status,
      cashedAt: b.cashedAt,
    });
  }

  const order: Record<RowStatus, number> = { cashed: 0, in: 1, burned: 2 };
  const sorted = [...rows].sort((a, b) => {
    const sa = rowStatus(a.status);
    const sb = rowStatus(b.status);
    if (sa !== sb) return order[sa] - order[sb];
    if (sa === 'cashed') return (b.cashedAt ?? 0) - (a.cashedAt ?? 0);
    return 0;
  });

  const pot = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <div className="cr-feed" aria-label="Ставки игроков">
      <div className="cr-feed-sum">
        <span>
          Игроков <b>{totalBets}</b>
        </span>
        <span>
          Банк раунда <b>{formatRub(pot)}</b>
        </span>
      </div>
      <ul className="cr-list">
        {sorted.map((r) => (
          <li key={r.key} data-status={rowStatus(r.status)} data-player={r.isPlayer}>
            <span className="cr-av" style={{ '--av': r.color } as React.CSSProperties}>
              {r.letter}
            </span>
            <span className="cr-feed-name">{r.isPlayer ? `${r.name} · вы` : r.name}</span>
            <span className="cr-feed-bet">{formatRub(r.amount)}</span>
            {resultCell(r.status, r.amount, r.cashedAt)}
          </li>
        ))}
      </ul>
    </div>
  );
});
