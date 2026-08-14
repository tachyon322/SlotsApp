'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Check, Loader2, Wallet, X } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Pagination } from '@/components/admin/Pagination';
import { adminApi, type AdminAffiliateWithdrawalsResponse, type AdminAffiliateWithdrawal } from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

const LIMIT = 50;
const STATUS_TABS: { key: string; label: string }[] = [
  { key: 'pending', label: 'В обработке' },
  { key: 'approved', label: 'Одобренные' },
  { key: 'rejected', label: 'Отклонённые' },
  { key: 'all', label: 'Все' },
];

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: 'В обработке', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/25' },
    approved: { label: 'Одобрено', cls: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25' },
    rejected: { label: 'Отклонено', cls: 'bg-red-500/15 text-red-400 border-red-500/25' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-white/10 text-white/70 border-white/10' };
  return (
    <span className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${s.cls}`}>
      {s.label}
    </span>
  );
}

export default function AdminAffiliatePayoutsPage() {
  return (
    <AdminShell>
      {({ token }) => <PayoutsList token={token} />}
    </AdminShell>
  );
}

function PayoutsList({ token }: { token: string }) {
  const [status, setStatus] = useState('pending');
  const [data, setData] = useState<AdminAffiliateWithdrawalsResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [deciding, setDeciding] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminAffiliateWithdrawal | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  const load = useCallback(
    async (t: string, st: string, off: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await adminApi.affiliateWithdrawals(t, st, LIMIT, off));
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

  const decide = async (id: string, decision: 'approved' | 'rejected', comment?: string) => {
    setDeciding(id);
    try {
      await adminApi.decideAffiliateWithdrawal(token, id, decision, comment);
      showSuccess(decision === 'approved' ? 'Вывод одобрен' : 'Вывод отклонён, средства возвращены');
      await load(token, status, offset);
    } catch (err) {
      showError((err as Error).message);
    } finally {
      setDeciding(null);
    }
  };

  const confirmReject = async () => {
    if (!rejectTarget) return;
    await decide(rejectTarget.id, 'rejected', rejectComment.trim());
    setRejectTarget(null);
    setRejectComment('');
  };

  const switchStatus = (st: string) => {
    setStatus(st);
    setOffset(0);
  };

  return (
    <main className="px-page pt-md pb-2xl w-full">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/adminlitgame43144"
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" />
          К сводке
        </Link>

        <div className="mt-3 flex items-center gap-xs">
          <Wallet className="h-5 w-5 text-blue-400" />
          <h1 className="text-xl font-bold text-white">Выводы партнёров</h1>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => switchStatus(tab.key)}
              className={`rounded-button px-3 py-1.5 text-xs font-semibold transition-colors ${
                status === tab.key
                  ? 'bg-blue-500/20 text-blue-300'
                  : 'border border-white/10 bg-white/[0.02] text-white/70 hover:bg-white/5'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Не удалось загрузить данные
          </p>
        ) : !data ? (
          <div className="mt-5 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-panel bg-white/5" />
            ))}
          </div>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted-foreground">
              Всего: {data.total.toLocaleString('ru-RU')} · Сумма:{' '}
              {data.sum.toLocaleString('ru-RU')} ₽
            </p>

            <div className="mt-4 overflow-hidden rounded-panel border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                      <th className="px-4 py-3">Партнёр</th>
                      <th className="px-4 py-3">Сумма</th>
                      <th className="px-4 py-3">Метод</th>
                      <th className="px-4 py-3">Реквизиты</th>
                      <th className="px-4 py-3">Статус</th>
                      <th className="px-4 py-3">Дата</th>
                      <th className="px-4 py-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((w) => (
                      <tr
                        key={w.id}
                        className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <div className="text-white">{w.name}</div>
                          <div className="text-xs text-muted-foreground">{w.email}</div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-white">{w.amount.toLocaleString('ru-RU')} ₽</div>
                          {w.method === 'usdt' && w.usdtAmount !== null && (
                            <div className="text-xs text-blue-400">≈ {w.usdtAmount} USDT</div>
                          )}
                          {w.method === 'sbp' && (
                            <div className="text-xs text-muted-foreground">комиссия −{w.fee} ₽</div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-white/80">{w.method === 'usdt' ? 'USDT TRC20' : 'СБП'}</span>
                          {w.method === 'sbp' && w.bank && (
                            <div className="text-xs text-muted-foreground">{w.bank}</div>
                          )}
                          {w.method === 'usdt' && w.rate !== null && (
                            <div className="text-xs text-muted-foreground">курс {w.rate} ₽</div>
                          )}
                        </td>
                        <td className="max-w-[16rem] px-4 py-3">
                          <div className="truncate text-xs text-white/80">{w.requisites}</div>
                          {w.comment && (
                            <div className="mt-1 truncate text-[11px] text-muted-foreground" title={w.comment}>
                              {w.comment}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={w.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(w.createdAt)}</td>
                        <td className="px-4 py-3">
                          {w.status === 'pending' ? (
                            <div className="flex items-center justify-end gap-2">
                              <button
                                type="button"
                                disabled={deciding === w.id}
                                onClick={() => void decide(w.id, 'approved')}
                                className="inline-flex items-center gap-1 rounded-button border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
                              >
                                {deciding === w.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Одобрить
                              </button>
                              <button
                                type="button"
                                disabled={deciding === w.id}
                                onClick={() => {
                                  setRejectTarget(w);
                                  setRejectComment('');
                                }}
                                className="inline-flex items-center gap-1 rounded-button border border-red-500/25 bg-red-500/10 px-2.5 py-1.5 text-xs font-semibold text-red-400 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                              >
                                <X className="h-3.5 w-3.5" />
                                Отклонить
                              </button>
                            </div>
                          ) : (
                            <div className="text-right text-xs text-muted-foreground">
                              {w.decidedAt ? formatDate(w.decidedAt) : '—'}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                    {data.items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
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

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setRejectTarget(null)}>
          <div
            className="w-full max-w-[28rem] rounded-panel border border-white/10 bg-background p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold text-white">Отклонить вывод</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              {rejectTarget.name} · {rejectTarget.amount.toLocaleString('ru-RU')} ₽ — средства вернутся на баланс партнёра.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-semibold text-white/80">Причина (необязательно)</span>
              <textarea
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                rows={3}
                placeholder="Например: некорректные реквизиты"
                className="w-full resize-none rounded-button border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-red-500 focus:outline-none"
              />
            </label>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="rounded-button border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 transition-colors hover:bg-white/5"
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={deciding === rejectTarget.id}
                onClick={() => void confirmReject()}
                className="inline-flex items-center gap-1 rounded-button bg-gradient-to-r from-red-500 to-red-600 px-4 py-2 text-xs font-semibold text-white shadow transition-colors hover:from-red-600 hover:to-red-700 disabled:opacity-50"
              >
                {deciding === rejectTarget.id && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Отклонить
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
