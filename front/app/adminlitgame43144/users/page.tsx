'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, Loader2, Pencil, Search } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Pagination } from '@/components/admin/Pagination';
import { EditUserModal } from '@/components/admin/EditUserModal';
import { adminApi, type AdminUsersResponse, type AdminUserItem, type AdminUserFunnel } from '@/lib/api';
import { showError } from '@/lib/toast';

const LIMIT = 50;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return '';
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function FunnelBadge({ active, label, title }: { active: boolean; label: string; title: string }) {
  return (
    <span
      title={title}
      className={`inline-flex items-center rounded-pill border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
        active
          ? 'border-emerald-500/25 bg-emerald-500/15 text-emerald-400'
          : 'border-white/10 bg-white/[0.02] text-white/35'
      }`}
    >
      {label}
    </span>
  );
}

function getCurrentFunnelStage(funnel: AdminUserFunnel): {
  step: number;
  label: string;
  description: string;
  className: string;
} {
  if (!funnel.hasDeposit) {
    return {
      step: 1,
      label: 'Ожидает депозит',
      description: 'Следующий шаг — первый депозит',
      className: 'border-white/15 bg-white/5 text-white/75',
    };
  }
  if (!funnel.hasPaidVerification) {
    return {
      step: 2,
      label: 'Ожидает верификацию',
      description: 'Депозит пройден, нужна оплата верификации',
      className: 'border-amber-500/25 bg-amber-500/15 text-amber-300',
    };
  }
  if (!funnel.verifiedForPayment) {
    return {
      step: 3,
      label: 'Проверка реквизитов',
      description: 'Реквизиты ожидают подтверждения модератором',
      className: 'border-blue-500/25 bg-blue-500/15 text-blue-300',
    };
  }
  return {
    step: 4,
    label: 'Готов к выводу',
    description: 'Депозит, верификация и проверка реквизитов пройдены',
    className: 'border-emerald-500/25 bg-emerald-500/15 text-emerald-300',
  };
}

function FunnelCell({ funnel }: { funnel: AdminUserFunnel }) {
  const stage = getCurrentFunnelStage(funnel);

  return (
    <div className="min-w-52">
      <div
        title={stage.description}
        className={`inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-xs font-bold whitespace-nowrap ${stage.className}`}
      >
        <span className="text-[10px] opacity-60">ЭТАП {stage.step}/4</span>
        {stage.label}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        <FunnelBadge active={funnel.hasDeposit} label="Депозит" title="Был депозит" />
        <FunnelBadge active={funnel.hasPaidVerification} label="Верификация" title="Оплачена верификация реквизитов" />
        <FunnelBadge active={funnel.verifiedForPayment} label="Проверено" title="Реквизиты подтверждены модератором" />
        <FunnelBadge active={funnel.premiumActive} label="Премиум" title="Премиум активен" />
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  return (
    <AdminShell>
      {({ token }) => <UsersList token={token} />}
    </AdminShell>
  );
}

function UsersList({ token }: { token: string }) {
  const [data, setData] = useState<AdminUsersResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<AdminUserItem | null>(null);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setSearch(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

  const load = useCallback(
    async (t: string, off: number, q: string) => {
      setLoading(true);
      setError(null);
      try {
        setData(await adminApi.users(t, LIMIT, off, q));
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
    void load(token, offset, search);
  }, [token, offset, search, load]);

  return (
    <main className="px-page pt-md pb-2xl w-full">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/adminlitgame43144"
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300"
        >
          К сводке
        </Link>

        <div className="mt-3 flex items-center gap-xs">
          <Users className="h-5 w-5 text-blue-400" />
          <h1 className="text-xl font-bold text-white">Пользователи</h1>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-button border border-white/15 bg-white/5 px-4 py-2.5 focus-within:border-blue-500">
          <Search className="h-4 w-4 shrink-0 text-white/40" />
          <input
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
            placeholder="Быстрый поиск по нику или email…"
            className="w-full bg-transparent text-sm font-semibold text-white placeholder:text-white/30 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setOffset(0);
              }}
              className="text-xs font-semibold text-white/40 hover:text-white"
            >
              Сбросить
            </button>
          )}
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
              Всего: {data.total.toLocaleString('ru-RU')}
            </p>

            <div className="mt-4 overflow-hidden rounded-panel border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                      <th className="px-4 py-3">Пользователь</th>
                      <th className="px-4 py-3">Баланс</th>
                      <th className="px-4 py-3">Уровень</th>
                      <th className="px-4 py-3">Этап воронки</th>
                      <th className="px-4 py-3">Вывод</th>
                      <th className="px-4 py-3">Регистрация</th>
                      <th className="px-4 py-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((u) => (
                      <tr
                        key={u.id}
                        className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <div className="text-white">{u.name}</div>
                          <div className="text-xs text-muted-foreground">{u.email}</div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-white">
                          {u.balance.toLocaleString('ru-RU')} ₽
                        </td>
                        <td className="px-4 py-3 text-white">{u.level}</td>
                        <td className="px-4 py-3">
                          <FunnelCell funnel={u.funnel} />
                        </td>
                        <td className="px-4 py-3">
                          {u.pendingWithdrawal ? (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="inline-flex items-center rounded-pill border border-amber-500/25 bg-amber-500/15 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-amber-400">
                                  Заявка
                                </span>
                                {u.funnel.premiumActive && (
                                  <span className="inline-flex items-center rounded-pill border border-violet-500/25 bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-violet-300">
                                    ПРИОРИТЕТ
                                  </span>
                                )}
                                <span className="font-semibold text-white">
                                  {u.pendingWithdrawal.amount.toLocaleString('ru-RU')} ₽
                                </span>
                              </div>
                              {u.pendingWithdrawal.method && (
                                <div className="mt-1 text-[11px] text-muted-foreground">
                                  {u.pendingWithdrawal.method}
                                  {u.pendingWithdrawal.details ? ` · ${u.pendingWithdrawal.details}` : ''}
                                </div>
                              )}
                              <div className="text-[11px] text-muted-foreground">
                                {formatDateTime(u.pendingWithdrawal.createdAt)}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            onClick={() => setEditingUser(u)}
                            aria-label={`Редактировать ${u.name}`}
                            className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/5 hover:text-white"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            Изменить
                          </button>
                        </td>
                      </tr>
                    ))}
                    {data.items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Пользователей пока нет
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

      <EditUserModal
        open={editingUser !== null}
        token={token}
        user={editingUser}
        onClose={() => setEditingUser(null)}
        onSaved={() => void load(token, offset, search)}
      />
    </main>
  );
}
