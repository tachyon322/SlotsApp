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
/** Статусы строк как в референсе: in / cashed / burned. */
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

function statusCell(s: FeedStatus, amount: number, cashedAt: number | null) {
  const status = rowStatus(s);
  if (status === 'in') {
    return (
      <span className="cg-feedStatus" data-status="in">
        в игре
      </span>
    );
  }
  if (status === 'burned') {
    return (
      <span className="cg-feedStatus" data-status="burned">
        сгорел
      </span>
    );
  }
  const win = Math.round(amount * (cashedAt ?? 1));
  return (
    <span className="cg-feedStatus" data-status="cashed">
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

  const order: Record<RowStatus, number> = { cashed: 0, in: 1, burned: 2 };
  const sorted = [...rows].sort((a, b) => {
    const sa = rowStatus(a.status);
    const sb = rowStatus(b.status);
    if (sa !== sb) return order[sa] - order[sb];
    if (sa === 'cashed') return (b.cashedAt ?? 0) - (a.cashedAt ?? 0);
    return 0;
  });

  return (
    <section className="cg-feed" aria-label="Ставки игроков">
      <header className="cg-feedHead">
        <span>
          Игроки в раунде
          <small>Текущая лента</small>
        </span>
        <span className="cg-feedTotal">Всего: {totalBets}</span>
      </header>
      <div className="cg-feedColumns" aria-hidden="true">
        <span>Игрок</span>
        <span>Ставка</span>
        <span>Результат</span>
      </div>
      <ul className="cg-feedList">
        {sorted.map((r) => (
          <li key={r.key} className="cg-feedRow" data-status={rowStatus(r.status)}>
            <span className="cg-avatar" style={{ background: r.color }}>
              {r.letter}
            </span>
            <span className="cg-feedName">{r.name}</span>
            <span className="cg-feedBet">{formatRub(r.amount)}</span>
            {statusCell(r.status, r.amount, r.cashedAt)}
          </li>
        ))}
      </ul>
    </section>
  );
});
