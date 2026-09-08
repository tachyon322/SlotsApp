'use client';

import React from 'react';
import { ModalShell } from '@/components/ModalShell';
import { SLOT_SYMBOLS, ALL_SYMBOL_KEYS } from '@/lib/slots/engine';
import { SymbolArt } from '@/components/slots/symbols';

interface SlotsRulesModalProps {
  open: boolean;
  onClose: () => void;
}

export function SlotsRulesModal({ open, onClose }: SlotsRulesModalProps) {
  // Зеркалят MODE_PAYOUT_FACTOR в back/src/routes/slots.ts.
  const classicFactor = 2.2;
  const megaFactor = 1.4;

  return (
    <ModalShell open={open} onClose={onClose} titleId="slots-rules-title" maxWidthClass="max-w-[40rem]">
      <div className="sl-rules flex flex-col gap-6 text-zinc-100">
        <div>
          <h2 id="slots-rules-title" className="text-xl font-bold text-white mb-1">
            Правила игры в Слоты
          </h2>
          <p className="text-xs text-zinc-400">
            Собирайте комбинации из одинаковых символов слева направо по активным линиям выплат.
          </p>
        </div>

        {/* Сводка */}
        <div className="slr-summary">
          <span>Стоимость раунда</span>
          <strong>ставка за ряд × ряды</strong>
          <small>
            Вайлд заменяет любой символ в комбинации. Классический (3×3) и Мега (5×3) имеют разные
            коэффициенты за одинаковые комбинации.
          </small>
        </div>

        {/* Таблицы выплат */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(
            [
              { title: 'Классический (3×3)', factor: classicFactor },
              { title: 'Мега (5×3)', factor: megaFactor },
            ] as const
          ).map(({ title, factor }) => (
            <div key={title}>
              <h3 className="text-sm font-semibold text-zinc-300 mb-2">{title}</h3>
              <div className="slr-tableWrap">
                <table className="slr-paytable">
                  <thead>
                    <tr>
                      <th>Символ</th>
                      <th>3×</th>
                      <th>4×</th>
                      <th>5×</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ALL_SYMBOL_KEYS.map((key) => {
                      const sym = SLOT_SYMBOLS[key];
                      return (
                        <tr key={key}>
                          <td>
                            <span className="slr-symbol">
                              <SymbolArt emoji={sym.emoji} />
                              <span>{sym.label}</span>
                            </span>
                          </td>
                          {Object.entries(sym.payouts).map(([count, mult]) => (
                            <td key={count}>{Math.round(mult * factor)}×</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}
