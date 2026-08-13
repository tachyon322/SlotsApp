'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Plus, Search, TrendingUp } from 'lucide-react';
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
import { SourceModal } from '@/components/partner/SourceModal';
import { addDays, formatDay, formatDayShort, formatRub, toInputDate } from '@/components/partner/format';
import {
  DataTable,
  Segmented,
  Tag,
  DateRange,
  type Column,
  btnGhost,
  btnPrimary,
  inputClass,
} from '@/components/partner/ui';
import { cn } from '@/lib/utils';
import { showError } from '@/lib/toast';
import {
  partnerApi,
  type AffiliateDailyPoint,
  type AffiliateGroup,
  type AffiliateHistoryItem,
  type AffiliateRedirect,
  type AffiliateSource,
  type AffiliateStatsResponse,
} from '@/lib/api';

type ChartMetric = 'income' | 'clicks' | 'signups' | 'all';
type HistoryFilter = 'all' | 'deposit' | 'registration' | 'click';

interface StatsClientProps {
  initialLoaded?: boolean;
  initialStats?: AffiliateStatsResponse | null;
  initialGroups?: AffiliateGroup[];
  initialRedirects?: AffiliateRedirect[];
  initialDomains?: string[];
  initialDefaultDomain?: string;
}

const KIND_MAP: Record<AffiliateHistoryItem['kind'], { text: string; color: 'blue' | 'green' | 'cyan' | 'zinc' }> = {
  click: { text: 'Переход', color: 'zinc' },
  registration: { text: 'Регистрация', color: 'blue' },
  promo: { text: 'Промокод', color: 'green' },
  deposit: { text: 'Доход', color: 'cyan' },
};

export default function StatsClient({
  initialLoaded = false,
  initialStats = null,
  initialGroups = [],
  initialRedirects = [],
  initialDomains = [],
  initialDefaultDomain = '',
}: StatsClientProps) {
  const { token } = usePartnerAuth();
  const [stats, setStats] = useState<AffiliateStatsResponse | null>(initialStats);
  const [loading, setLoading] = useState(!initialLoaded);
  const [range, setRange] = useState<[string, string]>([toInputDate(addDays(new Date(), -29)), toInputDate(new Date())]);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('all');
  const [topMetric, setTopMetric] = useState<'income' | 'clicks' | 'signups'>('income');
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>('all');
  const [historySearch, setHistorySearch] = useState('');

  const [groups, setGroups] = useState<AffiliateGroup[]>(initialGroups);
  const [redirects, setRedirects] = useState<AffiliateRedirect[]>(initialRedirects);
  const [domains, setDomains] = useState<string[]>(initialDomains);
  const [defaultDomain, setDefaultDomain] = useState(initialDefaultDomain);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<AffiliateSource | null>(null);

  const skipMeta = useRef(initialLoaded);
  const skipData = useRef(initialLoaded);

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
    setLoading(true);
    try {
      const data = await partnerApi.stats(token, range[0], range[1]);
      setStats(data);
    } catch (err) {
      showError((err as Error).message || 'Ошибка загрузки статистики');
    } finally {
      setLoading(false);
    }
  }, [token, range]);

  useEffect(() => {
    if (skipData.current) {
      skipData.current = false;
      return;
    }
    void load();
  }, [load]);

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

  const historyItems = useMemo(() => {
    const list = stats?.history ?? [];
    let out = list;
    if (historyFilter !== 'all') out = out.filter((h) => h.kind === historyFilter);
    if (historySearch.trim()) {
      const q = historySearch.trim().toLowerCase();
      out = out.filter((h) => h.sourceName.toLowerCase().includes(q));
    }
    return out;
  }, [stats, historyFilter, historySearch]);

  const historyColumns: Column<AffiliateHistoryItem>[] = useMemo(
    () => [
      {
        key: 'createdAt',
        title: 'Дата',
        width: '180px',
        render: (h) => (
          <span className="text-sm whitespace-nowrap text-muted-foreground">
            {new Date(h.createdAt).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </span>
        ),
      },
      {
        key: 'kind',
        title: 'Тип',
        width: '150px',
        render: (h) => {
          const m = KIND_MAP[h.kind] ?? { text: h.kind, color: 'zinc' as const };
          return <Tag color={m.color}>{m.text}</Tag>;
        },
      },
      { key: 'sourceName', title: 'Источник', render: (h) => <span className="text-white/90">{h.sourceName}</span> },
      {
        key: 'amount',
        title: 'Сумма',
        align: 'right',
        width: '150px',
        render: (h) =>
          h.amount === null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className={cn('font-semibold', h.kind === 'deposit' ? 'text-money' : 'text-white')}>{formatRub(h.amount)}</span>
          ),
      },
    ],
    [],
  );

  const exportHistory = () => {
    const header = ['Дата', 'Тип', 'Источник', 'Сумма, руб'];
    const rows = historyItems.map((h) => [h.createdAt, h.kind, h.sourceName, h.amount ?? '']);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate_history_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
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
                    <Bar yAxisId="left" dataKey="income" fill="#3b8cff" radius={[4, 4, 0, 0]} name="Доход" />
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

      {/* History */}
      <section className="rounded-card border border-white/10 bg-white/[0.02]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-bold text-white">История операций</h3>
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
                className={cn(inputClass, 'w-52 pl-9')}
                placeholder="Поиск..."
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
              />
            </div>
            <Segmented
              value={historyFilter}
              options={[
                { label: 'Все', value: 'all' },
                { label: 'Доход', value: 'deposit' },
                { label: 'Регистрация', value: 'registration' },
                { label: 'Переход', value: 'click' },
              ]}
              onChange={(v) => setHistoryFilter(v as HistoryFilter)}
            />
            <button type="button" className={btnGhost} onClick={exportHistory}>
              <Download className="h-3.5 w-3.5" />
              Экспорт
            </button>
          </div>
        </div>
        <div className="p-4">
          <DataTable
            columns={historyColumns}
            data={historyItems}
            rowKey={(h) => h.id}
            loading={loading}
            emptyText="Пока нет операций"
            pageSize={15}
          />
        </div>
      </section>

      <SourceModal
        open={modalOpen}
        token={token}
        initial={editing}
        groups={groups}
        redirects={redirects}
        domains={domains}
        defaultDomain={defaultDomain}
        onClose={() => setModalOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
