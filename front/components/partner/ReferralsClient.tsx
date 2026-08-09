'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  App,
  Button,
  Card,
  DatePicker,
  Flex,
  Table,
  Tag,
  Typography,
  Empty,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined, TeamOutlined, WalletOutlined } from '@ant-design/icons';
import { usePartnerAuth } from '@/components/partner/PartnerShell';
import { formatRub, formatDate, todayStr } from '@/components/partner/format';
import { partnerApi, type AffiliateReferral } from '@/lib/api';

interface ReferralsClientProps {
  initialLoaded?: boolean;
  initialItems?: AffiliateReferral[];
  initialSum?: number;
}

const DEFAULT_RANGE: [string, string] = ['', ''];

export default function ReferralsClient({
  initialLoaded = false,
  initialItems = [],
  initialSum = 0,
}: ReferralsClientProps) {
  const { token } = usePartnerAuth();
  const { message } = App.useApp();
  const [range, setRange] = useState<[string, string]>(DEFAULT_RANGE);
  const [items, setItems] = useState<AffiliateReferral[]>(initialItems);
  const [sum, setSum] = useState(initialSum);
  const [loading, setLoading] = useState(!initialLoaded);

  const skipData = useRef(initialLoaded);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [from, to] = range;
      const data = await partnerApi.referrals(token, from || undefined, to || undefined);
      setItems(data.items);
      setSum(data.sum);
    } catch (err) {
      message.error((err as Error).message || 'Ошибка загрузки рефералов');
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

  const exportCsv = () => {
    const header = ['Ник', 'Тип', 'Источник', 'Депозиты, руб', 'Доход, руб', 'Дата'];
    const rows = items.map((r) => [
      r.name,
      r.kind === 'promo' ? 'Промокод' : 'Регистрация',
      r.sourceName,
      String(r.depositsSum),
      String(r.income),
      formatDate(r.createdAt),
    ]);
    const csv = [header, ...rows].map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `referrals-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: ColumnsType<AffiliateReferral> = [
    {
      title: 'Игрок',
      dataIndex: 'name',
      render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
    },
    {
      title: 'Тип',
      dataIndex: 'kind',
      width: 130,
      render: (v: AffiliateReferral['kind']) => (
        <Tag color={v === 'promo' ? 'purple' : 'blue'}>{v === 'promo' ? 'Промокод' : 'Регистрация'}</Tag>
      ),
    },
    { title: 'Источник', dataIndex: 'sourceName', render: (v: string) => <Typography.Text>{v}</Typography.Text> },
    {
      title: 'Депозиты',
      dataIndex: 'depositsSum',
      width: 130,
      align: 'right',
      render: (v: number) => formatRub(v),
    },
    {
      title: 'Доход',
      dataIndex: 'income',
      width: 140,
      align: 'right',
      render: (v: number) => <Typography.Text strong style={{ color: '#3b8cff' }}>{formatRub(v)}</Typography.Text>,
    },
    {
      title: 'Дата',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => <Typography.Text type="secondary" style={{ fontSize: 13 }}>{formatDate(v)}</Typography.Text>,
    },
  ];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Рефералы</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Игроки, пришедшие по вашим офферам
          </Typography.Text>
        </div>
        <Flex gap={8} wrap align="center">
          <DatePicker.RangePicker
            allowClear
            onChange={(v) => {
              if (!v || !v[0] || !v[1]) {
                setRange(DEFAULT_RANGE);
                return;
              }
              setRange([v[0].format('YYYY-MM-DD'), v[1].format('YYYY-MM-DD')]);
            }}
          />
          <Button icon={<DownloadOutlined />} onClick={exportCsv} disabled={items.length === 0}>
            Экспорт
          </Button>
        </Flex>
      </Flex>

      <Flex gap={16} wrap style={{ marginBottom: 16 }}>
        <Card variant="borderless" style={{ borderRadius: 12, flex: 1, minWidth: 200 }}>
          <Flex align="center" gap={12}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(59,140,255,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <TeamOutlined style={{ color: '#3b8cff' }} />
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Игроков приведено</Typography.Text>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {items.length.toLocaleString('ru-RU')}
              </Typography.Title>
            </div>
          </Flex>
        </Card>
        <Card variant="borderless" style={{ borderRadius: 12, flex: 1, minWidth: 200 }}>
          <Flex align="center" gap={12}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(52,211,153,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <WalletOutlined style={{ color: '#34d399' }} />
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Доход за период</Typography.Text>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {formatRub(sum)}
              </Typography.Title>
            </div>
          </Flex>
        </Card>
      </Flex>

      <Card
        variant="borderless"
        style={{ borderRadius: 16, border: '1px solid rgba(255,255,255,0.08)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table<AffiliateReferral>
          rowKey={(r) => `${r.userId}-${r.kind}`}
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={{ pageSize: 25, showSizeChanger: false }}
          locale={{ emptyText: <Empty description="Рефералов пока нет" /> }}
        />
      </Card>
    </div>
  );
}
