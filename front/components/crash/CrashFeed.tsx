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

function statusRow(s: FeedStatus, amount: number, cashedAt: number | null) {
  if (s === 'in' || s === 'pending') return <span className="crash_feedStatus" data-status="in">—</span>;
  if (s === 'out')
    return <span className="crash_feedStatus" data-status="out">−{formatRub(amount)}</span>;
  const win = Math.round(amount * (cashedAt ?? 1));
  return (
    <span className="crash_feedStatus" data-status="cashed">
      {(cashedAt ?? 0).toFixed(2)}× · +{formatRub(win)}
    </span>
  );
}

export const CrashFeed = memo(function CrashFeed({
  bots,
  player,
  totalBets,
  userName,
}: CrashFeedProps) {
  const rows: Row[] = [];
  if (player) {
    const p = player;
    const name = userName ?? 'Вы';
    rows.push({
      key: 'player',
      isPlayer: true,
      name,
      letter: name.trim().charAt(0).toUpperCase() || '?',
      color: 'rgb(56,189,248)',
      amount: p.amount,
      status: p.status,
      cashedAt: p.cashedAt,
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

  const order: Record<FeedStatus, number> = { cashed: 0, in: 1, pending: 1, out: 2 };
  const sorted = [...rows].sort((a, b) => {
    if (a.status !== b.status) return order[a.status] - order[b.status];
    if (a.status === 'cashed') return (b.cashedAt ?? 0) - (a.cashedAt ?? 0);
    return 0;
  });

  return (
    <section className="crash_feed" aria-label="Ставки игроков">
      <header className="crash_feedHead">
        <span>Игроки в раунде</span>
        <span>Всего ставок: {totalBets}</span>
      </header>
      <ul className="crash_feedList">
        {sorted.map((r) => (
          <li
            key={r.key}
            className="crash_feedRow"
            data-status={r.status}
            data-you={r.isPlayer}
          >
            <span className="crash_avatar" style={{ background: r.color }}>
              {r.letter}
            </span>
            <span className="crash_feedName">
              {r.isPlayer ? `${r.name} (вы)` : r.name}
            </span>
            <span className="crash_feedBet">{formatRub(r.amount)}</span>
            {statusRow(r.status, r.amount, r.cashedAt)}
          </li>
        ))}
      </ul>
    </section>
  );
});