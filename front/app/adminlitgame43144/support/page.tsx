'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  MessagesSquare,
  Loader2,
  Pin,
  User,
  Bot,
  Send,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { Pagination } from '@/components/admin/Pagination';
import {
  adminApi,
  type AdminSupportConversation,
  type AdminSupportConversationsResponse,
  type AdminSupportConversationDetailResponse,
  type AdminSupportMessageItem,
} from '@/lib/api';
import { showError } from '@/lib/toast';

const LIMIT = 50;
const POLL_MS = 5000;
const PIN_KEY = 'admin_support_pinned';

function loadPinnedIds(): string[] {
  try {
    const raw = localStorage.getItem(PIN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((x): x is string => typeof x === 'string')
      : [];
  } catch {
    return [];
  }
}

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

function ConversationRow({
  c,
  pinned,
  onOpen,
  onTogglePin,
}: {
  c: AdminSupportConversation;
  pinned: boolean;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
}) {
  return (
    <tr
      onClick={() => onOpen(c.id)}
      className={`cursor-pointer border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.02] ${
        pinned ? 'bg-amber-500/[0.06]' : ''
      }`}
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            title={pinned ? 'Открепить чат' : 'Закрепить чат'}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(c.id);
            }}
            className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded transition-colors ${
              pinned
                ? 'text-amber-400 hover:bg-amber-500/10'
                : 'text-muted-foreground/50 hover:bg-white/5 hover:text-white/80'
            }`}
          >
            <Pin className="h-3.5 w-3.5" />
          </button>
          <div>
            <div className="text-white">{c.name}</div>
            <div className="text-xs text-muted-foreground">{c.email}</div>
          </div>
        </div>
      </td>
      <td className="px-4 py-3 text-white">{c.messageCount}</td>
      <td className="max-w-[24rem] px-4 py-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {c.lastMessage?.role === 'user' ? (
            <User className="h-3.5 w-3.5 shrink-0" />
          ) : c.lastMessage?.role === 'operator' ? (
            <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-amber-400" />
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
  );
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
  const [pinnedIds, setPinnedIds] = useState<string[]>(loadPinnedIds);
  const [pinnedExtra, setPinnedExtra] = useState<Record<string, AdminSupportConversation>>({});

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

  useEffect(() => {
    try {
      localStorage.setItem(PIN_KEY, JSON.stringify(pinnedIds));
    } catch {
      // ignore
    }
  }, [pinnedIds]);

  useEffect(() => {
    const missing = pinnedIds.filter((id) => !data?.items.some((c) => c.id === id));
    if (missing.length === 0) {
      setPinnedExtra({});
      return;
    }
    let cancelled = false;
    void (async () => {
      const entries = await Promise.all(
        missing.map(async (id) => {
          try {
            const d = await adminApi.supportConversation(token, id);
            const last = d.items[d.items.length - 1] ?? null;
            const row: AdminSupportConversation = {
              id: d.conversation.id,
              userId: d.conversation.userId,
              name: d.conversation.name,
              email: d.conversation.email,
              createdAt: d.conversation.createdAt,
              updatedAt: d.conversation.updatedAt,
              messageCount: d.items.length,
              lastMessage: last
                ? { role: last.role, content: last.content, createdAt: last.createdAt }
                : null,
            };
            return { id, row } as const;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const rec: Record<string, AdminSupportConversation> = {};
      for (const e of entries) {
        if (e) rec[e.id] = e.row;
      }
      setPinnedExtra(rec);
    })();
    return () => {
      cancelled = true;
    };
  }, [token, data, pinnedIds]);

  const pinnedRows = useMemo(() => {
    const byId = new Map((data?.items ?? []).map((c) => [c.id, c]));
    return pinnedIds
      .map((id) => byId.get(id) ?? pinnedExtra[id])
      .filter((c): c is AdminSupportConversation => Boolean(c))
      .sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
  }, [data, pinnedIds, pinnedExtra]);

  const togglePin = (id: string) => {
    setPinnedIds((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id],
    );
  };

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

            {pinnedRows.length > 0 && (
              <div className="mt-4 overflow-hidden rounded-panel border border-amber-500/25">
                <div className="flex items-center gap-1.5 border-b border-amber-500/20 bg-amber-500/[0.06] px-4 py-2.5 text-xs font-semibold uppercase tracking-wide text-amber-300/90">
                  <Pin className="h-3.5 w-3.5" />
                  Закреплённые
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <tbody>
                      {pinnedRows.map((c) => (
                        <ConversationRow
                          key={c.id}
                          c={c}
                          pinned
                          onOpen={(id) => setOpenId(id)}
                          onTogglePin={togglePin}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

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
                    {data.items
                      .filter((c) => !pinnedIds.includes(c.id))
                      .map((c) => (
                        <ConversationRow
                          key={c.id}
                          c={c}
                          pinned={false}
                          onOpen={(id) => setOpenId(id)}
                          onTogglePin={togglePin}
                        />
                      ))}
                    {data.items.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          {pinnedRows.length > 0 ? 'Других обращений нет' : 'Обращений пока нет'}
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
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  // Locally-added operator replies that may not be in the server snapshot yet.
  // They are merged back into the poll result and pruned once persisted.
  const optimisticRef = useRef<AdminSupportMessageItem[]>([]);

  const load = useCallback(
    async (showLoading: boolean) => {
      if (showLoading) setLoading(true);
      setError(null);
      try {
        const d = await adminApi.supportConversation(token, conversationId);
        const serverKeys = new Set(d.items.map((m) => m.messageId || m.id));
        const kept = optimisticRef.current.filter(
          (m) => !serverKeys.has(m.messageId || m.id),
        );
        optimisticRef.current = kept;
        setDetail({ ...d, items: [...d.items, ...kept] });
      } catch (e) {
        const message = (e as Error).message;
        if (showLoading) {
          showError(message);
          setError(message);
        }
      } finally {
        if (showLoading) setLoading(false);
      }
    },
    [token, conversationId],
  );

  useEffect(() => {
    void load(true);
  }, [load]);

  useEffect(() => {
    const timer = setInterval(() => {
      void load(false);
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [load]);

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await adminApi.sendSupportMessage(token, conversationId, text);
      setReply('');
      optimisticRef.current = [...optimisticRef.current, res.message];
      setDetail((d) => (d ? { ...d, items: [...d.items, res.message] } : d));
    } catch (e) {
      showError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

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
          <>
            <div className="mt-5 flex flex-col gap-3">
              {detail.items.map((m) => {
                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] rounded-panel border border-blue-500/20 bg-blue-500/10 px-4 py-3">
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-blue-300/80">
                          <User className="h-3 w-3" />
                          Пользователь · {formatDateTime(m.createdAt)}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-white">{m.content}</p>
                      </div>
                    </div>
                  );
                }
                if (m.role === 'operator') {
                  return (
                    <div key={m.id} className="flex justify-start">
                      <div className="max-w-[85%] rounded-panel border border-amber-500/25 bg-amber-500/10 px-4 py-3">
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-amber-300/90">
                          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
                          Оператор · {formatDateTime(m.createdAt)}
                        </div>
                        <p className="whitespace-pre-wrap text-sm text-white">{m.content}</p>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={m.id} className="flex justify-start">
                    <div className="max-w-[85%] rounded-panel border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-emerald-300/80">
                        <Bot className="h-3 w-3" />
                        ИИ-поддержка · {formatDateTime(m.createdAt)}
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-white">{m.content}</p>
                    </div>
                  </div>
                );
              })}
              {detail.items.length === 0 && (
                <p className="rounded-panel border border-white/10 bg-white/[0.02] p-6 text-center text-sm text-muted-foreground">
                  Сообщений нет
                </p>
              )}
            </div>

            <div className="mt-6 rounded-panel border border-white/10 bg-white/[0.02] p-4">
              <label className="text-xs font-semibold text-muted-foreground">
                Ответить пользователю (оператор)
              </label>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void sendReply();
                  }
                }}
                rows={3}
                placeholder="Напишите ответ от имени оператора…"
                className="mt-2 w-full resize-none rounded-control border border-white/10 bg-background px-3 py-2 text-sm text-white outline-none placeholder:text-muted-foreground/60 focus:border-amber-500/50"
              />
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  Ответ придёт пользователю в чат в реальном времени
                </p>
                <button
                  type="button"
                  onClick={() => void sendReply()}
                  disabled={!reply.trim() || sending}
                  className="inline-flex h-9 items-center gap-1.5 rounded-control bg-gradient-to-r from-amber-500 to-orange-600 px-4 text-xs font-medium text-white transition-colors hover:from-amber-600 hover:to-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {sending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Отправить
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
