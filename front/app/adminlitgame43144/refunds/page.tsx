'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Loader2, Undo2 } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Pagination } from '@/components/admin/Pagination';
import {
  adminApi,
  type AdminRefundsResponse,
  type RefundRequestStatus,
} from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

const LIMIT = 50;

const STATUS_TABS: { id: RefundRequestStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'В обработке' },
  { id: 'approved', label: 'Одобрены' },
  { id: 'rejected', label: 'Отклонены' },
  { id: 'all', label: 'Все' },
];

const STATUS_LABEL: Record<RefundRequestStatus, string> = {
  pending: 'В обработке',
  approved: 'Одобрена',
  rejected: 'Отклонена',
};

const STATUS_CLASS: Record<RefundRequestStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-400',
  approved: 'bg-emerald-500/10 text-emerald-400',
  rejected: 'bg-red-500/10 text-red-400',
};

function formatRub(amount: number): string {
  return `${amount.toLocaleString('ru-RU')}\u00A0₽`;
}

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString('ru-RU') +
      ' ' +
      d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    );
  } catch {
    return '';
  }
}

export default function AdminRefundsPage() {
  return (
    <AdminShell>
      {({ token }) => <RefundsPanel token={token} />}
    </AdminShell>
  );
}

function RefundsPanel({ token }: { token: string }) {
  const [data, setData] = useState<AdminRefundsResponse | null>(null);
  const [status, setStatus] = useState<RefundRequestStatus | 'all'>('pending');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(
    async (t: string, s: RefundRequestStatus | 'all', off: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await adminApi.refunds(t, s, LIMIT, off));
      } catch (e) {
        const message = (e as Error).message;
        showError(message);
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void load(token, status, offset);
  }, [token, status, offset, load]);

  const handleStatusChange = (next: RefundRequestStatus | 'all') => {
    setStatus(next);
    setOffset(0);
    setExpandedId(null);
    setComment('');
  };

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    setComment('');
  };

  const handleUpdate = async (id: string, next: 'approved' | 'rejected') => {
    if (savingId) return;
    setSavingId(id);
    try {
      await adminApi.updateRefund(token, id, {
        status: next,
        comment: comment.trim() || undefined,
      });
      showSuccess(next === 'approved' ? 'Заявка одобрена' : 'Заявка отклонена');
      setExpandedId(null);
      setComment('');
      await load(token, status, offset);
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setSavingId(null);
    }
  };

  return (
    <main className="px-page pt-md pb-2xl w-full">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/adminlitgame43144"
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" />
          К сводке
        </Link>

        <div className="mt-3 flex items-center gap-xs">
          <Undo2 className="h-5 w-5 text-amber-400" />
          <h1 className="text-xl font-bold text-white">Возвраты средств</h1>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => handleStatusChange(tab.id)}
              className={`rounded-button border px-3 py-1.5 text-xs font-semibold transition-colors ${
                status === tab.id
                  ? 'border-blue-500/50 bg-blue-500/10 text-white'
                  : 'border-white/10 bg-white/[0.02] text-white/60 hover:bg-white/5'
              }`}
            >
              {tab.label}
              {tab.id === 'pending' && data && ` · ${data.pendingCount}`}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-4 text-xs text-muted-foreground">Не удалось загрузить данные</p>
        ) : !data ? (
          <div className="mt-5 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-panel bg-white/5" />
            ))}
          </div>
        ) : (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              Всего: {data.total.toLocaleString('ru-RU')} · В обработке:{' '}
              {data.pendingCount.toLocaleString('ru-RU')}
            </p>

            <div className="mt-4 overflow-hidden rounded-panel border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                      <th className="px-4 py-3">Пользователь</th>
                      <th className="px-4 py-3">Сумма</th>
                      <th className="px-4 py-3">Причина</th>
                      <th className="px-4 py-3">Статус</th>
                      <th className="px-4 py-3">Дата</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <RefundRow
                        key={item.id}
                        item={item}
                        expanded={expandedId === item.id}
                        saving={savingId === item.id}
                        comment={comment}
                        onCommentChange={setComment}
                        onToggle={() => handleToggle(item.id)}
                        onUpdate={(next) => handleUpdate(item.id, next)}
                      />
                    ))}
                    {data.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-4 py-8 text-center text-sm text-muted-foreground"
                        >
                          Заявок пока нет
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {loading && (
              <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Загрузка…
              </p>
            )}

            <Pagination
              total={data.total}
              offset={offset}
              limit={LIMIT}
              loading={loading}
              onChange={setOffset}
            />
          </>
        )}
      </div>
    </main>
  );
}

function RefundRow({
  item,
  expanded,
  saving,
  comment,
  onCommentChange,
  onToggle,
  onUpdate,
}: {
  item: AdminRefundsResponse['items'][number];
  expanded: boolean;
  saving: boolean;
  comment: string;
  onCommentChange: (value: string) => void;
  onToggle: () => void;
  onUpdate: (next: 'approved' | 'rejected') => void;
}) {
  const isPending = item.status === 'pending';

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer border-b border-white/5 transition-colors hover:bg-white/[0.02] ${
          expanded ? 'bg-white/[0.03]' : ''
        }`}
      >
        <td className="px-4 py-3">
          <div className="text-white">{item.name}</div>
          <div className="text-xs text-muted-foreground">{item.email}</div>
        </td>
        <td className="px-4 py-3 font-semibold text-money">{formatRub(item.amount)}</td>
        <td className="max-w-[22rem] px-4 py-3">
          <span className="line-clamp-2 text-white/80">{item.reason}</span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex rounded-pill px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[item.status]}`}
          >
            {STATUS_LABEL[item.status]}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
          {formatDateTime(item.createdAt)}
        </td>
        <td className="px-4 py-3 text-right">
          <ChevronDown
            className={`inline h-4 w-4 text-white/30 transition-transform ${expanded ? 'rotate-180' : ''}`}
          />
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-white/5 bg-white/[0.02]">
          <td colSpan={6} className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">Причина</span>
                  <p className="mt-0.5 whitespace-pre-wrap text-white/80">{item.reason}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Реквизиты{item.method ? ` · ${item.method}` : ''}
                  </span>
                  <p className="mt-0.5 font-mono text-white/80">{item.requisites}</p>
                </div>
                {item.processedAt && (
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground">
                      Обработана
                    </span>
                    <p className="mt-0.5 text-white/80">{formatDateTime(item.processedAt)}</p>
                  </div>
                )}
                {item.adminComment && (
                  <div>
                    <span className="text-xs font-semibold text-muted-foreground">
                      Комментарий
                    </span>
                    <p className="mt-0.5 whitespace-pre-wrap text-white/80">
                      {item.adminComment}
                    </p>
                  </div>
                )}
              </div>

              {isPending && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    Комментарий для пользователя (необязательно)
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => onCommentChange(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Например: выплата отправлена на указанные реквизиты"
                    className="w-full rounded-button border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-blue-500 focus:outline-none resize-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onUpdate('approved')}
                      className="inline-flex items-center gap-1 rounded-button bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Одобрить
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onUpdate('rejected')}
                      className="inline-flex items-center gap-1 rounded-button border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Отклонить
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Статус увидит пользователь на главной странице. Баланс при необходимости
                    скорректируйте вручную в разделе «Пользователи».
                  </p>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
