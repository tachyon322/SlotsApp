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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(
              [
                { title: 'Классический (3×3)', factor: classicFactor, valueClass: 'text-amber-300', headClass: 'text-amber-300 bg-amber-500/10' },
                { title: 'Мега (5×3)', factor: megaFactor, valueClass: 'text-purple-300', headClass: 'text-purple-300 bg-purple-500/10' },
              ] as const
            ).map(({ title, factor, valueClass, headClass }) => (
              <div key={title} className="rounded-button bg-white/[0.02] border border-white/5 overflow-hidden">
                <div className={`px-2.5 py-1.5 text-[10px] font-bold border-b border-white/5 ${headClass}`}>
                  {title}
                </div>
                <div className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] px-2.5 py-1 text-[10px] text-zinc-500">
                  <span>Символ</span>
                  <span className="text-right">3×</span>
                  <span className="text-right">4×</span>
                  <span className="text-right">5×</span>
                </div>
                {ALL_SYMBOL_KEYS.map((key) => {
                  const sym = SLOT_SYMBOLS[key];
                  return (
                    <div
                      key={key}
                      className="grid grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))] px-2.5 py-1 text-xs border-t border-white/5 items-center"
                    >
                      <span className="flex items-center gap-1.5 font-medium text-zinc-200 min-w-0">
                        <span className="text-base leading-none">{sym.emoji}</span>
                        <span className="truncate">{sym.label}</span>
                      </span>
                      {Object.entries(sym.payouts).map(([count, mult]) => (
                        <span key={count} className={`text-right font-mono font-bold ${valueClass}`}>
                          {Math.round(mult * factor)}x
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
            ))}
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
