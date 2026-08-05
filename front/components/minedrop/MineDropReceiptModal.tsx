'use client';

import { ModalShell } from '@/components/ModalShell';
import { ReceiptText } from 'lucide-react';
import { TOOL_BY_ID } from '@/lib/minedrop/engine';
import type { Receipt } from '@/hooks/useMinedropGame';

interface MineDropReceiptModalProps {
  open: boolean;
  onClose: () => void;
  receipt: Receipt | null;
}

export function MineDropReceiptModal({ open, onClose, receipt }: MineDropReceiptModalProps) {
  if (!receipt) return null;

  const { bet, multiplier, payout, outcome, result } = receipt;
  const net = payout - bet;
  const netText = net >= 0 ? `+${net.toLocaleString('ru-RU')} ₽` : `${net.toLocaleString('ru-RU')} ₽`;

  return (
    <ModalShell open={open} onClose={onClose} titleId="minedrop-receipt-title" maxWidthClass="max-w-md">
      <div className="flex flex-col gap-4 text-zinc-100">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-panel bg-money/10 text-money border border-money/20">
            <ReceiptText className="w-5 h-5" />
          </div>
          <h2 id="minedrop-receipt-title" className="text-lg font-bold text-white">
            Чек раунда
          </h2>
          <span
            className="ml-auto px-2 py-1 rounded-pill text-xs font-bold"
            data-outcome={outcome}
            style={
              outcome === 'win'
                ? { color: '#34d399', background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)' }
                : { color: '#f87171', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)' }
            }
          >
            {outcome === 'win' ? 'Победа' : 'Проигрыш'}
          </span>
        </div>

        <div className="flex flex-col gap-2 bg-slate-900/60 p-3 rounded-panel border border-white/5 text-xs">
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-slate-400">Ставка</span>
            <span className="font-bold text-white">{bet.toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-slate-400">Итоговый множитель</span>
            <span className="font-bold text-amber-400 font-mono">×{multiplier.toFixed(2)}</span>
          </div>
          <div className="flex justify-between items-center border-b border-white/5 pb-2">
            <span className="text-slate-400">Выплата</span>
            <span className="font-bold text-white font-mono">{payout.toLocaleString('ru-RU')} ₽</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Итог</span>
            <span
              className="font-bold font-mono"
              style={{ color: net >= 0 ? '#34d399' : '#f87171' }}
            >
              {netText}
            </span>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-semibold text-zinc-300 mb-2">Колонны</h3>
          <div className="grid grid-cols-5 gap-1.5">
            {result.columns.map((col, c) => (
              <div key={c} className="flex flex-col items-center gap-1 rounded-button bg-white/[0.02] border border-white/5 p-1.5">
                <div className="flex flex-col gap-0.5">
                  {col.slots.map((toolId, r) =>
                    toolId === 'empty' ? (
                      <span key={r} className="minedrop_slotMark minedrop_slotMark--empty minedrop_slotMark--mini" aria-hidden="true">
                        ✕
                      </span>
                    ) : (
                      <img key={r} alt="" className="minedrop_receiptTool" src={TOOL_BY_ID[toolId]?.image} />
                    ),
                  )}
                </div>
                <span
                  className="text-[10px] font-bold font-mono"
                  style={{ color: col.multiplier > 0 ? '#34d399' : '#64748b' }}
                >
                  {col.multiplier > 0 ? `+${col.multiplier}` : '0'}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-slate-400 mt-2">
            {result.columns.some((c) => c.jackpot) ? 'Сундук достигнут — джекпот! ⚡' : 'Цифра — множитель самого глубокого разрушенного блока.'}
          </p>
        </div>
      </div>
    </ModalShell>
  );
}
