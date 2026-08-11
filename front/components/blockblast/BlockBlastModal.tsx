'use client';

import { useEffect, useState } from 'react';
import { ModalShell } from '@/components/ModalShell';

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

  return (
    <ModalShell open={open} onClose={onCancel} titleId="blockblast-modal-title">
      <h2 id="blockblast-modal-title" className="blockblast_modalTitle">
        Как работает BlockBlast
      </h2>
      <p className="blockblast_modalBody">
        Размещай фигуры и очищай линии — множитель растёт. Забрать выигрыш можно
        <strong>после 15 размещений</strong>. Если зайти в тупик или не успеть по времени{' '}
        <strong>до 15</strong> — вернётся часть ставки (например 8 фигур → 0.48 ставки). На каждый
        ход есть таймер, и чем дальше — тем меньше времени.
      </p>

      <label className="blockblast_modalCheck">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        <span>Понятно: забрать — после 15 размещений</span>
      </label>

      <div className="blockblast_modalActions">
        <button type="button" className="blockblast_modalCancel" onClick={onCancel}>
          Отмена
        </button>
        <button
          type="button"
          className="blockblast_modalConfirm"
          disabled={!checked}
          onClick={onConfirm}
        >
          Играть · {Math.round(betAmount).toLocaleString('ru-RU')} ₽
        </button>
      </div>
    </ModalShell>
  );
}
