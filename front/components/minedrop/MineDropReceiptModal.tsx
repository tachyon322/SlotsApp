'use client';

import { ModalShell } from '@/components/ModalShell';
import { ReceiptText } from 'lucide-react';
import { BLOCK_COLOR, BLOCK_IMAGE } from '@/lib/minedrop/engine';
import { BLOCKS, type BlockId } from '@/lib/minedrop/pickaxeEngine';
import type { Receipt } from '@/hooks/useMinedropGame';

interface MineDropReceiptModalProps {
  open: boolean;
  onClose: () => void;
  receipt: Receipt | null;
}

export function MineDropReceiptModal({ open, onClose, receipt }: MineDropReceiptModalProps) {
  if (!receipt) return null;

  const { bet, multiplier, payout, outcome, round } = receipt;
  const net = payout - bet;
  const netText = net >= 0 ? `+${net.toLocaleString('ru-RU')} ₽` : `${net.toLocaleString('ru-RU')} ₽`;

  // Сколько блоков каждого типа разбито.
  const counts = new Map<BlockId, number>();
  for (const ev of round.events) {
    if (ev.k === 'break') counts.set(ev.b, (counts.get(ev.b) ?? 0) + 1);
  }
  const broken = [...counts.entries()].sort((a, b) => BLOCKS[b[0]].value - BLOCKS[a[0]].value);

  const rows: Array<[string, React.ReactNode]> = [
    ['Ставка', `${bet.toLocaleString('ru-RU')} ₽`],
    ['Инструмент', round.tool.label],
    ['Глубина', `${round.depth} м`],
    ['Разбито блоков', round.blocksBroken],
    ['Итоговый множитель', <span key="m" className="text-amber-400 font-mono">×{multiplier.toFixed(2)}</span>],
    ['Выплата', <span key="p" className="font-mono">{payout.toLocaleString('ru-RU')} ₽</span>],
  ];

  return (
    <ModalShell open={open} onClose={onClose} titleId="minedrop-receipt-title" maxWidthClass="max-w-[28rem]">
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
          {rows.map(([label, value]) => (
            <div key={label} className="flex justify-between items-center border-b border-white/5 pb-2">
              <span className="text-slate-400">{label}</span>
              <span className="font-bold text-white">{value}</span>
            </div>
          ))}
          <div className="flex justify-between items-center">
            <span className="text-slate-400">Итог</span>
            <span className="font-bold font-mono" style={{ color: net >= 0 ? '#34d399' : '#f87171' }}>
              {netText}
            </span>
          </div>
        </div>

        {broken.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold text-zinc-300 mb-2">Разбитые блоки</h3>
            <div className="flex flex-wrap gap-1.5">
              {broken.map(([id, n]) => (
                <span key={id} className="flex items-center gap-1.5 px-2 py-1 rounded-button bg-white/[0.03] border border-white/5 text-xs">
                  {BLOCK_IMAGE[id] ? (
                    <span className="md-sheetSprite" style={{ backgroundImage: `url(${BLOCK_IMAGE[id]})` }} />
                  ) : (
                    <span className="md-sheetSprite md-sheetSprite--flat" style={{ background: BLOCK_COLOR[id] }}>
                      {id === 'tnt' ? 'TNT' : '↑'}
                    </span>
                  )}
                  {BLOCKS[id].label} ×{n}
                </span>
              ))}
            </div>
          </div>
        )}

        <p className="text-[11px] text-slate-500 font-mono">seed {round.seed}</p>
      </div>
    </ModalShell>
  );
}
