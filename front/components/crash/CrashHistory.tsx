'use client';

import { memo } from 'react';
import type { CrashHistoryItem } from '@/lib/api';

interface CrashHistoryProps {
  history: CrashHistoryItem[];
}

function formatRub(n: number): string {
  return `${n.toLocaleString('ru-RU')} ₽`;
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

/** Тир множителя краша — как у чипов на доске. */
function tierOf(m: number): 'low' | 'mid' | 'high' | 'huge' {
  if (m < 2) return 'low';
  if (m < 5) return 'mid';
  if (m < 10) return 'high';
  return 'huge';
}

export const CrashHistory = memo(function CrashHistory({ history }: CrashHistoryProps) {
  if (history.length === 0) {
    return <p className="cr-empty">Пока нет сыгранных раундов</p>;
  }
  return (
    <ul className="cr-list cr-mine">
      {history.map((h) => {
        const win = h.outcome === 'win';
        return (
          <li key={h.id} data-status={win ? 'cashed' : 'burned'}>
            <span className="cr-chip" data-tier={tierOf(h.crashPoint)}>
              {h.crashPoint.toFixed(2)}×
            </span>
            <span className="cr-mine-mid">
              <b>Ставка {formatRub(h.bet)}</b>
              <small>{whenLabel(h.createdAt)}</small>
            </span>
            <span className="cr-feed-res" data-status={win ? 'cashed' : 'burned'}>
              <b>{win ? `+${formatRub(h.payout)}` : `−${formatRub(h.bet)}`}</b>
              <small>{win ? `вывод ${h.multiplier.toFixed(2)}×` : 'не успел'}</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
});
