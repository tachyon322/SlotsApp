'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  total: number;
  offset: number;
  limit: number;
  loading?: boolean;
  onChange: (offset: number) => void;
}

export function Pagination({ total, offset, limit, loading, onChange }: PaginationProps) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  const btnClass =
    'inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-xs text-muted-foreground">
        Показано {from}–{to} из {total.toLocaleString('ru-RU')}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={!hasPrev || loading}
          onClick={() => onChange(offset - limit)}
          className={btnClass}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          Назад
        </button>
        <button
          type="button"
          disabled={!hasNext || loading}
          onClick={() => onChange(offset + limit)}
          className={btnClass}
        >
          Вперёд
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
