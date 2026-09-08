'use client';

import React from 'react';
import { Clock, Coins, Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import type { SlotsHistoryItem } from '@/lib/api';
import { formatRub } from '@/components/slots/symbols';

interface SlotsHistoryProps {
  history: SlotsHistoryItem[];
  stats: {
    totalWinnings: number;
    maxWin: number;
    totalCount: number;
  };
}

function formatDate(dateStr: string) {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }).replace('.', '');
  } catch {
    return 'Сегодня';
  }
}

function pluralRounds(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'раунд';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'раунда';
  return 'раундов';
}

export function SlotsHistory({ history, stats }: SlotsHistoryProps) {
  return (
    <div className="slv2-historyWrap">
      <section className="sl-history slv2-history" aria-label="История игр">
        <header className="sl-historyHead">
          <span className="sl-historyTitle">
            <Clock className="sl-historyTitleIcon" aria-hidden="true" />
            История игр
          </span>
          <span className="sl-historyBadge">Последние {history.length}</span>
        </header>

        <p className="sl-historyEmptySub" role="status">
          За всё время · {stats.totalCount} {pluralRounds(stats.totalCount)} · выплаты, не чистая
          прибыль · Классика и Мега
        </p>

        <div className="sl-historyStats slv2-historyStats">
          <div className="sl-historyStat">
            <span className="sl-historyStatLabel">
              <Coins className="sl-historyStatIcon" aria-hidden="true" />
              Общие выигрыши
            </span>
            <span className="sl-historyStatValue" data-tone="green" data-size="sm">
              {formatRub(stats.totalWinnings)}
            </span>
          </div>

          <div className="sl-historyStat">
            <span className="sl-historyStatLabel">
              <Trophy className="sl-historyStatIcon" aria-hidden="true" />
              Макс. выигрыш
            </span>
            <span className="sl-historyStatValue" data-tone="gold" data-size="md">
              {formatRub(stats.maxWin)}
            </span>
          </div>
        </div>

        <ul className="sl-historyList slv2-historyList">
          {history.length === 0 ? (
            <li>
              <div className="sl-historyEmpty">
                <p className="sl-historyEmptyTitle">История пуста — сыграйте первый раунд</p>
              </div>
            </li>
          ) : (
            history.map((item) => {
              const isWin = item.outcome === 'win';
              const isLdw = item.outcome === 'ldw';

              const outcomeClass = isWin ? 'win' : isLdw ? 'ldw' : 'loss';

              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className="sl-historyCard slv2-historyCard"
                    data-win={isWin}
                    aria-label={`Открыть чек раунда от ${formatDate(item.createdAt)}`}
                  >
                    <span className="sl-cardTop">
                      <span className="sl-cardTag" data-mode={item.mode}>
                        {item.mode === 'mega' ? 'Мега' : 'Слоты'}
                      </span>
                      <span className="sl-cardWhen">{formatDate(item.createdAt)}</span>
                    </span>

                    <span className="sl-cardStats">
                      <span className="sl-cardStat">
                        <span className="sl-cardStatLabel">Ставка</span>
                        <span className="sl-cardStatValue" data-size="md">
                          {formatRub(item.bet)}
                        </span>
                      </span>

                      <span className="sl-cardStat">
                        <span className="sl-cardStatLabel">Ряды</span>
                        <span className="sl-cardStatValue">{item.lines || '—'}</span>
                      </span>

                      <span className="sl-cardStat">
                        <span className="sl-cardStatLabel">Множ.</span>
                        <span className="sl-cardStatValue" data-tone="gold" data-size="md">
                          ×{item.multiplier.toFixed(2)}
                        </span>
                      </span>

                      <span className="sl-cardStat" data-result="true">
                        <span className="sl-cardStatLabel">Результат</span>
                        <span className="sl-cardResult" data-outcome={outcomeClass} data-size="md">
                          {isWin || isLdw ? (
                            <>
                              <TrendingUp className="sl-cardResultIcon" aria-hidden="true" />
                              <span className="sl-cardResultText">+{formatRub(item.payout)}</span>
                            </>
                          ) : (
                            <>
                              <TrendingDown className="sl-cardResultIcon" aria-hidden="true" />
                              <span className="sl-cardResultText">−{formatRub(item.bet)}</span>
                            </>
                          )}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </section>
    </div>
  );
}
