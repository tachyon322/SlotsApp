'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, Loader2, Wallet } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Pagination } from '@/components/admin/Pagination';
import {
  adminApi,
  type AdminWithdrawalsResponse,
  type AdminWithdrawalStatus,
} from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

const LIMIT = 50;

const STATUS_TABS: { id: AdminWithdrawalStatus | 'all'; label: string }[] = [
  { id: 'pending', label: 'Ожидают' },
  { id: 'success', label: 'Выплачены' },
  { id: 'cancelled', label: 'Отменены' },
  { id: 'all', label: 'Все' },
];

const STATUS_LABEL: Record<AdminWithdrawalStatus, string> = {
  pending: 'Ожидает выплаты',
  success: 'Выплачен',
  failed: 'Ошибка',
  cancelled: 'Отменён',
};

const STATUS_CLASS: Record<AdminWithdrawalStatus, string> = {
  pending: 'bg-amber-500/10 text-amber-400',
  success: 'bg-emerald-500/10 text-emerald-400',
  failed: 'bg-red-500/10 text-red-400',
  cancelled: 'bg-zinc-500/10 text-zinc-400',
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

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return '';
  }
}

export default function AdminWithdrawalsPage() {
  return (
    <AdminShell>
      {({ token }) => <WithdrawalsPanel token={token} />}
    </AdminShell>
  );
}

function WithdrawalsPanel({ token }: { token: string }) {
  const [data, setData] = useState<AdminWithdrawalsResponse | null>(null);
  const [status, setStatus] = useState<AdminWithdrawalStatus | 'all'>('pending');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [comment, setComment] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(
    async (t: string, s: AdminWithdrawalStatus | 'all', off: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await adminApi.withdrawals(t, s, LIMIT, off));
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

  const handleStatusChange = (next: AdminWithdrawalStatus | 'all') => {
    setStatus(next);
    setOffset(0);
    setExpandedId(null);
    setComment('');
  };

  const handleToggle = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
    setComment('');
  };

  const handleUpdate = async (id: string, action: 'paid' | 'reject') => {
    if (savingId) return;
    setSavingId(id);
    try {
      await adminApi.updateWithdrawal(token, id, {
        action,
        comment: action === 'reject' ? comment.trim() || undefined : undefined,
      });
      showSuccess(action === 'paid' ? 'Вывод отмечен выплаченным' : 'Заявка отклонена, деньги возвращены');
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
          <Wallet className="h-5 w-5 text-blue-400" />
          <h1 className="text-xl font-bold text-white">Выводы средств</h1>
        </div>

        <p className="mt-2 text-xs text-muted-foreground">
          Баланс списывается при создании заявки. Оператор вручную отмечает «Выплачено» либо
          отклоняет заявку с возвратом на баланс. Срок выплаты — 30 рабочих дней.
        </p>

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
              Всего: {data.total.toLocaleString('ru-RU')} · В ожидании:{' '}
              {data.pendingCount.toLocaleString('ru-RU')}
            </p>

            <div className="mt-4 overflow-hidden rounded-panel border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                      <th className="px-4 py-3">Пользователь</th>
                      <th className="px-4 py-3">Сумма</th>
                      <th className="px-4 py-3">Способ</th>
                      <th className="px-4 py-3">Статус</th>
                      <th className="px-4 py-3">Срок</th>
                      <th className="px-4 py-3">Создана</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((item) => (
                      <WithdrawalRow
                        key={item.id}
                        item={item}
                        expanded={expandedId === item.id}
                        saving={savingId === item.id}
                        comment={comment}
                        onCommentChange={setComment}
                        onToggle={() => handleToggle(item.id)}
                        onUpdate={(action) => handleUpdate(item.id, action)}
                      />
                    ))}
                    {data.items.length === 0 && (
                      <tr>
                        <td
                          colSpan={7}
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

function WithdrawalRow({
  item,
  expanded,
  saving,
  comment,
  onCommentChange,
  onToggle,
  onUpdate,
}: {
  item: AdminWithdrawalsResponse['items'][number];
  expanded: boolean;
  saving: boolean;
  comment: string;
  onCommentChange: (value: string) => void;
  onToggle: () => void;
  onUpdate: (action: 'paid' | 'reject') => void;
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
        <td className="px-4 py-3">
          <div className="text-white/80">{item.method ?? '—'}</div>
          <div className="font-mono text-xs text-muted-foreground">{item.requisites ?? '—'}</div>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex rounded-pill px-2.5 py-1 text-xs font-semibold ${STATUS_CLASS[item.status]}`}
          >
            {STATUS_LABEL[item.status]}
          </span>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
          {formatDate(item.deadline)}
          {item.overdue && (
            <span className="ml-2 inline-flex rounded-pill bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-400">
              Просрочено
            </span>
          )}
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
          <td colSpan={7} className="px-4 py-4">
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Реквизиты{item.method ? ` · ${item.method}` : ''}
                  </span>
                  <p className="mt-0.5 font-mono text-white/80">{item.requisites ?? '—'}</p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">Срок выплаты</span>
                  <p className="mt-0.5 text-white/80">
                    до {formatDate(item.deadline)} ({item.processingDays} рабочих дней с момента
                    создания)
                  </p>
                </div>
                <div>
                  <span className="text-xs font-semibold text-muted-foreground">
                    Баланс пользователя
                  </span>
                  <p className="mt-0.5 text-white/80">
                    {item.balanceDebited ? 'списан при создании заявки' : 'не списан'}
                  </p>
                </div>
              </div>

              {isPending && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-muted-foreground">
                    Комментарий к отклонению (необязательно)
                  </label>
                  <textarea
                    value={comment}
                    onChange={(e) => onCommentChange(e.target.value)}
                    rows={3}
                    maxLength={1000}
                    placeholder="Например: неверные реквизиты"
                    className="w-full rounded-button border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 focus:border-blue-500 focus:outline-none resize-none"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onUpdate('paid')}
                      className="inline-flex items-center gap-1 rounded-button bg-gradient-to-r from-emerald-500 to-emerald-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-50"
                    >
                      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Выплачено
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => onUpdate('reject')}
                      className="inline-flex items-center gap-1 rounded-button border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-300 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                    >
                      Отклонить с возвратом
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    «Выплачено» закрывает заявку со статусом «Выплачен». «Отклонить с возвратом»
                    вернёт списанную сумму на баланс пользователя.
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
