'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  Card,
  DatePicker,
  Empty,
  Flex,
  Input,
  Segmented,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { type Dayjs } from 'dayjs';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { SearchOutlined, DownloadOutlined, BarChartOutlined, PlusOutlined } from '@ant-design/icons';
import { usePartnerAuth } from '@/components/partner/PartnerShell';
import { SourceModal } from '@/components/partner/SourceModal';
import { formatDay, formatRub } from '@/components/partner/format';
import {
  partnerApi,
  type AffiliateDailyPoint,
  type AffiliateGroup,
  type AffiliateHistoryItem,
  type AffiliateRedirect,
  type AffiliateSource,
  type AffiliateStatsResponse,
} from '@/lib/api';

type ChartMetric = 'income' | 'clicks' | 'signups';
type HistoryFilter = 'all' | 'deposit' | 'registration' | 'click';

interface StatsClientProps {
  initialLoaded?: boolean;
  initialStats?: AffiliateStatsResponse | null;
  initialGroups?: AffiliateGroup[];
  initialRedirects?: AffiliateRedirect[];
  initialDomains?: string[];
  initialDefaultDomain?: string;
}

export default function StatsClient({
  initialLoaded = false,
  initialStats = null,
  initialGroups = [],
  initialRedirects = [],
  initialDomains = [],
  initialDefaultDomain = '',
}: StatsClientProps) {
  const { token } = usePartnerAuth();
  const { message } = App.useApp();
  const [stats, setStats] = useState<AffiliateStatsResponse | null>(initialStats);
  const [loading, setLoading] = useState(!initialLoaded);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(29, 'day'), dayjs()]);
  const [chartMetric, setChartMetric] = useState<ChartMetric>('income');
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
      const data = await partnerApi.stats(
        token,
        range[0]?.format('YYYY-MM-DD'),
        range[1]?.format('YYYY-MM-DD'),
      );
      setStats(data);
    } catch (err) {
      message.error((err as Error).message || 'Ошибка загрузки статистики');
    } finally {
      setLoading(false);
    }
  }, [token, range, message]);

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
      ['today', 'Доход за сегодня', '#3b8cff', 'rgba(59,140,255,0.12)'],
      ['week', 'Доход за неделю', '#34d399', 'rgba(52,211,153,0.12)'],
      ['month', 'Доход за месяц', '#FF9F00', 'rgba(255,159,0,0.12)'],
      ['all', 'Доход за всё время', '#94a3b8', 'rgba(255,255,255,0.06)'],
    ];
    for (const [key, label, color, bg] of defs) {
      const s = stats.summary[key];
      items.push({
        label,
        value: s.income,
        accent: color,
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
        accent: '#3b8cff',
        bg: 'rgba(59,140,255,0.12)',
      },
      {
        label: 'Доход с регистрации',
        value: month.signups > 0 ? formatRub(Math.floor(month.income / month.signups)) : '—',
        sub: `${formatRub(month.income)} / ${month.signups} рег`,
        accent: '#34d399',
        bg: 'rgba(52,211,153,0.12)',
      },
      {
        label: 'Платёжная конверсия (депозиты/рег)',
        value: month.crPayment === null ? '—' : `${month.crPayment}%`,
        sub: `${month.depositors} депозиторов из ${month.signups} рег`,
        accent: '#FF9F00',
        bg: 'rgba(255,159,0,0.12)',
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

  const historyColumns: ColumnsType<AffiliateHistoryItem> = useMemo(
    () => [
      {
        title: 'Дата',
        dataIndex: 'createdAt',
        width: 180,
        render: (v: string) => (
          <Typography.Text style={{ fontSize: 13, whiteSpace: 'nowrap' }}>
            {new Date(v).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </Typography.Text>
        ),
      },
      {
        title: 'Тип',
        dataIndex: 'kind',
        width: 150,
        render: (kind: AffiliateHistoryItem['kind']) => {
          const map: Record<string, { text: string; color: string }> = {
            click: { text: 'Переход', color: 'default' },
            registration: { text: 'Регистрация', color: 'blue' },
            promo: { text: 'Промокод', color: 'green' },
            deposit: { text: 'Доход', color: 'cyan' },
          };
          const m = map[kind] ?? { text: kind, color: 'default' };
          return <Tag color={m.color}>{m.text}</Tag>;
        },
      },
      { title: 'Источник', dataIndex: 'sourceName', render: (v: string) => <Typography.Text>{v}</Typography.Text> },
      {
        title: 'Сумма',
        dataIndex: 'amount',
        width: 150,
        align: 'right' as const,
        render: (v: number | null, h) =>
          v === null ? (
            <Typography.Text type="secondary">—</Typography.Text>
          ) : (
            <Typography.Text strong style={{ color: h.kind === 'deposit' ? '#34d399' : undefined }}>
              {formatRub(v)}
            </Typography.Text>
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
    <Flex vertical gap={16}>
      {/* Summary cards */}
      <Flex wrap gap={16} justify="space-between">
        {summaryCards.map((c) => (
          <Card
            key={c.label}
            variant="borderless"
            style={{ flex: '1 1 19%', minWidth: 170, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}
            styles={{ body: { padding: '8px 20px 20px' } }}
          >
            <span
              style={{
                display: 'inline-block',
                padding: '4px 8px',
                borderRadius: 12,
                background: c.bg,
                fontSize: 11,
                fontWeight: 600,
                color: c.accent,
              }}
            >
              {c.label}
            </span>
            <div style={{ marginTop: 16, fontSize: 24, fontWeight: 700, lineHeight: 1 }}>
              {formatRub(c.value)}
            </div>
            <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: 6 }}>
              {c.sub}
            </Typography.Text>
          </Card>
        ))}
      </Flex>

      {/* Conversion cards */}
      {conversionCards.length > 0 && (
        <Flex wrap gap={16}>
          {conversionCards.map((c) => (
            <Card
              key={c.label}
              variant="borderless"
              style={{ flex: '1 1 30%', minWidth: 240, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}
              styles={{ body: { padding: '14px 20px' } }}
            >
              <Flex align="center" gap={12}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: c.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <BarChartOutlined style={{ color: c.accent }} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <Typography.Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
                    {c.label}
                  </Typography.Text>
                  <Typography.Text strong style={{ fontSize: 18 }}>
                    {c.value}
                  </Typography.Text>
                  <Typography.Text type="secondary" style={{ fontSize: 11, display: 'block' }}>
                    {c.sub}
                  </Typography.Text>
                </div>
              </Flex>
            </Card>
          ))}
        </Flex>
      )}

      {/* Chart + top sources */}
      <Flex gap={16} align="stretch">
        <Card
          variant="borderless"
          style={{ flex: 3, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}
          styles={{ body: { padding: 0 } }}
        >
          <Flex wrap gap={8} align="center" justify="space-between" style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <Space>
              <BarChartOutlined style={{ color: '#3b8cff' }} />
              <Typography.Text style={{ fontSize: 16, fontWeight: 500 }}>Статистика</Typography.Text>
            </Space>
            <Space>
              <Segmented
                value={chartMetric}
                options={[
                  { label: 'Доход', value: 'income' },
                  { label: 'Переходы', value: 'clicks' },
                  { label: 'Регистрации', value: 'signups' },
                ]}
                onChange={(v) => setChartMetric(v as ChartMetric)}
              />
              <DatePicker.RangePicker
                allowClear={false}
                value={range}
                onChange={(v) => {
                  if (v && v[0] && v[1]) setRange([v[0], v[1]]);
                }}
                format="DD.MM.YYYY"
              />
            </Space>
          </Flex>
          <div style={{ height: 380, padding: 16 }}>
            {chartData.length === 0 ? (
              <Empty description="Активности пока нет" style={{ marginTop: 80 }} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={(v: string) => dayjs(v).format('DD.MM')}
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
                    contentStyle={{ background: '#0f172a', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, color: '#f8fafc' }}
                    labelStyle={{ color: '#94a3b8' }}
                  />
                  <Bar
                    dataKey={chartMetric}
                    fill="#3b8cff"
                    radius={[4, 4, 0, 0]}
                    name={chartMetric === 'income' ? 'Доход' : chartMetric === 'clicks' ? 'Переходы' : 'Регистрации'}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card
          variant="borderless"
          style={{ flex: 1, minWidth: 300, borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}
          styles={{ body: { padding: 0 } }}
        >
          <Flex wrap={false} gap={8} align="center" justify="space-between" style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <Typography.Text style={{ fontSize: 16, fontWeight: 500 }}>Топ источников</Typography.Text>
            <Segmented
              value={topMetric}
              options={[
                { label: 'Доход', value: 'income' },
                { label: 'Перех.', value: 'clicks' },
                { label: 'Рег.', value: 'signups' },
              ]}
              onChange={(v) => setTopMetric(v as 'income' | 'clicks' | 'signups')}
              size="small"
            />
          </Flex>
          <div style={{ padding: 16 }}>
            {topSources.length === 0 ? (
              <Empty description="Активности пока нет" style={{ marginTop: 60 }} />
            ) : (
              <Flex vertical gap={12}>
                {topSources.map((s, i) => (
                  <Flex key={s.id} align="center" gap={10}>
                    <span
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 8,
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 12,
                        fontWeight: 700,
                        background: i === 0 ? 'rgba(255,159,0,0.15)' : 'rgba(59,140,255,0.12)',
                        color: i === 0 ? '#FF9F00' : '#3b8cff',
                        flexShrink: 0,
                      }}
                    >
                      {i + 1}
                    </span>
                    <Typography.Text ellipsis style={{ flex: 1, fontSize: 13 }}>
                      {s.name}
                    </Typography.Text>
                    <Typography.Text strong style={{ fontSize: 13 }}>
                      {topMetric === 'income' ? formatRub(s.income) : (s[topMetric] as number).toLocaleString('ru-RU')}
                    </Typography.Text>
                  </Flex>
                ))}
              </Flex>
            )}
          </div>
        </Card>
      </Flex>

      {/* History */}
      <Card
        variant="borderless"
        style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Flex wrap gap={8} align="center" justify="space-between" style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Space size={12} align="center">
            <Typography.Text style={{ fontSize: 16, fontWeight: 500 }}>История операций</Typography.Text>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => {
                setEditing(null);
                setModalOpen(true);
              }}
            >
              Создать
            </Button>
          </Space>
          <Flex wrap gap={8} align="center">
            <Input
              allowClear
              prefix={<SearchOutlined style={{ color: '#999' }} />}
              placeholder="Поиск..."
              value={historySearch}
              onChange={(e) => setHistorySearch(e.target.value)}
              style={{ width: 220 }}
            />
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
            <ButtonGhost icon={<DownloadOutlined />} onClick={exportHistory} text="Экспорт" />
          </Flex>
        </Flex>
        <Table<AffiliateHistoryItem>
          rowKey={(h) => h.id}
          columns={historyColumns}
          dataSource={historyItems}
          loading={loading}
          pagination={{ pageSize: 15, showSizeChanger: false, showTotal: (t) => `${t} записей` }}
          locale={{ emptyText: <Empty description="Пока нет операций" /> }}
        />
      </Card>
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
    </Flex>
  );
}

function ButtonGhost({ icon, onClick, text }: { icon: React.ReactNode; onClick: () => void; text: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        height: 34,
        padding: '0 8px',
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.12)',
        background: '#0f172a',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {icon}
      {text}
    </button>
  );
}
