'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  MessagesSquare,
  Loader2,
  User,
  Bot,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Pagination } from '@/components/admin/Pagination';
import {
  adminApi,
  type AdminSupportConversationsResponse,
  type AdminSupportConversationDetailResponse,
} from '@/lib/api';
import { showError } from '@/lib/toast';

const LIMIT = 50;

function formatDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export default function AdminSupportPage() {
  return (
    <AdminShell>
      {({ token }) => <SupportPanel token={token} />}
    </AdminShell>
  );
}

function SupportPanel({ token }: { token: string }) {
  const [data, setData] = useState<AdminSupportConversationsResponse | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(
    async (t: string, off: number) => {
      setLoading(true);
      setError(null);
      try {
        setData(await adminApi.supportConversations(t, LIMIT, off));
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

  if (openId) {
    return (
      <ConversationDetail
        token={token}
        conversationId={openId}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return (
    <main className="px-page pt-md pb-2xl w-full">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/adminlitgame43144"
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300"
        >
          К сводке
        </Link>

        <div className="mt-3 flex items-center gap-xs">
          <MessagesSquare className="h-5 w-5 text-emerald-400" />
          <h1 className="text-xl font-bold text-white">Обращения в поддержку</h1>
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
                      <th className="px-4 py-3">Сообщений</th>
                      <th className="px-4 py-3">Последнее сообщение</th>
                      <th className="px-4 py-3">Последняя активность</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.items.map((c) => (
                      <tr
                        key={c.id}
                        onClick={() => setOpenId(c.id)}
                        className="cursor-pointer border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <div className="text-white">{c.name}</div>
                          <div className="text-xs text-muted-foreground">{c.email}</div>
                        </td>
                        <td className="px-4 py-3 text-white">{c.messageCount}</td>
                        <td className="max-w-[24rem] px-4 py-3">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            {c.lastMessage?.role === 'user' ? (
                              <User className="h-3.5 w-3.5 shrink-0" />
                            ) : (
                              <Bot className="h-3.5 w-3.5 shrink-0" />
                            )}
                            <span className="truncate text-white/80">
                              {c.lastMessage?.content ?? '—'}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">
                          {formatDateTime(c.updatedAt)}
                        </td>
                      </tr>
                    ))}
                    {data.items.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Обращений пока нет
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

function ConversationDetail({
  token,
  conversationId,
  onBack,
}: {
  token: string;
  conversationId: string;
  onBack: () => void;
}) {
  const [detail, setDetail] = useState<AdminSupportConversationDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    adminApi
      .supportConversation(token, conversationId)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((e) => {
        if (!cancelled) {
          const message = (e as Error).message;
          showError(message);
          setError(message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, conversationId]);

  return (
    <main className="px-page pt-md pb-2xl w-full">
      <div className="mx-auto max-w-5xl">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-1 text-sm font-semibold text-blue-400 hover:text-blue-300"
        >
          <ArrowLeft className="h-4 w-4" />
          К списку диалогов
        </button>

        <div className="mt-3 flex items-center gap-xs">
          <MessagesSquare className="h-5 w-5 text-emerald-400" />
          <h1 className="text-xl font-bold text-white">Диалог</h1>
        </div>

        {detail && (
          <p className="mt-1 text-xs text-muted-foreground">
            {detail.conversation.name} · {detail.conversation.email} · начат{' '}
            {formatDateTime(detail.conversation.createdAt)}
          </p>
        )}

        {error ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Не удалось загрузить данные
          </p>
        ) : loading || !detail ? (
          <div className="mt-5 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-panel bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="mt-5 flex flex-col gap-3">
            {detail.items.map((m) =>
              m.role === 'user' ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] rounded-panel border border-blue-500/20 bg-blue-500/10 px-4 py-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-blue-300/80">
                      <User className="h-3 w-3" />
                      Пользователь · {formatDateTime(m.createdAt)}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-white">{m.content}</p>
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex justify-start">
                  <div className="max-w-[85%] rounded-panel border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] text-emerald-300/80">
                      <Bot className="h-3 w-3" />
                      Поддержка · {formatDateTime(m.createdAt)}
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-white">{m.content}</p>
                  </div>
                </div>
              ),
            )}
            {detail.items.length === 0 && (
              <p className="rounded-panel border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
                Сообщений нет
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
