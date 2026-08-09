'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  App,
  Button,
  DatePicker,
  Dropdown,
  Flex,
  Input,
  Popconfirm,
  Segmented,
  Select,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import {
  SearchOutlined,
  CopyOutlined,
  MoreOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import { usePartnerAuth } from '@/components/partner/PartnerShell';
import { SourceModal } from '@/components/partner/SourceModal';
import { formatDate, formatPercent, formatRub, shortCode } from '@/components/partner/format';
import {
  partnerApi,
  buildAffiliateLink,
  type AffiliateGroup,
  type AffiliateRedirect,
  type AffiliateSource,
  type AffiliateSourceItem,
} from '@/lib/api';

const PAGE_SIZE = 20;

interface OffersClientProps {
  initialLoaded?: boolean;
  initialGroups?: AffiliateGroup[];
  initialRedirects?: AffiliateRedirect[];
  initialDomains?: string[];
  initialItems?: AffiliateSourceItem[];
  initialTotal?: number;
}

export default function OffersClient({
  initialLoaded = false,
  initialGroups = [],
  initialRedirects = [],
  initialDomains = [],
  initialItems = [],
  initialTotal = 0,
}: OffersClientProps) {
  const { token } = usePartnerAuth();
  const { message } = App.useApp();
  const [groups, setGroups] = useState<AffiliateGroup[]>(initialGroups);
  const [redirects, setRedirects] = useState<AffiliateRedirect[]>(initialRedirects);
  const [domains, setDomains] = useState<string[]>(initialDomains);
  const [items, setItems] = useState<AffiliateSourceItem[]>(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(!initialLoaded);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState<string | undefined>();
  const [type, setType] = useState<'link' | 'promo' | 'all'>('all');
  const [range, setRange] = useState<[string, string] | null>(null);

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
    } catch {
      // non-fatal
    }
  }, [token]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await partnerApi.sources(token, {
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
        search: search || undefined,
        groupId,
        type: type === 'all' ? undefined : type,
        from: range?.[0],
        to: range?.[1],
      });
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      message.error((err as Error).message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [token, page, search, groupId, type, range, message]);

  useEffect(() => {
    if (skipMeta.current) {
      skipMeta.current = false;
      return;
    }
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (skipData.current) {
      skipData.current = false;
      return;
    }
    void load();
  }, [load]);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('Скопировано');
    } catch {
      message.error('Не удалось скопировать');
    }
  }, [message]);

  const exportCsv = () => {
    const isPromo = type === 'promo';
    const header = isPromo
      ? ['Дата создания', 'Название', 'Тип', 'Код', 'Активации', 'Доход, руб', 'Оплат']
      : ['Дата создания', 'Название', 'Тип', 'Код', 'Все переходы', 'Уник. переходы', 'Регистрации', 'Доход, руб', 'Оплат', 'CR в оплату, %'];
    const rows = items.map((s) =>
      isPromo
        ? [
            s.createdAt,
            s.name,
            'промокод',
            s.code,
            s.promos ?? 0,
            s.income,
            s.depositsCount,
          ]
        : [
            s.createdAt,
            s.name,
            s.type === 'link' ? 'ссылка' : 'промокод',
            s.code,
            s.type === 'promo' ? '—' : s.clicks,
            s.type === 'promo' ? '—' : s.uniqueClicks,
            s.type === 'promo' ? '—' : s.signups,
            s.income,
            s.depositsCount,
            s.type === 'promo' ? '—' : s.crPayment ?? '',
          ],
    );
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate_sources_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnsType<AffiliateSourceItem> = useMemo(
    () => {
      const metricCols: ColumnsType<AffiliateSourceItem> =
        type === 'promo'
          ? [
              {
                title: 'Активации',
                dataIndex: 'promos',
                width: 120,
                align: 'right' as const,
                render: (v: number) => (v ?? 0).toLocaleString('ru-RU'),
              },
            ]
          : [
              {
                title: 'Все переходы',
                dataIndex: 'clicks',
                width: 120,
                align: 'right' as const,
                render: (v: number, s) =>
                  s.type === 'promo' ? (
                    <Typography.Text type="secondary">—</Typography.Text>
                  ) : (
                    v.toLocaleString('ru-RU')
                  ),
              },
              {
                title: 'Уник. переходы',
                dataIndex: 'uniqueClicks',
                width: 130,
                align: 'right' as const,
                render: (v: number, s) =>
                  s.type === 'promo' ? (
                    <Typography.Text type="secondary">—</Typography.Text>
                  ) : (
                    v.toLocaleString('ru-RU')
                  ),
              },
              {
                title: 'Регистрации',
                dataIndex: 'signups',
                width: 120,
                align: 'right' as const,
                render: (v: number, s) =>
                  s.type === 'promo' ? (
                    <Typography.Text type="secondary">—</Typography.Text>
                  ) : (
                    v.toLocaleString('ru-RU')
                  ),
              },
            ];

      const crCols: ColumnsType<AffiliateSourceItem> =
        type === 'promo'
          ? []
          : [
              {
                title: 'CR в оплату',
                dataIndex: 'crPayment',
                width: 120,
                align: 'right' as const,
                render: (v: number | null, s) =>
                  s.type === 'promo' ? <Typography.Text type="secondary">—</Typography.Text> : formatPercent(v),
              },
            ];

      return [
      {
        title: 'Дата создания',
        dataIndex: 'createdAt',
        width: 170,
        render: (v: string) => (
          <Typography.Text style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(v)}</Typography.Text>
        ),
      },
      {
        title: 'Ссылка/Промокод',
        key: 'urlOrPromo',
        width: 320,
        render: (_, s) => {
          const text = s.type === 'link' ? buildAffiliateLink(s.code, s.domain) : s.code;
          return (
            <Flex align="center" gap={8} style={{ minWidth: 0, cursor: 'pointer' }} onClick={() => handleCopy(text)}>
              <CopyOutlined style={{ color: '#94a3b8', flexShrink: 0 }} />
              <Flex vertical style={{ minWidth: 0 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  {s.name}
                </Typography.Text>
                <Typography.Text
                  type="secondary"
                  style={{ fontSize: 12, maxWidth: 260 }}
                  ellipsis={{ tooltip: text }}
                >
                  {shortCode(text)}
                </Typography.Text>
              </Flex>
              <Tag color={s.type === 'link' ? 'blue' : 'green'} style={{ marginInlineStart: 'auto', flexShrink: 0 }}>
                {s.type === 'link' ? 'ссылка' : 'промо'}
              </Tag>
            </Flex>
          );
        },
      },
      ...metricCols,
      {
        title: 'Доход',
        dataIndex: 'income',
        width: 120,
        align: 'right' as const,
        render: (v: number, s) => (
          <Typography.Text strong style={{ color: s.income > 0 ? '#34d399' : undefined }}>
            {formatRub(v)}
          </Typography.Text>
        ),
      },
      { title: 'Оплат', dataIndex: 'depositsCount', width: 100, align: 'right' as const, render: (v: number) => v.toLocaleString('ru-RU') },
      ...crCols,
      {
        title: '',
        key: 'actions',
        width: 60,
        align: 'center' as const,
        render: (_, s) => (
          <Dropdown
            trigger={['click']}
            menu={{
              items: [
                { key: 'edit', label: 'Редактировать' },
                {
                  key: 'delete',
                  label: (
                    <Popconfirm
                      title="Удалить источник?"
                      description="Клики и регистрации источника будут удалены."
                      okText="Удалить"
                      cancelText="Отмена"
                      okButtonProps={{ danger: true }}
                      onConfirm={async () => {
                        await partnerApi.deleteSource(token, s.id);
                        message.success('Источник удалён');
                        void load();
                      }}
                    >
                      <span style={{ color: '#ff4d4f' }}>Удалить</span>
                    </Popconfirm>
                  ),
                },
              ],
              onClick: (info) => {
                if (info.key === 'edit') {
                  setEditing(s);
                  setModalOpen(true);
                }
              },
            }}
          >
            <Button type="text" icon={<MoreOutlined />} />
          </Dropdown>
        ),
      },
      ];
    },
    [token, message, load, handleCopy, type],
  );

  return (
    <div className="rounded-2xl border bg-[#0f172a]" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
      <Flex wrap gap={16} align="center" justify="space-between" style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Typography.Text style={{ fontSize: 16, fontWeight: 500 }}>Источники трафика</Typography.Text>

        <Flex wrap gap={8} align="center">
          <Segmented
            value={type}
            options={[
              { label: 'Все', value: 'all' },
              { label: 'Ссылки', value: 'link' },
              { label: 'Промокоды', value: 'promo' },
            ]}
            onChange={(v) => setType(v as 'all' | 'link' | 'promo')}
          />
          <Select
            allowClear
            placeholder="Без потока"
            value={groupId}
            onChange={(v) => {
              setGroupId(v);
              setPage(1);
            }}
            style={{ width: 160 }}
            options={groups.map((g) => ({ label: g.name, value: g.id }))}
          />
          <Input
            allowClear
            prefix={<SearchOutlined style={{ color: '#999' }} />}
            placeholder="Поиск..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            style={{ width: 220 }}
          />
          <DatePicker.RangePicker
            value={range ? [dayjs(range[0]), dayjs(range[1])] : null}
            onChange={(v) => {
              if (v && v[0] && v[1]) {
                setRange([v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')]);
              } else {
                setRange(null);
              }
              setPage(1);
            }}
            allowClear
            format="DD.MM.YYYY"
            placeholder={['Начало', 'Конец']}
          />
          <Button icon={<DownloadOutlined />} onClick={exportCsv}>
            Экспорт
          </Button>
        </Flex>
      </Flex>

      <Table<AffiliateSourceItem>
        rowKey="id"
        columns={columns}
        dataSource={items}
        loading={loading}
        pagination={{
          current: page,
          pageSize: PAGE_SIZE,
          total,
          showTotal: (t) => `1-${items.length} из ${t}`,
          onChange: (p) => setPage(p),
          showSizeChanger: false,
        }}
        scroll={{ x: 'max-content' }}
      />
      <SourceModal
        open={modalOpen}
        token={token}
        initial={editing}
        groups={groups}
        redirects={redirects}
        domains={domains}
        onClose={() => setModalOpen(false)}
        onSaved={() => void load()}
      />
    </div>
  );
}
