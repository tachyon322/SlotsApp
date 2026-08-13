'use client';

import { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { formatRub } from '@/components/partner/format';
import { DataTable, type Column } from '@/components/partner/ui';
import { partnerApi, type AffiliatePartner, type AffiliateReferral } from '@/lib/api';
import { showError } from '@/lib/toast';

interface PartnerUsersDrawerProps {
  open: boolean;
  token: string;
  partner: AffiliatePartner | null;
  onClose: () => void;
}

export function PartnerUsersDrawer({ open, token, partner, onClose }: PartnerUsersDrawerProps) {
  const [items, setItems] = useState<AffiliateReferral[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!partner) return;
    setLoading(true);
    try {
      const data = await partnerApi.partnerReferrals(token, partner.id);
      setItems(data.items);
    } catch (err) {
      showError((err as Error).message || 'Ошибка загрузки игроков');
    } finally {
      setLoading(false);
    }
  }, [token, partner]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  const columns: Column<AffiliateReferral>[] = [
    { key: 'name', title: 'Игрок', render: (r) => <span className="font-semibold text-white">{r.name}</span> },
    { key: 'sourceName', title: 'Источник', render: (r) => <span className="text-white/80">{r.sourceName}</span> },
    { key: 'depositsSum', title: 'Депозиты', align: 'right', width: '120px', render: (r) => formatRub(r.depositsSum) },
    {
      key: 'income',
      title: 'Доход',
      align: 'right',
      width: '120px',
      render: (r) => <span className="font-semibold text-blue-400">{formatRub(r.income)}</span>,
    },
  ];

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100]">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} aria-hidden="true" />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-[640px] flex-col border-l border-white/10 bg-background">
        <header className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-base font-bold text-white">Игроки · {partner?.name ?? ''}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Закрыть"
            className="rounded-button p-2 text-white/60 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-5">
          {partner?.commissionPercent !== undefined && (
            <p className="mb-4 text-sm text-muted-foreground">
              Комиссия партнёра: <span className="font-semibold text-white">{partner.commissionPercent}%</span> с депозита
              игрока
            </p>
          )}
          <DataTable
            columns={columns}
            data={items}
            rowKey={(r) => r.userId}
            loading={loading}
            emptyText="Привлечённых игроков пока нет"
            pageSize={15}
          />
        </div>
      </aside>
    </div>
  );
}
