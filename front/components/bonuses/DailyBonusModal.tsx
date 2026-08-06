'use client';

import { Gift, Flame, Check } from 'lucide-react';
import { ModalShell } from '@/components/ModalShell';

interface DailyBonusModalProps {
  open: boolean;
  onClose: () => void;
  cycle: number[];
  streak: number;
  claimedToday: boolean;
}

export function DailyBonusModal({ open, onClose, cycle, streak, claimedToday }: DailyBonusModalProps) {
  const currentIndex = Math.max(0, streak - 1);
  const nextIndex = claimedToday ? currentIndex : Math.min(cycle.length - 1, currentIndex);

  return (
    <ModalShell open={open} onClose={onClose} titleId="daily-bonus-title">
      <div className="flex flex-col items-center text-center">
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-panel bg-gradient-to-br from-blue-500/20 to-cyan-500/10 border border-blue-500/30">
          <Gift className="h-7 w-7 text-blue-400" />
        </div>
        <h2 id="daily-bonus-title" className="text-lg font-bold text-white">
          Ежедневный бонус
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Заходи каждый день и получай награды. Пропустишь день — серия сгорит.
        </p>

        {streak > 0 && (
          <div className="mt-3 inline-flex items-center gap-1 rounded-pill bg-orange-500/10 border border-orange-500/25 px-3 py-1 text-sm font-bold text-orange-400">
            <Flame className="h-4 w-4" />
            Серия: {streak}
          </div>
        )}

        <div className="mt-4 grid w-full grid-cols-7 gap-1.5">
          {cycle.map((amount, i) => {
            const collected = i < currentIndex || (claimedToday && i === currentIndex);
            const isToday = !claimedToday && i === nextIndex;
            return (
              <div
                key={i}
                data-active={isToday}
                className={`flex flex-col items-center gap-1 rounded-button border p-1.5 transition-colors ${
                  collected
                    ? 'border-emerald-500/25 bg-emerald-500/10'
                    : isToday
                      ? 'border-blue-400/40 bg-blue-500/10'
                      : 'border-white/5 bg-white/[0.02]'
                }`}
              >
                <span
                  className={`text-[10px] font-semibold ${
                    collected ? 'text-emerald-400' : isToday ? 'text-blue-300' : 'text-white/40'
                  }`}
                >
                  Д{i + 1}
                </span>
                <span
                  className={`text-[11px] font-bold ${
                    collected ? 'text-emerald-300' : isToday ? 'text-blue-200' : 'text-white/60'
                  }`}
                >
                  {amount.toLocaleString('ru-RU')}
                </span>
                {collected && <Check className="h-3 w-3 text-emerald-400" />}
              </div>
            );
          })}
        </div>

        <p className="mt-4 text-[11px] text-muted-foreground">
          {claimedToday
            ? 'Бонус за сегодня получен. Возвращайся завтра!'
            : 'Нажми «Забрать», чтобы получить бонус сегодня.'}
        </p>
      </div>
    </ModalShell>
  );
}
