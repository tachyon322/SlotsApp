'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModalShell } from '@/components/ModalShell';

/* ============================== Buttons ============================== */

export const btnBase =
  'inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-button text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

export const btnPrimary = cn(
  btnBase,
  'bg-gradient-to-r from-blue-500 to-blue-600 px-4 py-2.5 font-semibold text-white shadow hover:from-blue-600 hover:to-blue-700',
);

export const btnOutline = cn(
  btnBase,
  'border border-white/10 bg-white/[0.02] px-4 py-2.5 text-white/70 hover:bg-white/5 hover:text-white',
);

export const btnGhost = cn(
  btnBase,
  'border border-white/10 bg-white/[0.02] px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/5 hover:text-white',
);

export const btnIcon = cn(
  btnBase,
  'rounded-button border border-white/10 bg-white/[0.02] p-1.5 text-white/60 hover:bg-white/5 hover:text-white',
);

/* ============================== Inputs ============================== */

export const inputClass =
  'w-full rounded-button border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white placeholder:text-white/30 focus:border-blue-500 focus:outline-none';

export const selectClass =
  'w-full rounded-button border border-white/15 bg-[#0f172a] px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none';

export const textareaClass =
  'w-full resize-none rounded-button border border-white/15 bg-white/5 px-4 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-blue-500 focus:outline-none';

export const dateInputClass =
  'rounded-button border border-white/15 bg-white/5 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none';

/* ============================== Field ============================== */

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      {label && <label className="mb-1.5 block text-xs font-semibold text-white/80">{label}</label>}
      {children}
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/* ============================== Tag ============================== */

const tagColors = {
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  red: 'bg-red-500/15 text-red-400 border-red-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  zinc: 'bg-white/5 text-white/70 border-white/10',
  purple: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  cyan: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
  gold: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
} as const;

export type TagColor = keyof typeof tagColors;

export function Tag({ color = 'zinc', children }: { color?: TagColor; children: ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-pill border px-2 py-0.5 text-xs font-semibold whitespace-nowrap',
        tagColors[color],
      )}
    >
      {children}
    </span>
  );
}

/* ============================== Segmented ============================== */

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  size = 'md',
  className,
}: {
  value: T;
  options: SegmentedOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.03] p-1', className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cn(
              'rounded-control font-semibold transition-colors whitespace-nowrap',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              active
                ? 'border border-blue-500/40 bg-blue-500/15 text-blue-400'
                : 'border border-transparent text-muted-foreground hover:bg-white/5 hover:text-white',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ============================== Switch ============================== */

export function Switch({
  checked,
  onChange,
  disabled,
  size = 'md',
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative shrink-0 cursor-pointer rounded-pill border transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-5 w-9' : 'h-6 w-11',
        checked ? 'border-transparent bg-gradient-to-b from-blue-500 to-blue-600' : 'border-white/10 bg-white/5',
      )}
    >
      <span
        className={cn(
          'absolute top-1/2 -translate-y-1/2 rounded-full bg-white transition-transform',
          size === 'sm' ? 'left-0.5 h-3.5 w-3.5' : 'left-0.5 h-5 w-5',
          checked && (size === 'sm' ? 'translate-x-4' : 'translate-x-5'),
        )}
      />
    </button>
  );
}

/* ============================== Empty ============================== */

export function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-12 text-center text-sm text-muted-foreground">{text}</div>;
}

/* ============================== Modal ============================== */

export function AppModal({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidthClass = 'max-w-[30rem]',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  maxWidthClass?: string;
}) {
  const id = useId().replace(/:/g, '');
  return (
    <ModalShell open={open} onClose={onClose} titleId={`app-modal-${id}`} maxWidthClass={maxWidthClass}>
      <h2 id={`app-modal-${id}`} className="text-xl font-bold text-white">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
      {footer && <div className="mt-5 flex gap-3">{footer}</div>}
    </ModalShell>
  );
}

export function ConfirmModal({
  open,
  onClose,
  title,
  description,
  confirmText = 'Удалить',
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  confirmText?: string;
  onConfirm: () => void;
  loading?: boolean;
}) {
  return (
    <AppModal
      open={open}
      onClose={onClose}
      title={title}
      maxWidthClass="max-w-[26rem]"
      footer={
        <>
          <button type="button" className={btnOutline} onClick={onClose} disabled={loading}>
            Отмена
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={cn(
              btnBase,
              'flex-1 bg-red-500/15 px-4 py-2.5 font-semibold text-red-400 hover:bg-red-500/25',
            )}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmText}
          </button>
        </>
      }
    >
      <p className="text-sm text-muted-foreground">{description}</p>
    </AppModal>
  );
}

/* ============================== Date range ============================== */

export function DateRange({
  value,
  onChange,
  allowClear = true,
  className,
}: {
  value: [string, string] | null;
  onChange: (value: [string, string] | null) => void;
  allowClear?: boolean;
  className?: string;
}) {
  const [from, to] = value ?? ['', ''];

  const update = (nFrom: string, nTo: string) => {
    if (!nFrom && !nTo) onChange(null);
    else onChange([nFrom, nTo]);
  };

  return (
    <div className={cn('inline-flex items-center gap-2', className)}>
      <input
        type="date"
        value={from}
        onChange={(e) => update(e.target.value, to)}
        className={dateInputClass}
        aria-label="Начало периода"
      />
      <span className="text-muted-foreground">—</span>
      <input
        type="date"
        value={to}
        onChange={(e) => update(from, e.target.value)}
        className={dateInputClass}
        aria-label="Конец периода"
      />
      {allowClear && (from || to) && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label="Сбросить период"
          className={cn(btnIcon)}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

/* ============================== Table ============================== */

export interface Column<T> {
  key: string;
  title: string;
  align?: 'left' | 'right' | 'center';
  width?: string;
  render: (row: T) => ReactNode;
}

function alignClass(align?: Column<unknown>['align']): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading = false,
  emptyText = 'Пока нет данных',
  page,
  pageSize,
  total,
  onPageChange,
}: {
  columns: Column<T>[];
  data: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  emptyText?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
}) {
  const [internalPage, setInternalPage] = useState(1);

  const serverPaged = page !== undefined && pageSize !== undefined && total !== undefined && onPageChange !== undefined;
  const clientPaged = !serverPaged && pageSize !== undefined;

  const currentPage = serverPaged ? page : clientPaged ? internalPage : 1;
  const pages = serverPaged ? Math.max(1, Math.ceil(total / pageSize)) : clientPaged ? Math.max(1, Math.ceil(data.length / pageSize)) : 1;

  const visible = clientPaged ? data.slice((currentPage - 1) * pageSize, currentPage * pageSize) : data;
  const shownFrom = serverPaged ? (data.length === 0 ? 0 : (currentPage - 1) * pageSize + 1) : clientPaged ? (visible.length === 0 ? 0 : (currentPage - 1) * pageSize + 1) : 0;
  const shownTo = serverPaged ? (currentPage - 1) * pageSize + data.length : clientPaged ? (currentPage - 1) * pageSize + visible.length : data.length;
  const grandTotal = serverPaged ? total : data.length;

  const hasPagination = serverPaged || clientPaged;
  const goPrev = () => {
    if (serverPaged) onPageChange(Math.max(1, currentPage - 1));
    else setInternalPage(Math.max(1, currentPage - 1));
  };
  const goNext = () => {
    if (serverPaged) onPageChange(Math.min(pages, currentPage + 1));
    else setInternalPage(Math.min(pages, currentPage + 1));
  };

  return (
    <div>
      <div className="overflow-hidden rounded-panel border border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    style={c.width ? { width: c.width, minWidth: c.width } : undefined}
                    className={cn('px-4 py-3', alignClass(c.align))}
                  >
                    {c.title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-12">
                    <div className="flex items-center justify-center gap-2 text-muted-foreground">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Загрузка…
                    </div>
                  </td>
                </tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted-foreground">
                    {emptyText}
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr key={rowKey(row)} className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.02]">
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-4 py-3 align-middle', alignClass(c.align))}>
                        {c.render(row)}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {hasPagination && pages > 1 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">
            Показано {shownFrom}–{shownTo} из {grandTotal.toLocaleString('ru-RU')}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={goPrev}
              className={btnGhost}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Назад
            </button>
            <span className="text-xs text-muted-foreground">
              {currentPage} / {pages}
            </span>
            <button
              type="button"
              disabled={currentPage >= pages}
              onClick={goNext}
              className={btnGhost}
            >
              Вперёд
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
