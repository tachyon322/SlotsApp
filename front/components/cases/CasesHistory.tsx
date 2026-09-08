'use client';

import React from 'react';
import { Clock, Coins, Trophy, Gift, TrendingDown, TrendingUp, Receipt } from 'lucide-react';
import { RARITY_STYLES } from '@/lib/cases/engine';
import type { CasesHistoryItem } from '@/lib/api';
import { formatMoney } from '@/components/cases/drops';

interface CasesHistoryProps {
  history: CasesHistoryItem[];
  stats: {
    totalWinnings: number;
    maxWin: number;
    totalCount: number;
  };
  onOpenReceipt: (item: CasesHistoryItem) => void;
}

function pluralRounds(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'раунд';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'раунда';
  return 'раундов';
}

export function CasesHistory({ history, stats, onOpenReceipt }: CasesHistoryProps) {
  return (
    <section className="cs-history" aria-label="История игр">
      {/* Header */}
      <header className="cs-historyHead">
        <span className="cs-historyTitle">
          <Clock className="cs-historyTitleIcon" aria-hidden="true" />
          История игр
        </span>
        <span className="cs-historyBadge">Последние {history.length}</span>
      </header>

      <p className="cs-historyEmptySub" role="status">
        За всё время · {stats.totalCount} {pluralRounds(stats.totalCount)} · выплаты, не чистая
        прибыль
      </p>

      {/* Stats Cards */}
      <div className="cs-historyStats">
        <div className="cs-historyStat">
          <span className="cs-historyStatLabel">
            <Coins className="cs-historyStatIcon" aria-hidden="true" />
            Общие выигрыши
          </span>
          <span className="cs-historyStatValue" data-tone="green">
            {formatMoney(stats.totalWinnings)}
          </span>
        </div>
        <div className="cs-historyStat">
          <span className="cs-historyStatLabel">
            <Trophy className="cs-historyStatIcon" aria-hidden="true" />
            Макс. выигрыш
          </span>
          <span className="cs-historyStatValue" data-tone="gold">
            {formatMoney(stats.maxWin)}
          </span>
        </div>
      </div>

      {/* History List */}
      <ul className="cs-historyList">
        {history.length === 0 ? (
          <li>
            <div className="cs-historyEmpty">
              <Gift className="cs-historyEmptyIcon" aria-hidden="true" />
              <p className="cs-historyEmptyTitle">История пуста — сыграйте первый раунд</p>
            </div>
          </li>
        ) : (
          history.map((item) => {
            const rarityStyle = RARITY_STYLES[item.rarity] || RARITY_STYLES.common;
            const net = item.payout - item.bet;
            const isProfit = net > 0;

            const formattedTime = formatTime(item.createdAt);

            return (
              <li key={item.id} className="cs-historyItem">
                <div className="cs-historyItemHead">
                  <span className="cs-historyTags">
                    <span
                      className="cs-rarityTag"
                      style={{
                        color: rarityStyle.color,
                        borderColor: rarityStyle.borderColor,
                      }}
                    >
                      {rarityStyle.label}
                    </span>
                    {item.lines > 1 && (
                      <span className="cs-linesTag">{item.lines} линии</span>
                    )}
                  </span>
                  <span className="cs-historyWhen">{formattedTime}</span>
                </div>

                <div className="cs-historyCols">
                  <span className="cs-col">
                    <span className="cs-colLabel">Ставка</span>
                    <span className="cs-colValue" data-tone="default" data-size="lg">
                      {formatMoney(item.bet)}
                    </span>
                  </span>
                  <span className="cs-col">
                    <span className="cs-colLabel">Приз</span>
                    <span className="cs-colValue" data-tone="default" data-size="lg">
                      <Gift className="cs-colIcon" aria-hidden="true" />
                      {formatMoney(item.payout)}
                    </span>
                  </span>
                  <span className="cs-col">
                    <span className="cs-colLabel">Множ.</span>
                    <span className="cs-colValue" data-tone="gold" data-size="lg">
                      ×{item.multiplier.toFixed(2)}
                    </span>
                  </span>
                  <span className="cs-col">
                    <span className="cs-colLabel">Итог</span>
                    <span
                      className="cs-colValue"
                      data-tone={isProfit ? 'green' : 'loss'}
                      data-size="lg"
                    >
                      {isProfit ? (
                        <TrendingUp className="cs-colIcon" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="cs-colIcon" aria-hidden="true" />
                      )}
                      {isProfit ? `+${formatMoney(net)}` : `−${formatMoney(-net)}`}
                    </span>
                  </span>
                </div>

                <button
                  type="button"
                  className="cs-receiptBtn"
                  onClick={() => onOpenReceipt(item)}
                >
                  <Receipt className="cs-colIcon" aria-hidden="true" />
                  Получить чек
                </button>
              </li>
            );
          })
        )}
      </ul>
    </section>
  );
}

const SHORT_MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Только что';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин. назад`;
    return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
  } catch {
    return 'Недавно';
  }
}
