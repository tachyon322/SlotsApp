'use client';

import { AlertTriangle, X } from 'lucide-react';
import { ModalShell } from './ModalShell';

const DETAILS_TEXT =
  'Данные были указаны неточно или не совпали с банковскими реквизитами. Попробуйте пройти процедуру еще раз, внимательно проверив правильность заполнения всех полей. Это нужно, чтобы система подтвердила вас как владельца карты.';

export function VerificationFailedModal({
  open,
  onClose,
  amountText,
  createdAt,
}: {
  open: boolean;
  onClose: () => void;
  amountText?: string;
  createdAt?: string;
}) {
  const timeLabel = (() => {
    if (!createdAt) return '8:34 PM';
    try {
      return new Date(createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '8:34 PM';
    }
  })();

  return (
    <ModalShell open={open} onClose={onClose} titleId="verification-failed-title">
      <div className="flex flex-col gap-md">
        <div className="flex items-start gap-sm">
          <span className="p-sm rounded-panel shrink-0 flex items-center justify-center bg-amber-500/15 text-amber-400">
            <AlertTriangle className="w-6 h-6" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="verification-failed-title" className="text-lg font-bold text-white">
              Верификация не пройдена
            </h2>
            {amountText && <p className="text-sm text-zinc-400 mt-1">{amountText}</p>}
          </div>
        </div>

        <div className="rounded-card border border-zinc-800 bg-zinc-900 p-card">
          <p className="text-sm leading-relaxed text-zinc-300">{DETAILS_TEXT}</p>
          <p className="text-xs text-zinc-500 mt-sm text-right">{timeLabel}</p>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center justify-center whitespace-nowrap rounded-control px-2xl w-full h-12 text-sm font-bold bg-zinc-800 hover:bg-zinc-700 text-white transition-colors"
        >
          Понятно
        </button>
      </div>
    </ModalShell>
  );
}
