'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Filter, Pencil, Plus, Search, Trash2, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { usePartnerAuth } from '@/components/partner/PartnerShell';
import HistoryPanel from '@/components/partner/HistoryPanel';
import { SourceModal } from '@/components/partner/SourceModal';
import {
  addDays,
  formatDate,
  formatDay,
  formatDayShort,
  formatPercent,
  formatRub,
  shortCode,
  toInputDate,
} from '@/components/partner/format';
import {
  ConfirmModal,
  DataTable,
  Field,
  Segmented,
  Tag,
  DateRange,
  type Column,
  btnGhost,
  btnIcon,
  btnPrimary,
  inputClass,
  selectClass,
} from '@/components/partner/ui';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import {
  partnerApi,
  buildAffiliateLink,
  type AffiliateDailyPoint,
  type AffiliateGroup,
  type AffiliateRedirect,
  type AffiliateSource,
  type AffiliateSourceItem,
  type AffiliateStatsResponse,
} from '@/lib/api';

type ChartMetric = 'income' | 'clicks' | 'signups' | 'all';
type SourceTypeFilter = 'all' | 'link' | 'promo';

const PAGE_SIZE = 20;

interface StatsClientProps {
  initialLoaded?: boolean;
  initialStats?: AffiliateStatsResponse | null;
  initialGroups?: AffiliateGroup[];
  initialRedirects?: AffiliateRedirect[];
  initialDomains?: string[];
  initialDefaultDomain?: string;
  initialItems?: AffiliateSourceItem[];
  initialTotal?: number;
}

export default function StatsClient({
  initialLoaded = false,
  initialStats = null,
  initialGroups = [],
  initialRedirects = [],
  initialDomains = [],
  initialDefaultDomain = '',
  initialItems = [],
  initialTotal = 0,
}: StatsClientProps) {
  const { token } = usePartnerAuth();
  const [stats, setStats] = useState<AffiliateStatsResponse | null>(initialStats);
  const [range, setRange] = useState<[string, string]>([toInputDate(addDays(new Date(), -29)), toInputDate(new Date())]);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('all');
  const [topMetric, setTopMetric] = useState<'income' | 'clicks' | 'signups'>('income');

  const [groups, setGroups] = useState<AffiliateGroup[]>(initialGroups);
  const [redirects, setRedirects] = useState<AffiliateRedirect[]>(initialRedirects);
  const [domains, setDomains] = useState<string[]>(initialDomains);
  const [defaultDomain, setDefaultDomain] = useState(initialDefaultDomain);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AffiliateSource | null>(null);

  const [items, setItems] = useState<AffiliateSourceItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [sourcesLoading, setSourcesLoading] = useState(!initialLoaded);
  const [sourcesPage, setSourcesPage] = useState(1);
  const [sourcesSearch, setSourcesSearch] = useState('');
  const [sourcesGroupId, setSourcesGroupId] = useState<string | undefined>();
  const [sourcesType, setSourcesType] = useState<SourceTypeFilter>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [deleting, setDeleting] = useState<AffiliateSourceItem | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

  const skipMeta = useRef(initialLoaded);
  const skipData = useRef(initialLoaded);
  const skipSources = useRef(initialLoaded);

  const loadMeta = useCallback(async () => {
    try {
      const [g, r, c] = await Promise.all([partnerApi.groups(token), partnerApi.redirects(token), partnerApi.config(token)]);
      setGroups(g.items);
      setRedirects(r.items);
      setDomains(c.domains);
      setDefaultDomain(c.defaultDomain ?? '');
    } catch {
      // non-fatal
    }
  }, [token]);

  useEffect(() => {
    if (skipMeta.current) {
      skipMeta.current = false;
      return;
    }
    void loadMeta();
  }, [loadMeta]);

  const load = useCallback(async () => {
    try {
      const data = await partnerApi.stats(token, range[0], range[1]);
      setStats(data);
    } catch (err) {
      showError((err as Error).message || 'Ошибка загрузки статистики');
    }
  }, [token, range]);

  useEffect(() => {
    if (skipData.current) {
      skipData.current = false;
      return;
    }
    void load();
  }, [load]);

  const loadSources = useCallback(async () => {
    setSourcesLoading(true);
    try {
      const data = await partnerApi.sources(token, {
        limit: PAGE_SIZE,
        offset: (sourcesPage - 1) * PAGE_SIZE,
        search: sourcesSearch || undefined,
        groupId: sourcesGroupId,
        type: sourcesType === 'all' ? undefined : sourcesType,
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      showError((err as Error).message || 'Ошибка загрузки источников');
    } finally {
      setSourcesLoading(false);
    }
  }, [token, sourcesPage, sourcesSearch, sourcesGroupId, sourcesType]);

  useEffect(() => {
    if (skipSources.current) {
      skipSources.current = false;
      return;
    }
    void loadSources();
  }, [loadSources]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess('Скопировано');
    } catch {
      showError('Не удалось скопировать');
    }
  }, []);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingLoading(true);
    try {
      await partnerApi.deleteSource(token, deleting.id);
      showSuccess('Источник удалён');
      setDeleting(null);
      void loadSources();
    } catch (err) {
      showError((err as Error).message || 'Ошибка удаления');
    } finally {
      setDeletingLoading(false);
    }
  };

  const summaryCards = useMemo(() => {
    const items: Array<{ label: string; value: number; accent: string; bg: string; sub: string }> = [];
    if (!stats) return items;
    const defs: Array<[keyof AffiliateStatsResponse['summary'], string, string, string]> = [
      ['today', 'Доход за сегодня', 'text-blue-400', 'bg-blue-500/15'],
      ['week', 'Доход за неделю', 'text-emerald-400', 'bg-emerald-500/15'],
      ['month', 'Доход за месяц', 'text-amber-400', 'bg-amber-500/15'],
      ['all', 'Доход за всё время', 'text-white/70', 'bg-white/5'],
    ];
    for (const [key, label, accent, bg] of defs) {
      const s = stats.summary[key];
      items.push({
        label,
        value: s.income,
        accent,
        bg,
        sub: `${s.signups} рег · ${s.clicks} перех`,
      });
    }
    return items;
  }, [stats]);

  const conversionCards = useMemo(() => {
    if (!stats) return [];
    const month = stats.summary.month;
    return [
      {
        label: 'Конверсия офферов (рег/клики)',
        value: month.cr === null ? '—' : `${month.cr}%`,
        sub: `${month.signups} рег из ${month.clicks} переходов`,
        accent: 'text-blue-400',
        bg: 'bg-blue-500/15',
      },
      {
        label: 'Доход с регистрации',
        value: month.signups > 0 ? formatRub(Math.floor(month.income / month.signups)) : '—',
        sub: `${formatRub(month.income)} / ${month.signups} рег`,
        accent: 'text-emerald-400',
        bg: 'bg-emerald-500/15',
      },
      {
        label: 'Платёжная конверсия (депозиты/рег)',
        value: month.crPayment === null ? '—' : `${month.crPayment}%`,
        sub: `${month.depositors} депозиторов из ${month.signups} рег`,
        accent: 'text-amber-400',
        bg: 'bg-amber-500/15',
      },
    ];
  }, [stats]);

  const chartData: AffiliateDailyPoint[] = stats?.daily ?? [];

  const topSources = useMemo(() => {
    const list = stats?.topSources ?? [];
    return [...list].sort((a, b) => b[topMetric] - a[topMetric]).slice(0, 10);
  }, [stats, topMetric]);

  const sourceColumns: Column<AffiliateSourceItem>[] = useMemo(
    () => [
      {
        key: 'createdAt',
        title: 'Дата создания',
        width: '170px',
        render: (s) => <span className="text-sm whitespace-nowrap text-muted-foreground">{formatDate(s.createdAt)}</span>,
      },
      {
        key: 'source',
        title: 'Ссылка/Промокод',
        width: '320px',
        render: (s) => {
          const text = s.type === 'link' ? buildAffiliateLink(s.code, s.domain, defaultDomain) : s.code;
          return (
            <button
              type="button"
              onClick={() => void handleCopy(text)}
              className="flex min-w-0 items-center gap-2 text-left"
              title={text}
            >
              <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-white">{s.name}</span>
                <span className="block max-w-[240px] truncate text-xs text-muted-foreground">{shortCode(text)}</span>
              </span>
              <Tag color={s.type === 'link' ? 'blue' : 'green'}>{s.type === 'link' ? 'ссылка' : 'промо'}</Tag>
            </button>
          );
        },
      },
      {
        key: 'clicks',
        title: 'Все переходы',
        align: 'right',
        width: '110px',
        render: (s) =>
          s.type === 'promo' ? <span className="text-muted-foreground">—</span> : s.clicks.toLocaleString('ru-RU'),
      },
      {
        key: 'uniqueClicks',
        title: 'Уник. переходы',
        align: 'right',
        width: '120px',
        render: (s) =>
          s.type === 'promo' ? <span className="text-muted-foreground">—</span> : s.uniqueClicks.toLocaleString('ru-RU'),
      },
      {
        key: 'signups',
        title: 'Регистрации',
        align: 'right',
        width: '110px',
        render: (s) =>
          s.type === 'promo' ? <span className="text-muted-foreground">—</span> : s.signups.toLocaleString('ru-RU'),
      },
      {
        key: 'income',
        title: 'Доход',
        align: 'right',
        width: '120px',
        render: (s) => (
          <span className={cn('font-semibold', s.income > 0 ? 'text-money' : 'text-white')}>{formatRub(s.income)}</span>
        ),
      },
      {
        key: 'depositsCount',
        title: 'Оплат',
        align: 'right',
        width: '90px',
        render: (s) => s.depositsCount.toLocaleString('ru-RU'),
      },
      {
        key: 'crPayment',
        title: 'CR в оплату',
        align: 'right',
        width: '110px',
        render: (s) =>
          s.type === 'promo' ? <span className="text-muted-foreground">—</span> : formatPercent(s.crPayment),
      },
      {
        key: 'groupName',
        title: 'Поток',
        width: '140px',
        render: (s) => <span className="text-muted-foreground">{s.groupName ?? '—'}</span>,
      },
      {
        key: 'actions',
        title: '',
        align: 'right',
        width: '80px',
        render: (s) => (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setEditing(s);
                setModalOpen(true);
              }}
              className={btnIcon}
              aria-label="Редактировать"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setDeleting(s)} className={cn(btnIcon, 'hover:text-red-400')} aria-label="Удалить">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      },
    ],
    [defaultDomain, handleCopy],
  );

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="min-w-0 flex-1 space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {summaryCards.map((c) => (
          <div key={c.label} className="rounded-card border border-white/10 bg-white/[0.02] p-4">
            <span className={cn('inline-block rounded-pill px-2.5 py-1 text-xs font-semibold', c.bg, c.accent)}>{c.label}</span>
            <div className="mt-4 text-2xl font-bold text-white">{formatRub(c.value)}</div>
            <div className="mt-1 text-xs text-muted-foreground">{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Conversion cards */}
      {conversionCards.length > 0 && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {conversionCards.map((c) => (
            <div key={c.label} className="flex items-center gap-3 rounded-card border border-white/10 bg-white/[0.02] p-4">
              <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-button', c.bg)}>
                <TrendingUp className={cn('h-5 w-5', c.accent)} />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">{c.label}</div>
                <div className="text-lg font-bold text-white">{c.value}</div>
                <div className="text-xs text-muted-foreground">{c.sub}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Chart + top sources */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <section className="rounded-card border border-white/10 bg-white/[0.02] lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
            <h3 className="text-base font-bold text-white">Статистика</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                value={chartMetric}
                options={[
                  { label: 'Все', value: 'all' },
                  { label: 'Доход', value: 'income' },
                  { label: 'Переходы', value: 'clicks' },
                  { label: 'Регистрации', value: 'signups' },
                ]}
                onChange={(v) => setChartMetric(v as ChartMetric)}
              />
              <DateRange allowClear={false} value={range} onChange={(v) => v && setRange(v)} />
            </div>
          </div>
          <div className="h-[380px] p-4">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">Активности пока нет</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                {chartMetric === 'all' ? (
                  <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(v: string) => formatDayShort(v)}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    />
                    <YAxis
                      yAxisId="left"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tickFormatter={(v: number) => Number(v).toLocaleString('ru-RU')}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickLine={false}
                      axisLine={false}
                      width={44}
                    />
                    <Tooltip
                      formatter={(value, name) =>
                        name === 'Доход' ? formatRub(Number(value) || 0) : (Number(value) || 0).toLocaleString('ru-RU')
                      }
                      labelFormatter={(label) => formatDay(String(label ?? ''))}
                      cursor={{ fill: 'rgba(59,140,255,0.08)' }}
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 12,
                        color: '#f8fafc',
                      }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Legend
                      verticalAlign="top"
                      height={24}
                      iconType="circle"
                      iconSize={8}
                      formatter={(value) => <span style={{ color: '#94a3b8', fontSize: 12 }}>{value}</span>}
                    />
                    <Line yAxisId="left" type="monotone" dataKey="income" stroke="#3b8cff" strokeWidth={2} dot={false} name="Доход" />
                    <Line yAxisId="right" type="monotone" dataKey="clicks" stroke="#f59e0b" strokeWidth={2} dot={false} name="Переходы" />
                    <Line yAxisId="right" type="monotone" dataKey="signups" stroke="#34d399" strokeWidth={2} dot={false} name="Регистрации" />
                  </ComposedChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: '#94a3b8' }}
                      tickFormatter={(v: string) => formatDayShort(v)}
                      tickLine={false}
                      axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                    />
                    <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} width={48} />
                    <Tooltip
                      formatter={(value) =>
                        chartMetric === 'income' ? formatRub(Number(value) || 0) : (Number(value) || 0).toLocaleString('ru-RU')
                      }
                      labelFormatter={(label) => formatDay(String(label ?? ''))}
                      cursor={{ fill: 'rgba(59,140,255,0.1)' }}
                      contentStyle={{
                        background: '#0f172a',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 12,
                        color: '#f8fafc',
                      }}
                      labelStyle={{ color: '#94a3b8' }}
                    />
                    <Bar
                      dataKey={chartMetric}
                      fill="#3b8cff"
                      radius={[4, 4, 0, 0]}
                      name={chartMetric === 'income' ? 'Доход' : chartMetric === 'clicks' ? 'Переходы' : 'Регистрации'}
                    />
                  </BarChart>
                )}
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="rounded-card border border-white/10 bg-white/[0.02]">
          <div className="flex items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
            <h3 className="text-base font-bold text-white">Топ источников</h3>
            <Segmented
              size="sm"
              value={topMetric}
              options={[
                { label: 'Доход', value: 'income' },
                { label: 'Перех.', value: 'clicks' },
                { label: 'Рег.', value: 'signups' },
              ]}
              onChange={(v) => setTopMetric(v as 'income' | 'clicks' | 'signups')}
            />
          </div>
          <div className="p-4">
            {topSources.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">Активности пока нет</div>
            ) : (
              <div className="space-y-3">
                {topSources.map((s, i) => (
                  <div key={s.id} className="flex items-center gap-2.5">
                    <span
                      className={cn(
                        'flex h-6 w-6 shrink-0 items-center justify-center rounded-button text-xs font-bold',
                        i === 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-blue-500/15 text-blue-400',
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm text-white/90">{s.name}</span>
                    <span className="text-sm font-semibold text-white">
                      {topMetric === 'income' ? formatRub(s.income) : (s[topMetric] as number).toLocaleString('ru-RU')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Sources */}
      <section className="rounded-card border border-white/10 bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-white">Источники трафика</h3>
            <button
              type="button"
              className={cn(btnPrimary, 'px-3 py-1.5 text-xs')}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              Создать
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
              <input
                className={cn(inputClass, 'w-60 pl-9')}
                placeholder="Ссылка, промокод или комментарий"
                value={sourcesSearch}
                onChange={(e) => {
                  setSourcesSearch(e.target.value);
                  setSourcesPage(1);
                }}
              />
            </div>
            <div className="relative">
              <button
                type="button"
                className={cn(btnGhost, filterOpen && 'border-blue-500/40 bg-blue-500/10 text-blue-400')}
                onClick={() => setFilterOpen((v) => !v)}
                aria-label="Фильтры источников"
                aria-expanded={filterOpen}
              >
                <Filter className="h-3.5 w-3.5" />
              </button>
              {filterOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFilterOpen(false)} />
                  <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-panel border border-white/10 bg-[#0f172a] p-3 shadow-xl">
                    <div className="space-y-3">
                      <Field label="Поток">
                        <select
                          className={selectClass}
                          value={sourcesGroupId ?? ''}
                          onChange={(e) => {
                            setSourcesGroupId(e.target.value || undefined);
                            setSourcesPage(1);
                          }}
                        >
                          <option value="">Все потоки</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label="Тип">
                        <Segmented
                          value={sourcesType}
                          options={[
                            { label: 'Все', value: 'all' },
                            { label: 'Ссылки', value: 'link' },
                            { label: 'Промо', value: 'promo' },
                          ]}
                          onChange={(v) => {
                            setSourcesType(v as SourceTypeFilter);
                            setSourcesPage(1);
                          }}
                          className="w-full [&>button]:flex-1"
                        />
                      </Field>
                      <button
                        type="button"
                        className={cn(btnGhost, 'w-full')}
                        onClick={() => {
                          setSourcesGroupId(undefined);
                          setSourcesType('all');
                          setSourcesPage(1);
                        }}
                      >
                        Сбросить
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
        <div className="p-4">
          <DataTable
            columns={sourceColumns}
            data={items}
            rowKey={(s) => s.id}
            loading={sourcesLoading}
            emptyText="Источников пока нет"
            page={sourcesPage}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setSourcesPage}
          />
        </div>
      </section>
      </div>

      <HistoryPanel
        className="w-full xl:w-[340px] xl:shrink-0 xl:sticky xl:top-20 xl:max-h-[calc(100dvh-96px)]"
        items={stats?.history ?? []}
      />

      <SourceModal
        open={modalOpen}
        token={token}
        initial={editing}
        groups={groups}
        redirects={redirects}
        domains={domains}
        defaultDomain={defaultDomain}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          void load();
          void loadSources();
        }}
      />

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Удалить источник?"
        description="Клики и регистрации источника будут удалены."
        loading={deletingLoading}
        onConfirm={() => void handleDelete()}
      />
    </div>
  );
}
