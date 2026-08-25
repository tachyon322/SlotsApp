'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Copy, ExternalLink, Image as ImageIcon, Loader2, Search, Trash2, X, FileText } from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { adminApi, type AdminS3Item } from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';
import { ModalShell } from '@/components/ModalShell';

const LIMIT = 50;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function isImageKey(key: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(key);
}

export default function AdminReceiptsPage() {
  return (
    <AdminShell>{({ token }) => <ReceiptsList token={token} />}</AdminShell>
  );
}

function ReceiptsList({ token }: { token: string }) {
  const [items, setItems] = useState<AdminS3Item[]>([]);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [tokenStack, setTokenStack] = useState<(string | undefined)[]>([undefined]);
  const [stackIndex, setStackIndex] = useState(0);
  const [prefix, setPrefix] = useState<string>('receipts/');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (t: string, pref: string, cont: string | undefined, query: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.s3List(t, {
          prefix: pref,
          limit: LIMIT,
          continuationToken: cont,
          q: query || undefined,
        });
        setItems(res.items);
        setNextToken(res.nextToken);
      } catch (e) {
        const msg = (e as Error).message;
        showError(msg);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    setTokenStack([undefined]);
    setStackIndex(0);
    void load(token, prefix, undefined, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, prefix, search]);

  const handleNext = () => {
    if (!nextToken) return;
    const newStack = tokenStack.slice(0, stackIndex + 1);
    newStack.push(nextToken);
    setTokenStack(newStack);
    setStackIndex(newStack.length - 1);
    void load(token, prefix, nextToken, search);
  };

  const handlePrev = () => {
    if (stackIndex === 0) return;
    const newIdx = stackIndex - 1;
    setStackIndex(newIdx);
    void load(token, prefix, tokenStack[newIdx], search);
  };

  const handleCopy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      showSuccess('Ссылка скопирована');
    } catch {
      showError('Не удалось скопировать');
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm(`Удалить ${key}?`)) return;
    try {
      await adminApi.s3Delete(token, key);
      showSuccess('Удалено');
      setItems((prev) => prev.filter((it) => it.key !== key));
    } catch (e) {
      showError((e as Error).message);
    }
  };

  const openPreview = (key: string, url: string) => {
    setPreviewKey(key);
    setPreviewUrl(url);
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
          <ImageIcon className="h-5 w-5 text-sky-400" />
          <h1 className="text-xl font-bold text-white">Чеки S3</h1>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Просмотр изображений из S3 (s3.spb.sprinthost.ru / s3-961728) — без панели провайдера. Префикс
          receipts/ — чеки пользователей, test/ — тестовые загрузки.
        </p>

        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          <select
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="rounded-button border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="receipts/" className="bg-zinc-900">
              receipts/ — чеки
            </option>
            <option value="test/" className="bg-zinc-900">
              test/ — тесты
            </option>
            <option value="" className="bg-zinc-900">
              Все (без префикса)
            </option>
          </select>

          <div className="flex flex-1 items-center gap-3 rounded-button border border-white/15 bg-white/5 px-4 py-2.5 focus-within:border-blue-500">
            <Search className="h-4 w-4 shrink-0 text-white/40" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по ключу (часть имени)…"
              className="w-full bg-transparent text-sm font-semibold text-white placeholder:text-white/30 focus:outline-none"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="text-xs font-semibold text-white/40 hover:text-white"
              >
                Сбросить
              </button>
            )}
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-xs text-red-400">{error}</p>
        ) : !items && loading ? (
          <div className="mt-5 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-panel bg-white/5" />
            ))}
          </div>
        ) : (
          <>
            <p className="mt-3 text-xs text-muted-foreground">
              Найдено: {items.length} · {nextToken ? 'есть ещё' : 'конец списка'}
              {stackIndex > 0 && ` · страница ${stackIndex + 1}`}
            </p>

            <div className="mt-4 overflow-hidden rounded-panel border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                      <th className="px-4 py-3">Превью</th>
                      <th className="px-4 py-3">Ключ</th>
                      <th className="px-4 py-3">Размер</th>
                      <th className="px-4 py-3">Дата</th>
                      <th className="px-4 py-3">Ссылка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr
                        key={it.key}
                        className="border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.02]"
                      >
                        <td className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => openPreview(it.key, it.publicUrl)}
                            className="block w-16 h-16 rounded-panel overflow-hidden border border-white/10 bg-white/[0.02] hover:border-white/20 flex items-center justify-center"
                          >
                            {isImageKey(it.key) ? (
                              <img
                                src={it.publicUrl}
                                alt={it.key}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <FileText className="w-6 h-6 text-zinc-400" />
                            )}
                          </button>
                        </td>
                        <td className="px-4 py-3 max-w-[280px]">
                          <div className="truncate font-mono text-xs text-white" title={it.key}>
                            {it.key}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{it.key.split('/').pop()}</div>
                        </td>
                        <td className="px-4 py-3 text-white/80 whitespace-nowrap">{formatSize(it.size)}</td>
                        <td className="px-4 py-3 text-muted-foreground whitespace-nowrap text-xs">
                          {formatDate(it.lastModified)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <a
                              href={it.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 max-w-[180px] truncate"
                              title={it.publicUrl}
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              Открыть
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCopy(it.publicUrl)}
                              className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-2 py-1 text-xs font-semibold text-white/70 hover:bg-white/5"
                            >
                              <Copy className="h-3 w-3" />
                              Копировать
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(it.key)}
                              className="inline-flex items-center gap-1 rounded-button border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20"
                              title="Удалить"
                            >
                              <Trash2 className="h-3 w-3" />
                              Удалить
                            </button>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground truncate max-w-[220px]" title={it.publicUrl}>
                            {it.publicUrl}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Файлов не найдено
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrev}
                disabled={stackIndex === 0 || loading}
                className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 disabled:opacity-30"
              >
                Назад
              </button>
              <button
                type="button"
                onClick={handleNext}
                disabled={!nextToken || loading}
                className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 disabled:opacity-30"
              >
                Далее
                {loading && <Loader2 className="h-3 w-3 animate-spin" />}
              </button>
              {loading && <span className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Загрузка…</span>}
            </div>
          </>
        )}
      </div>

      <ModalShell open={!!previewUrl} onClose={() => { setPreviewUrl(null); setPreviewKey(null); }} titleId="s3-preview-title" maxWidthClass="max-w-2xl">
        {previewUrl && (
          <div className="space-y-3">
            <h2 id="s3-preview-title" className="text-sm font-bold text-white font-mono break-all">
              {previewKey}
            </h2>
            <div className="rounded-panel overflow-hidden border border-white/10 bg-black/20 p-4 flex flex-col items-center justify-center">
              {previewKey && isImageKey(previewKey) ? (
                <img src={previewUrl} alt={previewKey ?? ''} className="w-full h-auto max-h-[70vh] object-contain" />
              ) : (
                <div className="flex flex-col items-center gap-2 py-8">
                  <FileText className="w-12 h-12 text-zinc-400" />
                  <span className="text-xs text-zinc-500">{previewKey?.split('/').pop()}</span>
                  <a href={previewUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 underline">
                    Открыть документ
                  </a>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <a
                href={previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-button bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Открыть в новой вкладке
              </a>
              <button
                type="button"
                onClick={() => previewUrl && handleCopy(previewUrl)}
                className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5"
              >
                <Copy className="h-3.5 w-3.5" />
                Копировать ссылку
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (previewKey) {
                    await handleDelete(previewKey);
                    setPreviewUrl(null);
                    setPreviewKey(null);
                  }
                }}
                className="inline-flex items-center gap-1 rounded-button border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </button>
              <button
                type="button"
                onClick={() => { setPreviewUrl(null); setPreviewKey(null); }}
                className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 ml-auto"
              >
                <X className="h-3.5 w-3.5" />
                Закрыть
              </button>
            </div>
            <p className="text-xs font-mono text-muted-foreground break-all">{previewUrl}</p>
          </div>
        )}
      </ModalShell>
    </main>
  );
}
