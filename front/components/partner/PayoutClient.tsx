'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Flex,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DownloadOutlined } from '@ant-design/icons';
import { usePartnerAuth } from '@/components/partner/PartnerShell';
import { formatDate, formatRub } from '@/components/partner/format';
import { partnerApi, type AffiliateTransaction } from '@/lib/api';

function UsdtIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M11.8125 6C11.8125 9.21016 9.21016 11.8125 6 11.8125C2.78984 11.8125 0.1875 9.21016 0.1875 6C0.1875 2.78984 2.78984 0.1875 6 0.1875C9.21016 0.1875 11.8125 2.78984 11.8125 6ZM8.49255 5.17195C8.60827 4.39854 8.01933 3.98276 7.21404 3.7054L7.47527 2.6577L6.83747 2.49877L6.58315 3.51886C6.41548 3.47707 6.24326 3.43767 6.07214 3.39862L6.32829 2.37183L5.69084 2.2129L5.42944 3.26023C5.29064 3.22861 5.1544 3.19737 5.02216 3.16451L5.02289 3.16123L4.14328 2.94162L3.97362 3.62276C3.97362 3.62276 4.44684 3.7312 4.43686 3.73791C4.69519 3.80238 4.74187 3.97331 4.73405 4.1088L4.43648 5.30236C4.4543 5.30691 4.47736 5.31345 4.50279 5.32362C4.48153 5.31834 4.45882 5.31253 4.43538 5.30691L4.01829 6.97889C3.98667 7.05736 3.90656 7.17506 3.726 7.13039C3.73235 7.13965 3.26241 7.01468 3.26241 7.01468L2.94577 7.74469L3.77578 7.95157C3.93019 7.99027 4.08152 8.03077 4.23047 8.0689L3.96652 9.12858L4.60359 9.28751L4.86499 8.23908C5.03394 8.28487 5.20338 8.32883 5.37328 8.37096L5.11277 9.41447L5.75058 9.5734L6.01453 8.51571C7.10212 8.72152 7.91998 8.6385 8.2642 7.65492C8.54161 6.86297 8.2504 6.40615 7.67817 6.10826C8.09489 6.01221 8.40881 5.73813 8.49255 5.17195ZM7.03528 7.21521C6.83817 8.00716 5.50463 7.57903 5.07227 7.47169L5.42252 6.0678C5.85485 6.17569 7.24127 6.3893 7.03528 7.21521ZM7.23255 5.16052C7.05272 5.88089 5.94277 5.51489 5.58272 5.42517L5.90025 4.15188C6.26032 4.2416 7.41984 4.40906 7.23255 5.16052Z"
        fill="#1E40AF"
      />
    </svg>
  );
}

const EMPTY_STATE_SVG = (
  <svg width="97" height="96" viewBox="0 0 97 96" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M48.3281 0C74.8378 0 96.3281 21.4903 96.3281 48C96.3281 74.5097 74.8378 96 48.3281 96C21.8185 96 0.328125 74.5097 0.328125 48C0.328125 21.4903 21.8185 0 48.3281 0Z"
      fill="#F3F4F6"
    />
    <path
      d="M48.3281 0C74.8378 0 96.3281 21.4903 96.3281 48C96.3281 74.5097 74.8378 96 48.3281 96C21.8185 96 0.328125 74.5097 0.328125 48C0.328125 21.4903 21.8185 0 48.3281 0Z"
      stroke="#E5E7EB"
    />
    <path d="M59.5781 66H37.0781V30H59.5781V66Z" stroke="#E5E7EB" />
    <g clipPath="url(#payoutEmptyClip)">
      <path
        d="M37.8984 32.8789C38.3965 32.6504 38.9824 32.7324 39.3984 33.0898L41.7656 35.1172L44.1328 33.0898C44.6602 32.6387 45.4395 32.6387 45.9609 33.0898L48.3281 35.1172L50.6953 33.0898C51.2227 32.6387 52.002 32.6387 52.5234 33.0898L54.8906 35.1172L57.2578 33.0898C57.6738 32.7324 58.2598 32.6504 58.7578 32.8789C59.2559 33.1074 59.5781 33.6055 59.5781 34.1562V61.3437C59.5781 61.8945 59.2559 62.3926 58.7578 62.6211C58.2598 62.8496 57.6738 62.7676 57.2578 62.4102L54.8906 60.3828L52.5234 62.4102C51.9961 62.8613 51.2168 62.8613 50.6953 62.4102L48.3281 60.3828L45.9609 62.4102C45.4336 62.8613 44.6543 62.8613 44.1328 62.4102L41.7656 60.3828L39.3984 62.4102C38.9824 62.7676 38.3965 62.8496 37.8984 62.6211C37.4004 62.3926 37.0781 61.8945 37.0781 61.3437V34.1562C37.0781 33.6055 37.4004 33.1074 37.8984 32.8789ZM42.7031 41.1875C42.1875 41.1875 41.7656 41.6094 41.7656 42.125C41.7656 42.6406 42.1875 43.0625 42.7031 43.0625H53.9531C54.4688 43.0625 54.8906 42.6406 54.8906 42.125C54.8906 41.6094 54.4688 41.1875 53.9531 41.1875H42.7031ZM41.7656 53.375C41.7656 53.8906 42.1875 54.3125 42.7031 54.3125H53.9531C54.4688 54.3125 54.8906 53.8906 54.8906 53.375C54.8906 52.8594 54.4688 52.4375 53.9531 52.4375H42.7031C42.1875 52.4375 41.7656 52.8594 41.7656 53.375ZM42.7031 46.8125C42.1875 46.8125 41.7656 47.2344 41.7656 47.75C41.7656 48.2656 42.1875 48.6875 42.7031 48.6875H53.9531C54.4688 48.6875 54.8906 48.2656 54.8906 47.75C54.8906 47.2344 54.4688 46.8125 53.9531 46.8125H42.7031Z"
        fill="#9CA3AF"
      />
    </g>
    <defs>
      <clipPath id="payoutEmptyClip">
        <path d="M37.0781 32.75H59.5781V62.75H37.0781V32.75Z" fill="white" />
      </clipPath>
    </defs>
  </svg>
);

export default function Payout() {
  const { token, partner } = usePartnerAuth();
  const { message } = App.useApp();
  const [txns, setTxns] = useState<AffiliateTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  const balance = partner.balance;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await partnerApi.transactions(token);
      setTxns(data.items);
    } catch (err) {
      message.error((err as Error).message || 'Ошибка загрузки начислений');
    } finally {
      setLoading(false);
    }
  }, [token, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = () => {
    const header = ['Дата', 'Депозит, руб', 'Комиссия, %', 'Начислено, руб'];
    const rows = txns.map((t) => [t.createdAt, t.depositAmount ?? '', t.commissionPercent ?? '', t.amount]);
    const csv = [header, ...rows]
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate_accruals_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const columns: ColumnsType<AffiliateTransaction> = [
    {
      title: 'Дата',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => (
        <Typography.Text style={{ fontSize: 13, whiteSpace: 'nowrap' }}>{formatDate(v)}</Typography.Text>
      ),
    },
    {
      title: 'Депозит',
      dataIndex: 'depositAmount',
      width: 130,
      align: 'right' as const,
      render: (v: number | null) => (v === null ? <Typography.Text type="secondary">—</Typography.Text> : formatRub(v)),
    },
    {
      title: 'Комиссия',
      dataIndex: 'commissionPercent',
      width: 110,
      align: 'right' as const,
      render: (v: number | null) =>
        v === null ? <Typography.Text type="secondary">—</Typography.Text> : <Typography.Text>{v}%</Typography.Text>,
    },
    {
      title: 'Начислено',
      dataIndex: 'amount',
      width: 140,
      align: 'right' as const,
      render: (v: number) => <Typography.Text strong style={{ color: '#34d399' }}>+{formatRub(v)}</Typography.Text>,
    },
  ];

  return (
    <div style={{ width: '100%', margin: '24px auto 0', padding: '0 32px', boxSizing: 'border-box' }}>
      <Flex align="flex-start" gap={32} wrap={false} style={{ flexDirection: 'row' }}>
        <div
          style={{
            width: 380,
            flexShrink: 0,
            padding: 24,
            backgroundColor: '#0f172a',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <Typography.Title level={4} style={{ fontSize: 20, fontWeight: 600, margin: 0, color: '#f8fafc' }}>
            Баланс
          </Typography.Title>
          <Typography.Text type="secondary" style={{ marginTop: 8, display: 'block', fontSize: 14 }}>
            Комиссия с депозитов привлечённых игроков начисляется на баланс автоматически.
          </Typography.Text>

          <div
            style={{
              marginTop: 12,
              padding: '12px 16px',
              borderRadius: 12,
              backgroundColor: 'rgba(52, 211, 153, 0.1)',
              border: '1px solid rgba(52, 211, 153, 0.25)',
            }}
          >
            <Typography.Text style={{ display: 'block', color: '#34d399', fontWeight: 600, fontSize: 15 }}>
              Ваша комиссия: {partner.commissionPercent ?? 0}%
            </Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              от каждого депозита привлечённого игрока
            </Typography.Text>
          </div>

          <div
            style={{
              flexDirection: 'column',
              borderRadius: 12,
              padding: 20,
              marginTop: 24,
              backgroundColor: 'rgba(59, 140, 255, 0.12)',
              border: '1px solid rgba(59, 140, 255, 0.3)',
            }}
          >
            <Typography.Text style={{ display: 'block', color: '#94a3b8', fontWeight: 500, fontSize: 13 }}>
              Доступно к выводу
            </Typography.Text>
            <Typography.Title level={2} style={{ margin: 0, color: '#3b8cff', fontSize: 32, fontWeight: 700 }}>
              {formatRub(balance)}
            </Typography.Title>
          </div>

          <div
            style={{
              marginTop: 24,
              backgroundColor: '#0f172a',
              padding: 20,
              borderRadius: 12,
              border: '1px solid rgba(255,255,255,0.08)',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <Typography.Text style={{ display: 'block', color: '#f8fafc', fontWeight: 500, fontSize: 14 }}>
              Вывод средств
            </Typography.Text>
            <Flex align="center" gap={8} vertical={false} style={{ gap: 8 }}>
              <UsdtIcon />
              <Typography.Text style={{ color: '#94a3b8', fontSize: 13 }}>
                USDT TRC20 — скоро появится
              </Typography.Text>
            </Flex>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            backgroundColor: '#0f172a',
            borderRadius: 16,
            border: '1px solid rgba(255,255,255,0.08)',
            overflow: 'hidden',
          }}
        >
          <Flex
            wrap
            gap={16}
            align="center"
            justify="space-between"
            style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(255,255,255,0.03)',
              borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Typography.Text style={{ fontSize: 16, fontWeight: 500, whiteSpace: 'nowrap', flexShrink: 0 }}>
              История начислений
            </Typography.Text>
            <Button
              icon={<DownloadOutlined />}
              onClick={exportCsv}
              style={{ height: 34, borderRadius: 12, fontSize: 13, boxShadow: 'none' }}
              disabled={txns.length === 0}
            >
              Экспорт
            </Button>
          </Flex>

          {txns.length === 0 && !loading ? (
            <Flex vertical align="center" justify="center" style={{ height: 400, width: '100%' }}>
              {EMPTY_STATE_SVG}
              <Typography.Title level={4} style={{ marginTop: 24, fontSize: 20, fontWeight: 600, textAlign: 'center' }}>
                Пока нет начислений
              </Typography.Title>
              <Typography.Paragraph
                type="secondary"
                style={{ maxWidth: 400, marginTop: 8, textAlign: 'center', fontSize: 14 }}
              >
                Когда приглашённый вами игрок пополнит баланс, комиссия сразу появится здесь.
              </Typography.Paragraph>
            </Flex>
          ) : (
            <Table<AffiliateTransaction>
              rowKey="id"
              columns={columns}
              dataSource={txns}
              loading={loading}
              pagination={false}
              scroll={{ x: 'max-content' }}
            />
          )}
        </div>
      </Flex>
    </div>
  );
}
