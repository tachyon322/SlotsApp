'use client';

import { Trophy, Wallet, Zap, ArrowUpRight } from 'lucide-react';
import { useTopUpModal } from './TopUpModal';

export interface AuthUser {
  name: string;
  level: number;
  xp: number;
  balance: number;
}

interface UserBlockProps {
  user: AuthUser;
}

function formatXp(xp: number): string {
  if (xp >= 1000) {
    return `${(xp / 1000).toFixed(1).replace(/\.0$/, '')}K`;
  }
  return String(xp);
}

function formatBalance(balance: number): string {
  return `${balance.toLocaleString('ru-RU')} ₽`;
}

export function UserBlock({ user }: UserBlockProps) {
  const initial = user.name.trim().charAt(0).toUpperCase() || '?';
  const { openTopUp } = useTopUpModal();

  return (
    <div className="p-md border-b border-sidebar-border">
      <div className="space-y-sm">
        <div className="flex items-center gap-sm">
          <span className="relative flex shrink-0 overflow-hidden rounded-pill h-10 w-10 ring-2 ring-emerald-500/10">
            <span className="flex h-full w-full items-center justify-center rounded-pill bg-emerald-500/10 text-emerald-400 font-semibold text-sm">
              {initial}
            </span>
          </span>
          <div className="flex flex-col min-w-0 flex-1">
            <div className="flex items-center gap-xs min-w-0">
              <span className="text-sm font-semibold truncate text-sidebar-foreground">
                {user.name}
              </span>
              <span className="inline-flex items-center rounded-pill border border-transparent bg-sidebar-accent text-sidebar-foreground h-5 px-2xs text-[10px] font-semibold flex-shrink-0">
                LVL {user.level}
              </span>
            </div>
            <div className="flex items-center gap-2xs text-xs text-muted-foreground">
              <Trophy className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">{formatXp(user.xp)} XP</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2xs px-sm py-xs rounded-panel bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20">
          <Wallet className="h-4 w-4 text-cyan-500" />
          <span className="text-sm font-bold bg-gradient-to-r from-cyan-500 to-blue-500 bg-clip-text text-transparent">
            {formatBalance(user.balance)}
          </span>
        </div>

        <div className="flex gap-xs">
          <button onClick={openTopUp} className="inline-flex items-center justify-center gap-xs whitespace-nowrap font-medium transition-colors h-8 rounded-control px-sm text-xs flex-1 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow">
            <Zap className="w-4 h-4" />
            Пополнить
          </button>
          <button className="inline-flex items-center justify-center gap-xs whitespace-nowrap font-medium transition-colors h-8 rounded-control px-sm text-xs flex-1 border border-white/10 bg-background hover:bg-accent/50">
            <ArrowUpRight className="w-4 h-4" />
            Вывести
          </button>
        </div>
      </div>
    </div>
  );
}
