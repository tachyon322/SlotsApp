'use client';

import { useMemo, useState } from 'react';
import { Download, Gift, History, MousePointerClick, Search, TrendingUp, UserPlus, type LucideIcon } from 'lucide-react';
import { type AffiliateHistoryItem, type AffiliateHistoryKind } from '@/lib/api';
import { formatDate, formatRub, todayStr } from '@/components/partner/format';
import { Segmented, btnGhost, inputClass } from '@/components/partner/ui';
import { cn } from '@/lib/utils';

type HistoryFilter = 'all' | 'income' | 'signups' | 'clicks';

const KIND_META: Record<AffiliateHistoryKind, { label: string; icon: LucideIcon; tile: string; iconClass: string }> = {
  deposit: { label: 'Доход', icon: TrendingUp, tile: 'bg-emerald-500/15', iconClass: 'text-emerald-400' },
  registration: { label: 'Регистрация', icon: UserPlus, tile: 'bg-blue-500/15', iconClass: 'text-blue-400' },
  promo: { label: 'Промокод', icon: Gift, tile: 'bg-purple-500/15', iconClass: 'text-purple-400' },
  click: { label: 'Переход', icon: MousePointerClick, tile: 'bg-amber-500/15', iconClass: 'text-amber-400' },
};

export default function HistoryPanel({ items, className }: { items: AffiliateHistoryItem[]; className?: string }) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<HistoryFilter>('all');

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === 'income' && it.kind !== 'deposit') return false;
      if (filter === 'signups' && it.kind !== 'registration' && it.kind !== 'promo') return false;
      if (filter === 'clicks' && it.kind !== 'click') return false;
      if (q && !it.sourceName.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [items, search, filter]);

  const exportCsv = () => {
    const header = ['Дата', 'Операция', 'Источник', 'Сумма, руб'];
    const rows = filtered.map((it) => [formatDate(it.createdAt), KIND_META[it.kind].label, it.sourceName, it.amount ?? '']);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate_history_${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasAmount = (it: AffiliateHistoryItem) => it.kind === 'deposit' || it.kind === 'promo';

  return (
    <section
      className={cn('flex flex-col overflow-hidden rounded-card border border-white/10 bg-white/[0.02]', className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h3 className="text-base font-bold text-white">История операций</h3>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              className={cn(inputClass, 'h-9 w-56 py-0 pl-9 text-xs')}
              placeholder="Поиск..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Segmented
            size="sm"
            value={filter}
            options={[
              { label: 'Все', value: 'all' },
              { label: 'Доход', value: 'income' },
              { label: 'Регистрация', value: 'signups' },
              { label: 'Переход', value: 'clicks' },
            ]}
            onChange={(v) => setFilter(v as HistoryFilter)}
            className="max-w-full [&>button]:flex-1"
          />
          <button type="button" className={cn(btnGhost, 'h-9')} onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            Экспорт
          </button>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="flex min-h-[360px] flex-1 flex-col items-center justify-center px-6 py-8 text-center">
          <div className="mb-4 flex h-[54px] w-[54px] items-center justify-center rounded-[20px] bg-blue-500/15 text-blue-400">
            <History className="h-6 w-6" />
          </div>
          <p className="text-base font-semibold text-white">Пока нет операций</p>
          <p className="mt-1 max-w-[360px] text-xs leading-relaxed text-muted-foreground">
            Переходы, регистрации и доход появятся здесь после первой активности.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex min-h-[200px] flex-1 items-center justify-center px-6 py-8 text-center">
          <p className="text-sm text-muted-foreground">Ничего не найдено</p>
        </div>
      ) : (
        <ul className="max-h-[520px] flex-1 overflow-y-auto p-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-white/15 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
          {filtered.map((it) => {
            const meta = KIND_META[it.kind];
            const Icon = meta.icon;
            return (
              <li
                key={it.id}
                className="flex items-center gap-3 rounded-panel px-2 py-2 transition-colors hover:bg-white/[0.02]"
              >
                <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-button', meta.tile)}>
                  <Icon className={cn('h-4 w-4', meta.iconClass)} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-white">{it.sourceName}</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {meta.label} · {formatDate(it.createdAt)}
                  </span>
                </span>
                {hasAmount(it) ? (
                  <span className="shrink-0 text-sm font-semibold text-money">+{formatRub(it.amount ?? 0)}</span>
                ) : (
                  <span className="shrink-0 text-sm text-muted-foreground">—</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
