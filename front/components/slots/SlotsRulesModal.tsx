'use client';

import React from 'react';
import { ModalShell } from '@/components/ModalShell';
import { SLOT_SYMBOLS, ALL_SYMBOL_KEYS } from '@/lib/slots/engine';

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
      <div className="flex flex-col gap-6 text-zinc-100">
        <div>
          <h2 id="slots-rules-title" className="text-xl font-bold text-white mb-1">
            Правила игры в Слоты
          </h2>
          <p className="text-xs text-zinc-400">
            Собирайте комбинации из одинаковых символов слева направо по активным линиям выплат.
          </p>
        </div>

        {/* Режимы */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-button bg-white/[0.03] border border-white/10">
            <span className="font-bold text-amber-400 block mb-1">🏆 Классический (3×3)</span>
            <p className="text-zinc-300 leading-relaxed">
              3 барабана и до 3 горизонтальных линий. Ставка рассчитывается как: <em>Ставка на линию × Количество линий</em>.
            </p>
          </div>
          <div className="p-3 rounded-button bg-white/[0.03] border border-white/10">
            <span className="font-bold text-purple-400 block mb-1">⚡ Мега-Слоты (5×3)</span>
            <p className="text-zinc-300 leading-relaxed">
              5 барабанов и 5 дигональных и горизонтальных линий. Повышенные коэффициенты за комбинации из 4 и 5 символов.
            </p>
          </div>
        </div>

        {/* Таблица выплат */}
        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-3">Таблица коэффициентов выплат</h3>
          <div className="text-[10px] text-zinc-500 mb-2">
            Классический (3×3) и Мега (5×3) имеют разные коэффициенты за одинаковые комбинации.
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {ALL_SYMBOL_KEYS.map((key) => {
              const sym = SLOT_SYMBOLS[key];
              return (
                <div
                  key={key}
                  className="flex items-center justify-between p-2.5 rounded-button bg-white/[0.02] border border-white/5"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{sym.emoji}</span>
                    <span className="font-medium text-zinc-200">{sym.label}</span>
                  </div>
                  <div className="flex gap-2 font-mono font-bold text-amber-300">
                    {Object.entries(sym.payouts).map(([count, mult]) => (
                      <span
                        key={count}
                        className="px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-right"
                      >
                        {count}×: <span className="text-amber-200">{Math.round(mult * classicFactor)}x</span>
                        / <span className="text-purple-300">{Math.round(mult * megaFactor)}x</span>
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Особые символы */}
        <div className="p-3 rounded-button bg-purple-500/10 border border-purple-500/20 text-xs">
          <span className="font-bold text-purple-300 block mb-1">🃏 Вайлд (Wild)</span>
          <p className="text-purple-200/90 leading-relaxed">
            Символ Вайлд заменяет любой другой символ в комбинациях для составления максимального выигрыша по линии.
          </p>
        </div>
      </div>
    </ModalShell>
  );
}
