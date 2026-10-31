'use client';

import { useEffect, useState } from 'react';
import { LgSheet } from '@/components/ui/LgSheet';
import { TARGET_PLACEMENTS, formatRub } from '@/lib/blockblast/engine';
import { REFUND_CAP_AT, percent, refundRatio } from '@/components/blockblast/rules';
import { useSheetChrome } from '@/components/ui/useSheetChrome';

interface BlockBlastModalProps {
  open: boolean;
  betAmount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Подтверждение перед раундом: главное правило — забрать можно только с 15-й фигуры. */
export function BlockBlastModal({ open, betAmount, onCancel, onConfirm }: BlockBlastModalProps) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);
  useSheetChrome(open, onCancel);

  if (!open) return null;

  return (
    <LgSheet
      titleId="blockblast-modal-title"
      title="Перед стартом"
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="pg-btn pg-btn-sec ls-fit" onClick={onCancel}>
            Отмена
          </button>
          <button type="button" className="pg-btn pg-btn-acc" disabled={!checked} onClick={onConfirm}>
            Играть · {formatRub(betAmount)}
          </button>
        </>
      }
    >
      <ol className="bx-keys">
        <li>
          <i>1</i>
          <div>
            <b>Забрать — с {TARGET_PLACEMENTS}-й фигуры</b>
            <span>На {TARGET_PLACEMENTS}-й фигуре ×1.5, каждая следующая +0.1, до ×2.</span>
          </div>
        </li>
        <li>
          <i>2</i>
          <div>
            <b>Раньше тупик или время — возврат части</b>
            <span>
              До {percent(refundRatio(REFUND_CAP_AT))} ставки: например, 8 фигур → {percent(refundRatio(8))}.
            </span>
          </div>
        </li>
        <li>
          <i>3</i>
          <div>
            <b>Сгоревшая линия — +10% ставки сразу</b>
            <span>Бонус за линию зачисляется на баланс в тот же момент.</span>
          </div>
        </li>
      </ol>

      <label className="bx-check">
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span>Понятно: забрать — после {TARGET_PLACEMENTS} размещений</span>
      </label>
    </LgSheet>
  );
}
