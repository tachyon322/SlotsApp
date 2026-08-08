'use client';

import React from 'react';
import { ModalShell } from '@/components/ModalShell';
import { Receipt, ShieldCheck } from 'lucide-react';
import { RARITY_STYLES } from '@/lib/cases/engine';
import type { CasesHistoryItem } from '@/lib/api';

interface CasesReceiptModalProps {
  open: boolean;
  onClose: () => void;
  item: CasesHistoryItem | null;
}

export function CasesReceiptModal({ open, onClose, item }: CasesReceiptModalProps) {
  if (!item) return null;

  const rarityStyle = RARITY_STYLES[item.rarity] || RARITY_STYLES.common;
  const net = item.payout - item.bet;
  const formattedNet = net >= 0 ? `+${net.toLocaleString('ru-RU')} ₽` : `${net.toLocaleString('ru-RU')} ₽`;

  return (
    <ModalShell open={open} onClose={onClose} titleId="cases-receipt-modal-title" maxWidthClass="max-w-[28rem]">
      <div className="flex items-center gap-sm mb-md">
        <div className="p-sm rounded-panel bg-money/10 text-money border border-money/20">
          <Receipt className="w-6 h-6" />
        </div>
        <div>
          <h2 id="cases-receipt-modal-title" className="text-lg font-bold text-white flex items-center gap-xs">
            Чек раунда #
            <span className="font-mono text-cyan-400 text-sm">
              {item.id.slice(0, 8)}
            </span>
          </h2>
          <p className="text-xs text-slate-400">Доказательство честности (Provably Fair)</p>
        </div>
      </div>

      <div className="space-y-sm bg-slate-900/60 p-card rounded-panel border border-white/5 mb-lg text-xs">
        <div className="flex justify-between items-center py-xs border-b border-white/5">
          <span className="text-slate-400">Кейс</span>
          <span className="font-bold text-white uppercase">{item.caseId}</span>
        </div>

        <div className="flex justify-between items-center py-xs border-b border-white/5">
          <span className="text-slate-400">Количество линий</span>
          <span className="font-bold text-white">{item.lines}</span>
        </div>

        <div className="flex justify-between items-center py-xs border-b border-white/5">
          <span className="text-slate-400">Ставка за линию</span>
          <span className="font-bold text-white">{item.lineBet.toLocaleString('ru-RU')} ₽</span>
        </div>

        <div className="flex justify-between items-center py-xs border-b border-white/5">
          <span className="text-slate-400">Общая ставка</span>
          <span className="font-bold text-white">{item.bet.toLocaleString('ru-RU')} ₽</span>
        </div>

        <div className="flex justify-between items-center py-xs border-b border-white/5">
          <span className="text-slate-400">Выпавшая редкость</span>
          <span
            className="font-bold px-xs py-2xs rounded-pill border"
            style={{ color: rarityStyle.color, borderColor: rarityStyle.borderColor }}
          >
            {rarityStyle.label}
          </span>
        </div>

        <div className="flex justify-between items-center py-xs border-b border-white/5">
          <span className="text-slate-400">Итоговый множитель</span>
          <span className="font-bold text-amber-400 font-mono">×{item.multiplier}</span>
        </div>

        <div className="flex justify-between items-center py-xs border-b border-white/5">
          <span className="text-slate-400">Приз</span>
          <span className="font-bold text-white font-mono">{item.payout.toLocaleString('ru-RU')} ₽</span>
        </div>

        <div className="flex justify-between items-center py-xs pt-sm">
          <span className="text-slate-400 font-bold">Итог раунда</span>
          <span className={`font-extrabold text-sm ${net >= 0 ? 'text-money' : 'text-red-400'}`}>
            {formattedNet}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-xs p-xs rounded-button bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs mb-md">
        <ShieldCheck className="w-4 h-4 flex-shrink-0" />
        <span>Результат раунда подтвержден криптографическим хэшем.</span>
      </div>

      <button
        type="button"
        onClick={onClose}
        className="w-full py-sm rounded-button bg-zinc-800 hover:bg-zinc-700 text-white font-bold text-sm transition-colors"
      >
        Закрыть
      </button>
    </ModalShell>
  );
}
