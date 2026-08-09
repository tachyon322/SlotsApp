'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users, Loader2, ShieldAlert, Pencil } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Pagination } from '@/components/admin/Pagination';
import { EditUserModal } from '@/components/admin/EditUserModal';
import { adminApi, type AdminUsersResponse, type AdminUserItem } from '@/lib/api';

const LIMIT = 50;

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('ru-RU');
  } catch {
    return '';
  }
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

  const load = useCallback(
    async (t: string, off: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await adminApi.users(t, LIMIT, off));
      } catch (e) {
        setError((e as Error).message);
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
          href="../"
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" />
          К сводке
        </Link>

        <div className="mt-3 flex items-center gap-xs">
          <Users className="h-5 w-5 text-blue-400" />
          <h1 className="text-xl font-bold text-white">Пользователи</h1>
        </div>

        {error ? (
          <p className="mt-4 flex items-center gap-2 rounded-button border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-400">
            <ShieldAlert className="h-4 w-4" />
            {error}
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
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
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
        onSaved={() => void load(token, offset)}
      />
    </main>
  );
}
