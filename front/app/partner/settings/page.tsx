'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  App,
  Button,
  Card,
  Empty,
  Flex,
  Popconfirm,
  Space,
  Table,
  Tag,
  Tabs,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { PlusOutlined, DeleteOutlined, EditOutlined, CheckOutlined } from '@ant-design/icons';
import { PartnerShell } from '@/components/partner/PartnerShell';
import { GroupModal } from '@/components/partner/GroupModal';
import { RedirectModal } from '@/components/partner/RedirectModal';
import { DomainModal } from '@/components/partner/DomainModal';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { partnerApi, type AffiliateGroup, type AffiliateRedirect, type AffiliateDomain, type AffiliatePartner } from '@/lib/api';

export default function SettingsPage() {
  return (
    <PartnerShell>
      {({ token, partner }) => <Settings token={token} isOwner={partner.isOwner} />}
    </PartnerShell>
  );
}

function Settings({ token, isOwner }: { token: string; isOwner: boolean }) {
  const { message } = App.useApp();
  const [groups, setGroups] = useState<AffiliateGroup[]>([]);
  const [redirects, setRedirects] = useState<AffiliateRedirect[]>([]);
  const [domains, setDomains] = useState<AffiliateDomain[]>([]);
  const [partners, setPartners] = useState<AffiliatePartner[]>([]);
  const [loading, setLoading] = useState(true);

  const [groupModal, setGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AffiliateGroup | null>(null);

  const [redirectModal, setRedirectModal] = useState(false);
  const [editingRedirect, setEditingRedirect] = useState<AffiliateRedirect | null>(null);

  const [domainModal, setDomainModal] = useState(false);
  const [editingDomain, setEditingDomain] = useState<AffiliateDomain | null>(null);

  const [partnerModal, setPartnerModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<AffiliatePartner | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, r, d, p] = await Promise.all([
        partnerApi.groups(token),
        partnerApi.redirects(token),
        partnerApi.domains(token),
        isOwner ? partnerApi.partners(token) : Promise.resolve({ items: [] as AffiliatePartner[] }),
      ]);
      setGroups(g.items);
      setRedirects(r.items);
      setDomains(d.items);
      setPartners(p.items);
    } catch (err) {
      message.error((err as Error).message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [token, isOwner, message]);

  useEffect(() => {
    void load();
  }, [load]);

  const groupColumns: ColumnsType<AffiliateGroup> = [
    { title: 'Название', dataIndex: 'name', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    {
      title: 'Комиссия',
      dataIndex: 'commissionPercent',
      width: 120,
      render: (v: number) => <Tag color="green">{v}%</Tag>,
    },
    { title: 'Комментарий', dataIndex: 'comment', render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text> },
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_, g) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingGroup(g);
              setGroupModal(true);
            }}
          />
          <Popconfirm
            title="Удалить поток?"
            description="Источники потока останутся без группы."
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              await partnerApi.deleteGroup(token, g.id);
              void load();
            }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const redirectColumns: ColumnsType<AffiliateRedirect> = [
    { title: 'Название', dataIndex: 'name', render: (v: string) => <Typography.Text strong>{v}</Typography.Text> },
    {
      title: 'Ссылок',
      dataIndex: 'urls',
      width: 100,
      render: (urls: AffiliateRedirect['urls']) => {
        const active = urls.filter((u) => u.isActive).length;
        return <Tag color={active > 0 ? 'blue' : 'default'}>{active} активн.</Tag>;
      },
    },
    { title: 'Комментарий', dataIndex: 'comment', render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text> },
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_, r) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingRedirect(r);
              setRedirectModal(true);
            }}
          />
          <Popconfirm
            title="Удалить редирект?"
            description="Ссылки редиректа будут удалены."
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              await partnerApi.deleteRedirect(token, r.id);
              void load();
            }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const domainColumns: ColumnsType<AffiliateDomain> = [
    {
      title: 'Домен',
      dataIndex: 'url',
      render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
    },
    {
      title: 'Статус',
      dataIndex: 'isActive',
      width: 120,
      render: (v: boolean) => <Tag color={v ? 'green' : 'default'}>{v ? 'Активен' : 'Выключен'}</Tag>,
    },
    { title: 'Комментарий', dataIndex: 'comment', render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text> },
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_, d) => (
        <Space>
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingDomain(d);
              setDomainModal(true);
            }}
          />
          <Popconfirm
            title="Удалить домен?"
            description="Источники, ссылающиеся на него, перестанут резолвить ссылку."
            okText="Удалить"
            cancelText="Отмена"
            okButtonProps={{ danger: true }}
            onConfirm={async () => {
              await partnerApi.deleteDomain(token, d.id);
              void load();
            }}
          >
            <Button type="text" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const partnerColumns: ColumnsType<AffiliatePartner> = [
    {
      title: 'Имя',
      dataIndex: 'name',
      render: (v: string) => <Typography.Text strong>{v}</Typography.Text>,
    },
    { title: 'Email', dataIndex: 'email', render: (v: string) => <Typography.Text code>{v}</Typography.Text> },
    {
      title: 'Статус',
      dataIndex: 'isActive',
      width: 130,
      render: (v: boolean, p) => {
        if (p.isOwner) return <Tag color="gold">Владелец</Tag>;
        return <Tag color={v ? 'green' : 'orange'}>{v ? 'Активен' : 'Ожидает одобрения'}</Tag>;
      },
    },
    { title: 'Комментарий', dataIndex: 'comment', render: (v: string | null) => v || <Typography.Text type="secondary">—</Typography.Text> },
    {
      title: '',
      key: 'actions',
      width: 150,
      render: (_, p) => (
        <Space>
          {!p.isActive && !p.isOwner && (
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              onClick={async () => {
                await partnerApi.updatePartner(token, p.id, { isActive: true });
                message.success(`Партнёр ${p.name} одобрен`);
                void load();
              }}
            >
              Одобрить
            </Button>
          )}
          <Button
            type="text"
            icon={<EditOutlined />}
            onClick={() => {
              setEditingPartner(p);
              setPartnerModal(true);
            }}
          />
          {!p.isOwner && (
            <Popconfirm
              title="Удалить партнёра?"
              description="Все его источники и статистика будут удалены."
              okText="Удалить"
              cancelText="Отмена"
              okButtonProps={{ danger: true }}
              onConfirm={async () => {
                await partnerApi.deletePartner(token, p.id);
                void load();
              }}
            >
              <Button type="text" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      variant="borderless"
      style={{ borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)' }}
      styles={{ body: { padding: 0 } }}
    >
      <Tabs
        defaultActiveKey="groups"
        items={[
          {
            key: 'groups',
            label: 'Потоки',
            children: (
              <Table<AffiliateGroup>
                rowKey="id"
                columns={groupColumns}
                dataSource={groups}
                loading={loading}
                pagination={false}
                locale={{ emptyText: <Empty description="Потоков пока нет" /> }}
              />
            ),
          },
          {
            key: 'redirects',
            label: 'Редиректы',
            children: (
              <Table<AffiliateRedirect>
                rowKey="id"
                columns={redirectColumns}
                dataSource={redirects}
                loading={loading}
                pagination={false}
                locale={{ emptyText: <Empty description="Редиректов пока нет" /> }}
              />
            ),
          },
          {
            key: 'domains',
            label: 'Домены',
            children: (
              <Table<AffiliateDomain>
                rowKey="id"
                columns={domainColumns}
                dataSource={domains}
                loading={loading}
                pagination={false}
                locale={{ emptyText: <Empty description="Доменов пока нет" /> }}
              />
            ),
          },
          ...(isOwner
            ? [
                {
                  key: 'partners',
                  label: 'Партнёры',
                  children: (
                    <Table<AffiliatePartner>
                      rowKey="id"
                      columns={partnerColumns}
                      dataSource={partners}
                      loading={loading}
                      pagination={false}
                      locale={{ emptyText: <Empty description="Партнёров пока нет" /> }}
                    />
                  ),
                },
              ]
            : []),
        ]}
        tabBarExtraContent={
          <Flex gap={8}>
            {isOwner && (
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditingPartner(null);
                  setPartnerModal(true);
                }}
              >
                Партнёр
              </Button>
            )}
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingGroup(null);
                setGroupModal(true);
              }}
            >
              Поток
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingRedirect(null);
                setRedirectModal(true);
              }}
            >
              Редирект
            </Button>
            <Button
              icon={<PlusOutlined />}
              onClick={() => {
                setEditingDomain(null);
                setDomainModal(true);
              }}
            >
              Домен
            </Button>
          </Flex>
        }
        style={{ padding: '0 16px' }}
      />

      <GroupModal
        open={groupModal}
        token={token}
        initial={editingGroup}
        onClose={() => setGroupModal(false)}
        onSaved={() => void load()}
      />
      <RedirectModal
        open={redirectModal}
        token={token}
        initial={editingRedirect}
        onClose={() => setRedirectModal(false)}
        onSaved={() => void load()}
      />
      <DomainModal
        open={domainModal}
        token={token}
        initial={editingDomain}
        onClose={() => setDomainModal(false)}
        onSaved={() => void load()}
      />
      {isOwner && (
        <PartnerModal
          open={partnerModal}
          token={token}
          initial={editingPartner}
          onClose={() => setPartnerModal(false)}
          onSaved={() => void load()}
        />
      )}
    </Card>
  );
}
