'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download, Users, Wallet } from 'lucide-react';
import { usePartnerAuth } from '@/components/partner/PartnerShell';
import { formatRub, formatDate, todayStr } from '@/components/partner/format';
import { DataTable, DateRange, Tag, type Column, btnGhost } from '@/components/partner/ui';
import { partnerApi, type AffiliateReferral } from '@/lib/api';
import { showError } from '@/lib/toast';

interface ReferralsClientProps {
  initialLoaded?: boolean;
  initialItems?: AffiliateReferral[];
  initialSum?: number;
}

const DEFAULT_RANGE: [string, string] | null = null;

export default function ReferralsClient({ initialLoaded = false, initialItems = [], initialSum = 0 }: ReferralsClientProps) {
  const { token } = usePartnerAuth();
  const [range, setRange] = useState<[string, string] | null>(DEFAULT_RANGE);
  const [items, setItems] = useState<AffiliateReferral[]>(initialItems);
  const [sum, setSum] = useState(initialSum);
  const [loading, setLoading] = useState(!initialLoaded);

  const skipData = useRef(initialLoaded);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await partnerApi.referrals(token, range?.[0] || undefined, range?.[1] || undefined);
      setItems(data.items);
      setSum(data.sum);
    } catch (err) {
      showError((err as Error).message || 'Ошибка загрузки рефералов');
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
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `referrals-${todayStr()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const columns: Column<AffiliateReferral>[] = [
    { key: 'name', title: 'Игрок', render: (r) => <span className="font-semibold text-white">{r.name}</span> },
    {
      key: 'kind',
      title: 'Тип',
      width: '130px',
      render: (r) => <Tag color={r.kind === 'promo' ? 'purple' : 'blue'}>{r.kind === 'promo' ? 'Промокод' : 'Регистрация'}</Tag>,
    },
    { key: 'sourceName', title: 'Источник', render: (r) => <span className="text-white/80">{r.sourceName}</span> },
    { key: 'depositsSum', title: 'Депозиты', align: 'right', width: '130px', render: (r) => formatRub(r.depositsSum) },
    {
      key: 'income',
      title: 'Доход',
      align: 'right',
      width: '140px',
      render: (r) => <span className="font-semibold text-blue-400">{formatRub(r.income)}</span>,
    },
    {
      key: 'createdAt',
      title: 'Дата',
      width: '170px',
      render: (r) => <span className="text-sm whitespace-nowrap text-muted-foreground">{formatDate(r.createdAt)}</span>,
    },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-white">Рефералы</h2>
          <p className="mt-1 text-sm text-muted-foreground">Игроки, пришедшие по вашим офферам</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRange value={range} onChange={setRange} />
          <button type="button" className={btnGhost} onClick={exportCsv} disabled={items.length === 0}>
            <Download className="h-3.5 w-3.5" />
            Экспорт
          </button>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-card border border-white/10 bg-white/[0.02] p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-blue-500/15">
            <Users className="h-5 w-5 text-blue-400" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Игроков приведено</div>
            <div className="text-lg font-bold text-white">{items.length.toLocaleString('ru-RU')}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-card border border-white/10 bg-white/[0.02] p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-emerald-500/15">
            <Wallet className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Доход за период</div>
            <div className="text-lg font-bold text-white">{formatRub(sum)}</div>
          </div>
        </div>
      </div>

      <section className="rounded-card border border-white/10 bg-white/[0.02]">
        <div className="p-4">
          <DataTable
            columns={columns}
            data={items}
            rowKey={(r) => `${r.userId}-${r.kind}`}
            loading={loading}
            emptyText="Рефералов пока нет"
            pageSize={25}
          />
        </div>
      </section>
    </div>
  );
}
