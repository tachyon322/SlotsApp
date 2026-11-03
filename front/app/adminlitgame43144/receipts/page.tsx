'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Loader2,
  Search,
  Trash2,
  X,
  FileText,
  RefreshCw,
  ArrowUpDown,
  User,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { adminApi, type AdminPaymentProviderCheck, type AdminS3Item } from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';
import { ModalShell } from '@/components/ModalShell';

const LIMIT = 50;

const PURPOSE_LABELS: Record<string, string> = {
  deposit: 'Пополнение баланса',
  verification: 'Верификация',
  premium: 'Премиум',
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function formatAmount(value: number): string {
  return value.toLocaleString('ru-RU');
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function isImageKey(key: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(key);
}

function statusTone(status: string | null | undefined): string {
  switch (status) {
    case 'PAID':
      return 'bg-emerald-500/20 text-emerald-300';
    case 'PENDING':
    case 'NEW':
    case 'CONFIRMED_BY_USER':
    case 'AWAITING_RECEIPT':
      return 'bg-amber-500/20 text-amber-300';
    case 'FAILED':
    case 'CANCELED':
    case 'EXPIRED':
      return 'bg-red-500/20 text-red-300';
    default:
      return 'bg-white/10 text-white/70';
  }
}

function ProviderCheckResult({ check }: { check: AdminPaymentProviderCheck }) {
  if (check.available && check.provider) {
    return (
      <div className="space-y-0.5">
        <span
          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusTone(check.provider.status)}`}
        >
          {check.provider.status}
        </span>
        <div className="whitespace-nowrap text-[10px] text-muted-foreground">
          оплачено {formatAmount(check.provider.paidAmount)} из {formatAmount(check.provider.amount)}{' '}
          {check.provider.currency.toUpperCase()}
        </div>
      </div>
    );
  }
  return <div className="text-[10px] text-red-400">{check.error ?? 'Не удалось проверить'}</div>;
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="whitespace-nowrap text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

function MonoCopy({
  value,
  onCopy,
  message,
}: {
  value: string | null | undefined;
  onCopy: (value: string, message?: string) => void;
  message: string;
}) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="flex items-center gap-1">
      <span className="truncate font-mono text-[11px] text-sky-300" title={value}>
        {value}
      </span>
      <button
        type="button"
        onClick={() => onCopy(value, message)}
        className="shrink-0 rounded border border-white/10 bg-white/[0.02] p-1 text-white/50 hover:bg-white/10 hover:text-white cursor-pointer"
        title="Скопировать"
      >
        <Copy className="h-3 w-3" />
      </button>
    </span>
  );
}

export default function AdminReceiptsPage() {
  return (
    <AdminShell>{({ token }) => <ReceiptsList token={token} />}</AdminShell>
  );
}

function ReceiptsList({ token }: { token: string }) {
  const [items, setItems] = useState<AdminS3Item[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [nextToken, setNextToken] = useState<string | null>(null);
  const [tokenStack, setTokenStack] = useState<(string | undefined)[]>([undefined]);
  const [stackIndex, setStackIndex] = useState(0);
  const [prefix, setPrefix] = useState<string>('receipts/');
  const [sort, setSort] = useState<'desc' | 'asc'>('desc');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewItem, setPreviewItem] = useState<AdminS3Item | null>(null);
  const [providerChecks, setProviderChecks] = useState<Record<string, AdminPaymentProviderCheck>>({});
  const [checkingId, setCheckingId] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setSearch(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(
    async (
      t: string,
      pref: string,
      cont: string | undefined,
      query: string,
      sortOrder: 'desc' | 'asc',
      force = false,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const res = await adminApi.s3List(t, {
          prefix: pref,
          limit: LIMIT,
          continuationToken: cont,
          q: query || undefined,
          sort: sortOrder,
          refresh: force,
        });
        setItems(res.items);
        setNextToken(res.nextToken);
        setTotal(res.total ?? res.items.length);
      } catch (e) {
        const msg = (e as Error).message;
        showError(msg);
        setError(msg);
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [],
  );

  useEffect(() => {
    setTokenStack([undefined]);
    setStackIndex(0);
    void load(token, prefix, undefined, search, sort);
  }, [token, prefix, search, sort, load]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    const currentToken = tokenStack[stackIndex];
    void load(token, prefix, currentToken, search, sort, true);
  };

  const handleNext = () => {
    if (!nextToken) return;
    const newStack = tokenStack.slice(0, stackIndex + 1);
    newStack.push(nextToken);
    setTokenStack(newStack);
    setStackIndex(newStack.length - 1);
    void load(token, prefix, nextToken, search, sort);
  };

  const handlePrev = () => {
    if (stackIndex === 0) return;
    const newIdx = stackIndex - 1;
    setStackIndex(newIdx);
    void load(token, prefix, tokenStack[newIdx], search, sort);
  };

  const handleCopy = async (value: string, message = 'Ссылка скопирована') => {
    try {
      await navigator.clipboard.writeText(value);
      showSuccess(message);
    } catch {
      showError('Не удалось скопировать');
    }
  };

  const checkProvider = useCallback(
    async (localPaymentId: string) => {
      setCheckingId(localPaymentId);
      try {
        const res = await adminApi.checkPaymentProvider(token, localPaymentId);
        setProviderChecks((prev) => ({ ...prev, [localPaymentId]: res }));
      } catch (e) {
        showError((e as Error).message);
      } finally {
        setCheckingId(null);
      }
    },
    [token],
  );

  const handleDelete = async (key: string) => {
    if (!confirm(`Удалить ${key}?`)) return;
    try {
      await adminApi.s3Delete(token, key);
      showSuccess('Удалено');
      setItems((prev) => prev.filter((it) => it.key !== key));
      setTotal((prev) => Math.max(0, prev - 1));
    } catch (e) {
      showError((e as Error).message);
    }
  };

  const openPreview = (item: AdminS3Item) => {
    setPreviewItem(item);
  };

  const from = total === 0 ? 0 : stackIndex * LIMIT + 1;
  const to = Math.min((stackIndex + 1) * LIMIT, total);

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

        <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <div className="flex items-center gap-xs">
              <ImageIcon className="h-5 w-5 text-sky-400" />
              <h1 className="text-xl font-bold text-white">Чеки оплат и депозитов</h1>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              Чеки пользователей при пополнении баланса и депозитах. По умолчанию сначала отображаются самые новые чеки.
            </p>
          </div>

          <button
            type="button"
            onClick={handleRefresh}
            disabled={loading || isRefreshing}
            className="inline-flex items-center gap-1.5 rounded-button border border-white/10 bg-white/[0.03] px-3 py-2 text-xs font-semibold text-white/80 hover:bg-white/10 disabled:opacity-40 self-start sm:self-auto cursor-pointer"
            title="Обновить список с S3"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading || isRefreshing ? 'animate-spin text-sky-400' : ''}`} />
            Обновить
          </button>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row gap-3">
          {/* Prefix selector */}
          <select
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="rounded-button border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white focus:border-blue-500 focus:outline-none"
          >
            <option value="receipts/" className="bg-zinc-900">
              receipts/ — чеки пользователей
            </option>
            <option value="test/" className="bg-zinc-900">
              test/ — тесты
            </option>
            <option value="support/" className="bg-zinc-900">
              support/ — скриншоты из поддержки
            </option>
            <option value="" className="bg-zinc-900">
              Все (без префикса)
            </option>
          </select>

          {/* Sort selector */}
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as 'desc' | 'asc')}
              className="w-full sm:w-auto rounded-button border border-white/15 bg-white/5 px-3 py-2.5 text-sm font-semibold text-white focus:border-blue-500 focus:outline-none pr-8 cursor-pointer"
            >
              <option value="desc" className="bg-zinc-900">
                Сначала новые (по умолчанию)
              </option>
              <option value="asc" className="bg-zinc-900">
                Сначала старые
              </option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-2.5 top-3 h-4 w-4 text-white/40" />
          </div>

          {/* Search */}
          <div className="flex flex-1 items-center gap-3 rounded-button border border-white/15 bg-white/5 px-4 py-2.5 focus-within:border-blue-500">
            <Search className="h-4 w-4 shrink-0 text-white/40" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по ключу, имени, почте, ID…"
              className="w-full bg-transparent text-sm font-semibold text-white placeholder:text-white/30 focus:outline-none"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ('')}
                className="text-xs font-semibold text-white/40 hover:text-white cursor-pointer"
              >
                Сбросить
              </button>
            )}
          </div>
        </div>

        {error ? (
          <p className="mt-4 text-xs text-red-400">{error}</p>
        ) : items.length === 0 && loading ? (
          <div className="mt-5 space-y-2">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-panel bg-white/5" />
            ))}
          </div>
        ) : (
          <>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>
                {total > 0
                  ? `Показано ${from}–${to} из ${total.toLocaleString('ru-RU')} чеков`
                  : `Найдено: ${items.length}`}
                {sort === 'desc' ? ' (новые первые)' : ' (старые первые)'}
              </span>
              <span>{stackIndex > 0 ? `Страница ${stackIndex + 1}` : 'Первая страница'}</span>
            </div>

            <div className="mt-3 overflow-hidden rounded-panel border border-white/10">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 bg-white/[0.02] text-xs font-semibold text-muted-foreground">
                      <th className="px-4 py-3">Превью</th>
                      <th className="px-4 py-3">Пользователь / Платёж</th>
                      <th className="px-4 py-3">ID платёжки</th>
                      <th className="px-4 py-3">Ключ</th>
                      <th className="px-4 py-3">Размер</th>
                      <th className="px-4 py-3">Дата загрузки</th>
                      <th className="px-4 py-3">Ссылка / Действия</th>
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
                            onClick={() => openPreview(it)}
                            className="block w-16 h-16 rounded-panel overflow-hidden border border-white/10 bg-white/[0.02] hover:border-white/20 flex items-center justify-center cursor-pointer transition-transform hover:scale-105"
                            title="Открыть предпросмотр"
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
                        <td className="px-4 py-3 max-w-[240px]">
                          {it.userName || it.userEmail ? (
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-1 text-xs font-semibold text-white truncate">
                                <User className="h-3 w-3 text-blue-400 shrink-0" />
                                {it.userName || it.userEmail}
                              </div>
                              {it.userEmail && it.userName && (
                                <div className="text-[11px] text-muted-foreground truncate">{it.userEmail}</div>
                              )}
                              {it.paymentAmount ? (
                                <div className="text-xs font-semibold text-emerald-400">
                                  +{it.paymentAmount.toLocaleString('ru-RU')} ₽
                                  {it.paymentStatus && (
                                    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
                                      {it.paymentStatus}
                                    </span>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          ) : it.userId ? (
                            <div className="space-y-0.5">
                              <div className="text-xs font-mono text-white/80 truncate" title={it.userId}>
                                User: {it.userId.slice(0, 10)}…
                              </div>
                              {it.paymentId && (
                                <div className="text-[11px] font-mono text-muted-foreground truncate" title={it.paymentId}>
                                  Pay: {it.paymentId.slice(0, 10)}…
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[220px] align-top">
                          {it.paymentProviderId && it.paymentId ? (
                            <div className="space-y-1">
                              <MonoCopy
                                value={it.paymentProviderId}
                                onCopy={handleCopy}
                                message="ID платёжки скопирован"
                              />

                              <button
                                type="button"
                                onClick={() => void checkProvider(it.paymentId as string)}
                                disabled={checkingId === it.paymentId}
                                className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-2 py-1 text-[11px] font-semibold text-white/70 hover:bg-white/5 disabled:opacity-40 cursor-pointer"
                                title="Запросить актуальный статус в платёжке"
                              >
                                {checkingId === it.paymentId ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Search className="h-3 w-3" />
                                )}
                                Проверить
                              </button>

                              {providerChecks[it.paymentId] && (
                                <ProviderCheckResult check={providerChecks[it.paymentId]} />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground" title="ID платежа в платёжке отсутствует">
                              —
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <div className="truncate font-mono text-xs text-white" title={it.key}>
                            {it.key}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">{it.key.split('/').pop()}</div>
                        </td>
                        <td className="px-4 py-3 text-white/80 whitespace-nowrap text-xs">{formatSize(it.size)}</td>
                        <td className="px-4 py-3 text-white/90 whitespace-nowrap text-xs font-medium">
                          {formatDate(it.lastModified)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5">
                            <a
                              href={it.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-400 hover:text-blue-300 max-w-[140px] truncate"
                              title={it.publicUrl}
                            >
                              <ExternalLink className="h-3 w-3 shrink-0" />
                              Открыть
                            </a>
                            <button
                              type="button"
                              onClick={() => handleCopy(it.publicUrl)}
                              className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-2 py-1 text-xs font-semibold text-white/70 hover:bg-white/5 cursor-pointer"
                            >
                              <Copy className="h-3 w-3" />
                              Копировать
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(it.key)}
                              className="inline-flex items-center gap-1 rounded-button border border-red-500/20 bg-red-500/10 px-2 py-1 text-xs font-semibold text-red-400 hover:bg-red-500/20 cursor-pointer"
                              title="Удалить"
                            >
                              <Trash2 className="h-3 w-3" />
                              Удалить
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-4 py-8 text-center text-sm text-muted-foreground">
                          Чеков не найдено
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handlePrev}
                  disabled={stackIndex === 0 || loading}
                  className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Назад
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={!nextToken || loading}
                  className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  Далее
                  {loading && <Loader2 className="h-3 w-3 animate-spin" />}
                </button>
                {loading && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Загрузка…
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                Показано {from}–{to} из {total.toLocaleString('ru-RU')}
              </span>
            </div>
          </>
        )}
      </div>

      <ModalShell
        open={!!previewItem}
        onClose={() => setPreviewItem(null)}
        titleId="s3-preview-title"
        maxWidthClass="max-w-2xl"
      >
        {previewItem && (
          <div className="space-y-3">
            <h2 id="s3-preview-title" className="text-sm font-bold text-white font-mono break-all">
              {previewItem.key}
            </h2>

            <div className="space-y-2 rounded-panel border border-white/10 bg-white/[0.02] p-3">
              <div className="text-[11px] font-semibold text-white/70">Данные платежа</div>
              <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[11px]">
                <InfoRow label="Пользователь">
                  <span className="text-white/90">
                    {previewItem.userName ?? '—'}
                    {previewItem.userEmail && previewItem.userName && (
                      <span className="text-muted-foreground"> · {previewItem.userEmail}</span>
                    )}
                  </span>
                </InfoRow>
                <InfoRow label="ID платежа (локальный)">
                  <MonoCopy
                    value={previewItem.paymentId}
                    onCopy={handleCopy}
                    message="ID платежа скопирован"
                  />
                </InfoRow>
                <InfoRow label="ID в платёжке">
                  <MonoCopy
                    value={previewItem.paymentProviderId}
                    onCopy={handleCopy}
                    message="ID платёжки скопирован"
                  />
                </InfoRow>
                <InfoRow label="Сумма">
                  <span className="text-white/90">
                    {previewItem.paymentAmount != null
                      ? `${formatAmount(previewItem.paymentAmount)} ₽`
                      : '—'}
                    {previewItem.paymentCurrency && previewItem.paymentCurrency !== 'rub'
                      ? ` (${previewItem.paymentCurrency.toUpperCase()})`
                      : ''}
                    {previewItem.paymentMethod ? ` · ${previewItem.paymentMethod}` : ''}
                  </span>
                </InfoRow>
                <InfoRow label="Назначение">
                  <span className="text-white/90">
                    {previewItem.paymentPurpose
                      ? PURPOSE_LABELS[previewItem.paymentPurpose] ?? previewItem.paymentPurpose
                      : '—'}
                  </span>
                </InfoRow>
                <InfoRow label="Статус (локальный)">
                  {previewItem.paymentStatus ? (
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusTone(previewItem.paymentStatus)}`}
                    >
                      {previewItem.paymentStatus}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </InfoRow>
              </dl>

              {previewItem.paymentProviderId && previewItem.paymentId && (
                <div className="flex flex-wrap items-center gap-2 border-t border-white/10 pt-2">
                  <button
                    type="button"
                    onClick={() => void checkProvider(previewItem.paymentId as string)}
                    disabled={checkingId === previewItem.paymentId}
                    className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px] font-semibold text-white/80 hover:bg-white/5 disabled:opacity-40 cursor-pointer"
                  >
                    {checkingId === previewItem.paymentId ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Search className="h-3 w-3" />
                    )}
                    Проверить в платёжке
                  </button>
                  {providerChecks[previewItem.paymentId] && (
                    <ProviderCheckResult check={providerChecks[previewItem.paymentId]} />
                  )}
                </div>
              )}
            </div>

            <div className="rounded-panel overflow-hidden border border-white/10 bg-black/20 p-4 flex flex-col items-center justify-center">
              {isImageKey(previewItem.key) ? (
                <img
                  src={previewItem.publicUrl}
                  alt={previewItem.key}
                  className="w-full h-auto max-h-[70vh] object-contain"
                />
              ) : (
                <div className="flex flex-col items-center gap-2 py-8">
                  <FileText className="w-12 h-12 text-zinc-400" />
                  <span className="text-xs text-zinc-500">{previewItem.key.split('/').pop()}</span>
                  <a href={previewItem.publicUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-400 underline">
                    Открыть документ
                  </a>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <a
                href={previewItem.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 rounded-button bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-600"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Открыть в новой вкладке
              </a>
              <button
                type="button"
                onClick={() => handleCopy(previewItem.publicUrl)}
                className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                Копировать ссылку
              </button>
              <button
                type="button"
                onClick={async () => {
                  await handleDelete(previewItem.key);
                  setPreviewItem(null);
                }}
                className="inline-flex items-center gap-1 rounded-button border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/20 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Удалить
              </button>
              <button
                type="button"
                onClick={() => setPreviewItem(null)}
                className="inline-flex items-center gap-1 rounded-button border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/5 ml-auto cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
                Закрыть
              </button>
            </div>
            <p className="text-xs font-mono text-muted-foreground break-all">{previewItem.publicUrl}</p>
          </div>
        )}
      </ModalShell>
    </main>
  );
}
