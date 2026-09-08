'use client';

import { useEffect, useState } from 'react';
import { formatRub } from '@/lib/blockblast/engine';

interface BlockBlastModalProps {
  open: boolean;
  betAmount: number;
  onCancel: () => void;
  onConfirm: () => void;
}

export function BlockBlastModal({ open, betAmount, onCancel, onConfirm }: BlockBlastModalProps) {
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (open) setChecked(false);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="bb-modalOverlay" onClick={onCancel} role="presentation">
      <div
        className="bb-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="blockblast-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="blockblast-modal-title" className="bb-modalTitle">
          Как работает BlockBlast
        </h2>
        <p className="bb-modalBody">
          Размещайте фигуры и очищайте линии — множитель растёт. Забрать выигрыш
          можно <strong>после 15 размещений</strong>. Если зайти в тупик или не
          успеть по времени <strong>до 15</strong> — вернётся часть ставки
          (например 8 фигур → 0.48 ставки). На каждый ход есть таймер, и чем
          дальше — тем меньше времени.
        </p>

        <label className="bb-modalCheck">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          <span>Понятно: забрать — после 15 размещений</span>
        </label>

        <div className="bb-modalActions">
          <button type="button" className="bb-modalCancel" onClick={onCancel}>
            Отмена
          </button>
          <button
            type="button"
            className="bb-modalConfirm"
            disabled={!checked}
            onClick={onConfirm}
          >
            Играть · {formatRub(betAmount)}
          </button>
        </div>
      </div>
    </div>
  );
}
