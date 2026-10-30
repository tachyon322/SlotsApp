'use client';

import { useEffect, useState } from 'react';
import type { SlotMode } from '@/hooks/useSlotsGame';
import { SLOT_SYMBOLS, ALL_SYMBOL_KEYS } from '@/lib/slots/engine';
import { LgSheet } from '@/components/ui/LgSheet';
import { SymbolArt } from '@/components/slots/symbols';
import { paylinesFor, PaylineGlyph } from '@/components/slots/paylines';

interface SlotsRulesModalProps {
  open: boolean;
  mode: SlotMode;
  onClose: () => void;
}

// Зеркалят MODE_PAYOUT_FACTOR в back/src/routes/slots.ts.
const FACTOR: Record<SlotMode, number> = { classic: 2.2, mega: 1.4 };

export function SlotsRulesModal({ open, mode, onClose }: SlotsRulesModalProps) {
  const [tab, setTab] = useState<SlotMode>(mode);

  useEffect(() => {
    if (open) setTab(mode);
  }, [open, mode]);

  // Скролл body и Escape (раньше это делал ModalShell)
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  if (!open) return null;

  const lines = paylinesFor(tab);
  const counts = tab === 'mega' ? [3, 4, 5] : [3];
  const factor = FACTOR[tab];

  return (
    <LgSheet titleId="slots-rules-title" title="Правила" onClose={onClose} state={tab}>
      <div className="sg-seg" role="tablist" aria-label="Режим">
        <button type="button" role="tab" aria-selected={tab === 'classic'} onClick={() => setTab('classic')}>
          Классика <small>3×3</small>
        </button>
        <button type="button" role="tab" data-mega="true" aria-selected={tab === 'mega'} onClick={() => setTab('mega')}>
          Мега <small>5×3</small>
        </button>
      </div>

      <p className="sg-rules-note">
        Стоимость раунда = <b>ставка за линию × линии</b>. Комбинация считается слева направо по активной
        линии. <b>Вайлд</b> <SymbolArt emoji={SLOT_SYMBOLS.wild.emoji} className="sg-sym sg-sym-inline" /> заменяет
        любой символ.
      </p>

      <div className="sg-rules-h">
        <b>Линии</b>
        <span>
          {lines.length} {lines.length === 5 ? 'линий' : 'линии'}
        </span>
      </div>
      <div className="sg-rules-lines" style={{ '--n': lines.length } as React.CSSProperties}>
        {lines.map((line) => (
          <div key={line.id}>
            <PaylineGlyph line={line} />
            <span>Линия {line.id}</span>
          </div>
        ))}
      </div>

      <div className="sg-rules-h">
        <b>Выплаты</b>
        <span>× ставка за линию</span>
      </div>
      <div className="sg-rules-table">
        <table>
          <thead>
            <tr>
              <th>Символ</th>
              {counts.map((n) => (
                <th key={n}>{tab === 'mega' ? n : '3 в ряд'}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_SYMBOL_KEYS.map((key) => {
              const sym = SLOT_SYMBOLS[key];
              return (
                <tr key={key}>
                  <td>
                    <span className="sg-rules-sym">
                      <SymbolArt emoji={sym.emoji} />
                      {sym.label}
                    </span>
                  </td>
                  {counts.map((n) => (
                    <td key={n}>{Math.round(sym.payouts[n] * factor)}×</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </LgSheet>
  );
}
