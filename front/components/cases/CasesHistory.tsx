'use client';

import React from 'react';
import { Clock, Coins, Trophy, Gift, TrendingDown, TrendingUp, Receipt } from 'lucide-react';
import { RARITY_STYLES } from '@/lib/cases/engine';
import type { CasesHistoryItem } from '@/lib/api';

interface CasesHistoryProps {
  history: CasesHistoryItem[];
  stats: {
    totalWinnings: number;
    maxWin: number;
    totalCount: number;
  };
  onOpenReceipt: (item: CasesHistoryItem) => void;
}

export function CasesHistory({ history, stats, onOpenReceipt }: CasesHistoryProps) {
  return (
    <section className="cases_history__1i5Dd" aria-label="История игр">
      {/* Header */}
      <header className="cases_historyHead__w7nRI">
        <span className="cases_historyTitle__AjmVC">
          <Clock className="cases_historyTitleIcon__Uk6s_" aria-hidden="true" />
          История игр
        </span>
        <span className="cases_historyBadge__53eBm">{stats.totalCount || history.length} всего</span>
      </header>

      {/* Stats Cards */}
      <div className="cases_historyStats___IcEZ">
        <div className="cases_historyStat__klAcU">
          <span className="cases_historyStatLabel__2mcnv">
            <Coins className="cases_historyStatIcon__M8oL7" aria-hidden="true" />
            Общие выигрыши
          </span>
          <span className="cases_historyStatValue__mZKhb" data-tone="green">
            +{stats.totalWinnings.toLocaleString('ru-RU')} ₽
          </span>
        </div>
        <div className="cases_historyStat__klAcU">
          <span className="cases_historyStatLabel__2mcnv">
            <Trophy className="cases_historyStatIcon__M8oL7" aria-hidden="true" />
            Макс. выигрыш
          </span>
          <span className="cases_historyStatValue__mZKhb" data-tone="gold">
            {stats.maxWin.toLocaleString('ru-RU')} ₽
          </span>
        </div>
      </div>

      {/* History List */}
      <ul className="cases_historyList__Xbce_">
        {history.map((item) => {
          const rarityStyle = RARITY_STYLES[item.rarity] || RARITY_STYLES.common;
          const net = item.payout - item.bet;
          const isProfit = net > 0;
          const formattedNet = isProfit
            ? `+${net.toLocaleString('ru-RU')} ₽`
            : `${net.toLocaleString('ru-RU')} ₽`;

          const formattedTime = formatTime(item.createdAt);

          return (
            <li key={item.id} className="cases_historyItem__dYSn3">
              <div className="cases_historyItemHead__mfCLT">
                <span className="cases_historyTags__mF0Q3">
                  <span
                    className="cases_rarityTag__tRqHT"
                    style={{
                      color: rarityStyle.color,
                      borderColor: rarityStyle.borderColor,
                    }}
                  >
                    {rarityStyle.label}
                  </span>
                  {item.lines > 1 && (
                    <span className="cases_linesTag__9DPLv">{item.lines} линии</span>
                  )}
                </span>
                <span className="cases_historyWhen__Q4kUn">{formattedTime}</span>
              </div>

              <div className="cases_historyCols__jfZ_O">
                <span className="cases_col__XGZRq">
                  <span className="cases_colLabel__TrR0p">Ставка</span>
                  <span className="cases_colValue__LUdHP" data-tone="default" data-size="lg">
                    {item.bet.toLocaleString('ru-RU')} ₽
                  </span>
                </span>
                <span className="cases_col__XGZRq">
                  <span className="cases_colLabel__TrR0p">Приз</span>
                  <span className="cases_colValue__LUdHP" data-tone="default" data-size="lg">
                    <Gift className="cases_colIcon__4Xb36" aria-hidden="true" />
                    {item.payout.toLocaleString('ru-RU')} ₽
                  </span>
                </span>
                <span className="cases_col__XGZRq">
                  <span className="cases_colLabel__TrR0p">Множ.</span>
                  <span className="cases_colValue__LUdHP" data-tone="gold" data-size="lg">
                    ×{item.multiplier}
                  </span>
                </span>
                <span className="cases_col__XGZRq">
                  <span className="cases_colLabel__TrR0p">Итог</span>
                  <span
                    className="cases_colValue__LUdHP"
                    data-tone={isProfit ? "win" : "loss"}
                    data-size="lg"
                  >
                    {isProfit ? (
                      <TrendingUp className="cases_colIcon__4Xb36" aria-hidden="true" />
                    ) : (
                      <TrendingDown className="cases_colIcon__4Xb36" aria-hidden="true" />
                    )}
                    {formattedNet}
                  </span>
                </span>
              </div>

              <button
                type="button"
                className="cases_receiptBtn__iZh46"
                onClick={() => onOpenReceipt(item)}
              >
                <Receipt className="cases_colIcon__4Xb36" aria-hidden="true" />
                Получить чек
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Только что';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} мин. назад`;
    return `${d.getDate()} ${d.toLocaleString('ru-RU', { month: 'short' })}`;
  } catch {
    return 'Недавно';
  }
}
