'use client';

// Лидерборд временно отключён. Логика страницы не удалена — см. блок-комментарий ниже.
import { Empty, Flex, Typography } from 'antd';
import { PartnerShell } from '@/components/partner/PartnerShell';

export default function LeaderboardPage() {
  return (
    <PartnerShell>
      {() => (
        <Flex justify="center" align="center" style={{ minHeight: 320 }}>
          <Empty description={<Typography.Text type="secondary">Раздел временно недоступен</Typography.Text>} />
        </Flex>
      )}
    </PartnerShell>
  );
}

/* =====================================================================
   Лидерборд (временно отключён). Вернуть: раскомментировать блок и
   убрать заглушку выше.

import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Card,
  Flex,
  Segmented,
  Table,
  Tag,
  Typography,
  Empty,
  Tooltip,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { CrownOutlined, BarChartOutlined, RiseOutlined } from '@ant-design/icons';
import { PartnerShell } from '@/components/partner/PartnerShell';
import { formatRub, formatPercent } from '@/components/partner/format';
import { partnerApi, type AffiliateLeaderboardEntry, type AffiliatePartner, type LeaderboardMetric, type LeaderboardPeriod } from '@/lib/api';

export default function LeaderboardPage() {
  return (
    <PartnerShell>
      {({ token, partner }) => <Leaderboard token={token} self={partner} />}
    </PartnerShell>
  );
}

const METRIC_LABELS: Record<LeaderboardMetric, { label: string; key: keyof AffiliateLeaderboardEntry }> = {
  income: { label: 'Доход', key: 'income' },
  clicks: { label: 'Клики', key: 'clicks' },
  signups: { label: 'Регистрации', key: 'signups' },
  deposits: { label: 'Депозиты', key: 'depositsSum' },
};

const RANK_COLORS = ['#FFB800', '#B8C2CC', '#D48A4A'];

function Leaderboard({ token, self }: { token: string; self: AffiliatePartner }) {
  const { message } = App.useApp();
  const [period, setPeriod] = useState<LeaderboardPeriod>('all');
  const [metric, setMetric] = useState<LeaderboardMetric>('income');
  const [items, setItems] = useState<AffiliateLeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await partnerApi.leaderboard(token, period, metric);
      setItems(data.items);
    } catch (err) {
      message.error((err as Error).message || 'Ошибка загрузки рейтинга');
    } finally {
      setLoading(false);
    }
  }, [token, period, metric, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const selfId = self.id;

  const columns: ColumnsType<AffiliateLeaderboardEntry> = [
    {
      title: 'Место',
      key: 'place',
      width: 90,
      render: (_, __, i) => {
        if (i < 3) {
          return (
            <Flex align="center" gap={6}>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  background: RANK_COLORS[i],
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                }}
              >
                {i + 1}
              </span>
              {i === 0 && <CrownOutlined style={{ color: '#FFB800' }} />}
            </Flex>
          );
        }
        return <Typography.Text type="secondary">{i + 1}</Typography.Text>;
      },
    },
    {
      title: 'Веб-партнёр',
      dataIndex: 'name',
      render: (v: string, r) => (
        <Flex align="center" gap={8}>
          <Typography.Text strong>{v}</Typography.Text>
          {r.id === selfId && <Tag color="blue">Вы</Tag>}
          {r.isOwner && <Tag>Владелец</Tag>}
        </Flex>
      ),
    },
    {
      title: 'Клики',
      dataIndex: 'clicks',
      width: 110,
      align: 'right',
      render: (v: number) => v.toLocaleString('ru-RU'),
    },
    {
      title: 'Регистрации',
      dataIndex: 'signups',
      width: 130,
      align: 'right',
      render: (v: number) => v.toLocaleString('ru-RU'),
    },
    {
      title: 'Конверсия',
      dataIndex: 'cr',
      width: 110,
      align: 'right',
      render: (v: number | null) => <Typography.Text type={v === null ? 'secondary' : 'success'}>{formatPercent(v)}</Typography.Text>,
    },
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
      render: (v: number) => <Typography.Text strong style={{ color: '#0070F3' }}>{formatRub(v)}</Typography.Text>,
    },
  ];

  return (
    <div style={{ maxWidth: 1040, margin: '0 auto' }}>
      <Flex justify="space-between" align="center" wrap gap={12} style={{ marginBottom: 16 }}>
        <div>
          <Typography.Title level={4} style={{ margin: 0 }}>Лидерборд</Typography.Title>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Рейтинг веб-партнёров по объёму трафика и доходу
          </Typography.Text>
        </div>
        <Flex gap={8} wrap>
          <Segmented
            value={period}
            options={[
              { label: 'Неделя', value: 'week' },
              { label: 'Месяц', value: 'month' },
              { label: 'Всё время', value: 'all' },
            ]}
            onChange={(v) => setPeriod(v as LeaderboardPeriod)}
          />
          <Segmented
            value={metric}
            options={[
              { label: 'Доход', value: 'income' },
              { label: 'Клики', value: 'clicks' },
              { label: 'Регистрации', value: 'signups' },
              { label: 'Депозиты', value: 'deposits' },
            ]}
            onChange={(v) => setMetric(v as LeaderboardMetric)}
          />
        </Flex>
      </Flex>

      <Card
        variant="borderless"
        style={{ borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)' }}
        styles={{ body: { padding: 0 } }}
      >
        <Table<AffiliateLeaderboardEntry>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={loading}
          pagination={false}
          rowClassName={(r) => (r.id === selfId ? 'aff-row-self' : '')}
          locale={{ emptyText: <Empty description="Пока нет данных для рейтинга" /> }}
        />
      </Card>

      <Flex gap={24} wrap style={{ marginTop: 16 }}>
        <Tooltip title="Регистрации / клики">
          <Card variant="borderless" style={{ borderRadius: 12, flex: 1, minWidth: 200 }}>
            <Flex align="center" gap={12}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 10,
                  background: 'rgba(0,112,243,0.1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <RiseOutlined style={{ color: '#0070F3' }} />
              </div>
              <div>
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>Топ по {METRIC_LABELS[metric].label.toLowerCase()}</Typography.Text>
                <Typography.Title level={5} style={{ margin: 0 }}>
                  {items[0]?.name ?? '—'}
                </Typography.Title>
              </div>
            </Flex>
          </Card>
        </Tooltip>
        <Card variant="borderless" style={{ borderRadius: 12, flex: 1, minWidth: 200 }}>
          <Flex align="center" gap={12}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: 'rgba(0,167,111,0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <BarChartOutlined style={{ color: '#00A76F' }} />
            </div>
            <div>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>Ваша позиция</Typography.Text>
              <Typography.Title level={5} style={{ margin: 0 }}>
                {items.findIndex((r) => r.id === selfId) >= 0
                  ? `#${items.findIndex((r) => r.id === selfId) + 1}`
                  : '—'}
              </Typography.Title>
            </div>
          </Flex>
        </Card>
      </Flex>
    </div>
  );
}
   ===================================================================== */
