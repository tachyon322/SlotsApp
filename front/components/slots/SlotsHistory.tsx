'use client';

import React from 'react';
import { Clock, Coins, Trophy, TrendingUp, TrendingDown } from 'lucide-react';
import type { SlotsHistoryItem } from '@/lib/api';

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

function formatCurrency(val: number) {
  return val.toLocaleString('ru-RU', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' ₽';
}

export function SlotsHistory({ history, stats }: SlotsHistoryProps) {
  return (
    <section className="slots_history__qo7hf" aria-label="История игр">
      <header className="slots_historyHead__QWKMp">
        <span className="slots_historyTitle__N2vVm">
          <Clock className="slots_historyTitleIcon__FSwtD" aria-hidden="true" />
          История игр
        </span>
          <span className="slots_historyBadge__HEhAA">{stats.totalCount} всего</span>
      </header>

      <div className="slots_historyStats__dSNOt">
        <div className="slots_historyStat__73sio">
          <span className="slots_historyStatLabel__Wxl2W">
            <Coins className="slots_historyStatIcon__78F4J" aria-hidden="true" />
            Общие выигрыши
          </span>
          <span className="slots_historyStatValue__SaOGs" data-tone="green" data-size="md">
            +{formatCurrency(stats.totalWinnings)}
          </span>
        </div>

        <div className="slots_historyStat__73sio">
          <span className="slots_historyStatLabel__Wxl2W">
            <Trophy className="slots_historyStatIcon__78F4J" aria-hidden="true" />
            Макс. выигрыш
          </span>
          <span className="slots_historyStatValue__SaOGs" data-tone="gold" data-size="md">
            {formatCurrency(stats.maxWin)}
          </span>
        </div>
      </div>

      <ul className="slots_historyList__0eyhE">
        {history.length === 0 ? (
          <li className="text-xs text-zinc-500 py-4 text-center">История игр пока пуста</li>
        ) : (
          history.map((item) => {
            const isWin = item.outcome === 'win';
            const isLdw = item.outcome === 'ldw';

            let outcomeClass = 'loss';
            if (isWin) outcomeClass = 'win';
            else if (isLdw) outcomeClass = 'ldw';

            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="slots_historyCard__T7whf"
                  data-win={isWin}
                  aria-label={`Открыть чек раунда от ${formatDate(item.createdAt)}`}
                >
                  <span className="slots_cardTop__nVeln">
                    <span className="slots_cardTag__A0VeM" data-mode={item.mode}>
                      {item.mode === 'mega' ? 'Мега-Слоты' : 'Слоты'}
                    </span>
                    <span className="slots_cardWhen__9doY7">{formatDate(item.createdAt)}</span>
                  </span>

                  <span className="slots_cardStats__BXiiV">
                    <span className="slots_cardStat__qUTjz">
                      <span className="slots_cardStatLabel__HGqO8">Ставка</span>
                      <span className="slots_cardStatValue__TkMTF" data-size="md">
                        {item.bet} ₽
                      </span>
                    </span>

                    <span className="slots_cardStat__qUTjz">
                      <span className="slots_cardStatLabel__HGqO8">Ряды</span>
                      <span className="slots_cardStatValue__TkMTF">{item.lines || '—'}</span>
                    </span>

                    <span className="slots_cardStat__qUTjz">
                      <span className="slots_cardStatLabel__HGqO8">Множ.</span>
                      <span className="slots_cardStatValue__TkMTF" data-tone="gold" data-size="md">
                        ×{item.multiplier.toFixed(2)}
                      </span>
                    </span>

                    <span className="slots_cardStat__qUTjz" data-result="true">
                      <span className="slots_cardStatLabel__HGqO8">Результат</span>
                      <span className="slots_cardResult__YF_j1" data-outcome={outcomeClass} data-size="md">
                        {isWin || isLdw ? (
                          <>
                            <TrendingUp className="slots_cardResultIcon__q2J5p" aria-hidden="true" />
                            <span className="slots_cardResultText__5VU_7">+{formatCurrency(item.payout)}</span>
                          </>
                        ) : (
                          <>
                            <TrendingDown className="slots_cardResultIcon__q2J5p" aria-hidden="true" />
                            <span className="slots_cardResultText__5VU_7">−{item.bet} ₽</span>
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
  );
}
