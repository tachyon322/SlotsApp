'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Banknote, Loader2 } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Pagination } from '@/components/admin/Pagination';
import { adminApi, type AdminDepositsResponse } from '@/lib/api';
import { showError } from '@/lib/toast';

const LIMIT = 50;

// Этапы воронки, за которые пользователь реально платит. Депозит живёт в
// transactions, верификация и премиум — в payments, но в списке они выглядят
// одинаково, чтобы админ видел всю цепочку оплат.
const PURPOSE_LABELS: Record<string, string> = {
  deposit: '1. Депозит',
  verification: '2. Верификация',
  premium: '3. Премиум',
};

const PURPOSE_STYLES: Record<string, string> = {
  deposit: 'border-emerald-500/25 bg-emerald-500/15 text-emerald-300',
  verification: 'border-blue-500/25 bg-blue-500/15 text-blue-300',
  premium: 'border-violet-500/25 bg-violet-500/15 text-violet-300',
};

function methodLabel(method: string | null): string {
  if (!method) return '—';
  if (method === 'sbp') return 'СБП';
  if (method === 'card') return 'Банковская карта';
  return method;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Moscow',
    });
  } catch {
    return '';
  }
}

export default function AdminDepositsPage() {
  return (
    <AdminShell>
      {({ token }) => <DepositsList token={token} />}
    </AdminShell>
  );
}

function DepositsList({ token }: { token: string }) {
  const [data, setData] = useState<AdminDepositsResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (t: string, off: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await adminApi.deposits(t, LIMIT, off));
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
    void load(token, offset);
  }, [token, offset, load]);

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
          <Banknote className="h-5 w-5 text-emerald-400" />
          <h1 className="text-xl font-bold text-white">Депозиты</h1>
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
            <p className="mt-0.5 text-xs text-muted-foreground/70">
              Включены оплаченные этапы воронки: верификация и премиум.
            </p>

            <div className="mt-4 overflow-hidden rounded-panel border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                      <th className="px-4 py-3">Пользователь</th>
                      <th className="px-4 py-3">Сумма</th>
                      <th className="px-4 py-3">Метод</th>
                      <th className="px-4 py-3">Этап воронки</th>
                      <th className="px-4 py-3">Примечание</th>
                      <th className="whitespace-nowrap px-4 py-3">Дата (МСК)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((d) => (
                      <tr
                        key={d.id}
                        className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <div className="text-white">{d.name}</div>
                          <div className="text-xs text-muted-foreground">{d.email}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-emerald-400">
                          +{d.amount.toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-white/80">{methodLabel(d.method)}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center whitespace-nowrap rounded-pill border px-2.5 py-1 text-[11px] font-semibold ${
                              PURPOSE_STYLES[d.purpose] ?? 'border-white/10 bg-white/5 text-white/70'
                            }`}
                          >
                            {PURPOSE_LABELS[d.purpose] ?? d.purpose}
                          </span>
                        </td>
                        <td className="max-w-[18rem] whitespace-normal break-words px-4 py-3 text-white/70">
                          {d.details || '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{formatDate(d.createdAt)}</td>
                      </tr>
                    ))}
                    {data.items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Депозитов пока нет
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
