'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Drawer,
  Flex,
  Table,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { formatRub } from '@/components/partner/format';
import { partnerApi, type AffiliatePartner, type AffiliateReferral } from '@/lib/api';

interface PartnerUsersDrawerProps {
  open: boolean;
  token: string;
  partner: AffiliatePartner | null;
  onClose: () => void;
}

export function PartnerUsersDrawer({ open, token, partner, onClose }: PartnerUsersDrawerProps) {
  const { message } = App.useApp();
  const [items, setItems] = useState<AffiliateReferral[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!partner) return;
    setLoading(true);
    try {
      const data = await partnerApi.partnerReferrals(token, partner.id);
      setItems(data.items);
    } catch (err) {
      message.error((err as Error).message || 'Ошибка загрузки игроков');
    } finally {
      setLoading(false);
    }
  }, [token, partner, message]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const columns: ColumnsType<AffiliateReferral> = [
    {
      title: 'Игрок',
      dataIndex: 'name',
      render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
    },
    { title: 'Источник', dataIndex: 'sourceName', render: (v: string) => <Typography.Text>{v}</Typography.Text> },
    {
      title: 'Депозиты',
      dataIndex: 'depositsSum',
      width: 120,
      align: 'right',
      render: (v: number) => formatRub(v),
    },
    {
      title: 'Доход',
      dataIndex: 'income',
      width: 120,
      align: 'right',
      render: (v: number) => <Typography.Text strong style={{ color: '#3b8cff' }}>{formatRub(v)}</Typography.Text>,
    },
  ];

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={`Игроки · ${partner?.name ?? ''}`}
      width={640}
    >
      {partner?.commissionPercent !== undefined && (
        <Flex align="center" gap={8} style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary" style={{ fontSize: 13 }}>
            Комиссия партнёра: <Typography.Text strong>{partner.commissionPercent}%</Typography.Text> с депозита игрока
          </Typography.Text>
        </Flex>
      )}
      <Table<AffiliateReferral>
        rowKey="userId"
        columns={columns}
        dataSource={items}
        loading={loading}
        pagination={{ pageSize: 15, showSizeChanger: false }}
        locale={{ emptyText: 'Привлечённых игроков пока нет' }}
        scroll={{ x: 'max-content' }}
      />
    </Drawer>
  );
}
