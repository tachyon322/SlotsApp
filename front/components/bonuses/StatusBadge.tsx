'use client';

import { Check, Loader2, Lock, Trophy } from 'lucide-react';
import type { AchievementStatus } from '@/lib/api';

interface StatusBadgeProps {
  status: AchievementStatus;
  claiming?: boolean;
}

export function StatusBadge({ status, claiming }: StatusBadgeProps) {
  if (claiming) {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-white/5 border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/70">
        <Loader2 className="h-3 w-3 animate-spin" />
        ...
      </span>
    );
  }

  if (status === 'claimed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-emerald-500/10 border border-emerald-500/20 px-2 py-1 text-[11px] font-semibold text-emerald-400">
        <Check className="h-3 w-3" />
        Получено
      </span>
    );
  }

  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1 rounded-pill bg-amber-400/10 border border-amber-400/25 px-2 py-1 text-[11px] font-semibold text-amber-300">
        <Trophy className="h-3 w-3" />
        Выполнено
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-white/5 border border-white/10 px-2 py-1 text-[11px] font-semibold text-white/50">
      <Lock className="h-3 w-3" />
      В процессе
    </span>
  );
}
