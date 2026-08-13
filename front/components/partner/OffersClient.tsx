'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Download, Pencil, Search, Trash2 } from 'lucide-react';
import { usePartnerAuth } from '@/components/partner/PartnerShell';
import { SourceModal } from '@/components/partner/SourceModal';
import { formatDate, formatPercent, formatRub, shortCode } from '@/components/partner/format';
import {
  DataTable,
  Segmented,
  Tag,
  ConfirmModal,
  DateRange,
  type Column,
  btnGhost,
  btnIcon,
  inputClass,
  selectClass,
} from '@/components/partner/ui';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
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
  initialDefaultDomain?: string;
  initialItems?: AffiliateSourceItem[];
  initialTotal?: number;
}

export default function OffersClient({
  initialLoaded = false,
  initialGroups = [],
  initialRedirects = [],
  initialDomains = [],
  initialDefaultDomain = '',
  initialItems = [],
  initialTotal = 0,
}: OffersClientProps) {
  const { token } = usePartnerAuth();
  const [groups, setGroups] = useState<AffiliateGroup[]>(initialGroups);
  const [redirects, setRedirects] = useState<AffiliateRedirect[]>(initialRedirects);
  const [domains, setDomains] = useState<string[]>(initialDomains);
  const [defaultDomain, setDefaultDomain] = useState(initialDefaultDomain);
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
  const [deleting, setDeleting] = useState<AffiliateSourceItem | null>(null);
  const [deletingLoading, setDeletingLoading] = useState(false);

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
      showError((err as Error).message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [token, page, search, groupId, type, range]);

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
      showSuccess('Скопировано');
    } catch {
      showError('Не удалось скопировать');
    }
  }, []);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeletingLoading(true);
    try {
      await partnerApi.deleteSource(token, deleting.id);
      showSuccess('Источник удалён');
      setDeleting(null);
      void load();
    } catch (err) {
      showError((err as Error).message || 'Ошибка удаления');
    } finally {
      setDeletingLoading(false);
    }
  };

  const exportCsv = () => {
    const isPromo = type === 'promo';
    const header = isPromo
      ? ['Дата создания', 'Название', 'Тип', 'Код', 'Активации', 'Доход, руб', 'Оплат']
      : ['Дата создания', 'Название', 'Тип', 'Код', 'Все переходы', 'Уник. переходы', 'Регистрации', 'Доход, руб', 'Оплат', 'CR в оплату, %'];
    const rows = items.map((s) =>
      isPromo
        ? [s.createdAt, s.name, 'промокод', s.code, s.promos ?? 0, s.income, s.depositsCount]
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

  const columns: Column<AffiliateSourceItem>[] = useMemo(() => {
    const metricCols: Column<AffiliateSourceItem>[] =
      type === 'promo'
        ? [
            {
              key: 'promos',
              title: 'Активации',
              align: 'right',
              width: '110px',
              render: (s) => (s.promos ?? 0).toLocaleString('ru-RU'),
            },
          ]
        : [
            {
              key: 'clicks',
              title: 'Все переходы',
              align: 'right',
              width: '110px',
              render: (s) => (s.type === 'promo' ? <span className="text-muted-foreground">—</span> : s.clicks.toLocaleString('ru-RU')),
            },
            {
              key: 'uniqueClicks',
              title: 'Уник. переходы',
              align: 'right',
              width: '120px',
              render: (s) => (s.type === 'promo' ? <span className="text-muted-foreground">—</span> : s.uniqueClicks.toLocaleString('ru-RU')),
            },
            {
              key: 'signups',
              title: 'Регистрации',
              align: 'right',
              width: '110px',
              render: (s) => (s.type === 'promo' ? <span className="text-muted-foreground">—</span> : s.signups.toLocaleString('ru-RU')),
            },
          ];

    const crCols: Column<AffiliateSourceItem>[] =
      type === 'promo'
        ? []
        : [
            {
              key: 'crPayment',
              title: 'CR в оплату',
              align: 'right',
              width: '110px',
              render: (s) => (s.type === 'promo' ? <span className="text-muted-foreground">—</span> : formatPercent(s.crPayment)),
            },
          ];

    return [
      {
        key: 'createdAt',
        title: 'Дата создания',
        width: '170px',
        render: (s) => <span className="text-sm whitespace-nowrap text-muted-foreground">{formatDate(s.createdAt)}</span>,
      },
      {
        key: 'source',
        title: 'Ссылка / Промокод',
        width: '320px',
        render: (s) => {
          const text = s.type === 'link' ? buildAffiliateLink(s.code, s.domain, defaultDomain) : s.code;
          return (
            <button
              type="button"
              onClick={() => void handleCopy(text)}
              className="flex min-w-0 items-center gap-2 text-left"
              title={text}
            >
              <Copy className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-white">{s.name}</span>
                <span className="block max-w-[240px] truncate text-xs text-muted-foreground">{shortCode(text)}</span>
              </span>
              <Tag color={s.type === 'link' ? 'blue' : 'green'}>{s.type === 'link' ? 'ссылка' : 'промо'}</Tag>
            </button>
          );
        },
      },
      ...metricCols,
      {
        key: 'income',
        title: 'Доход',
        align: 'right',
        width: '120px',
        render: (s) => <span className={cn('font-semibold', s.income > 0 ? 'text-money' : 'text-white')}>{formatRub(s.income)}</span>,
      },
      {
        key: 'depositsCount',
        title: 'Оплат',
        align: 'right',
        width: '90px',
        render: (s) => s.depositsCount.toLocaleString('ru-RU'),
      },
      ...crCols,
      {
        key: 'actions',
        title: '',
        align: 'right',
        width: '80px',
        render: (s) => (
          <div className="flex items-center justify-end gap-1">
            <button
              type="button"
              onClick={() => {
                setEditing(s);
                setModalOpen(true);
              }}
              className={btnIcon}
              aria-label="Редактировать"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setDeleting(s)} className={cn(btnIcon, 'hover:text-red-400')} aria-label="Удалить">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
      },
    ];
  }, [type, defaultDomain, handleCopy]);

  return (
    <section className="rounded-card border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <h2 className="text-base font-bold text-white">Источники трафика</h2>

        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={type}
            options={[
              { label: 'Все', value: 'all' },
              { label: 'Ссылки', value: 'link' },
              { label: 'Промокоды', value: 'promo' },
            ]}
            onChange={(v) => setType(v as 'all' | 'link' | 'promo')}
          />
          <select
            className={cn(selectClass, 'w-40')}
            value={groupId ?? ''}
            onChange={(e) => {
              setGroupId(e.target.value || undefined);
              setPage(1);
            }}
          >
            <option value="">Без потока</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
            <input
              className={cn(inputClass, 'w-52 pl-9')}
              placeholder="Поиск..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <DateRange
            value={range}
            onChange={(v) => {
              setRange(v);
              setPage(1);
            }}
          />
          <button type="button" className={btnGhost} onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" />
            Экспорт
          </button>
        </div>
      </div>

      <div className="p-4">
        <DataTable
          columns={columns}
          data={items}
          rowKey={(s) => s.id}
          loading={loading}
          emptyText="Источников пока нет"
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      </div>

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

      <ConfirmModal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Удалить источник?"
        description="Клики и регистрации источника будут удалены."
        loading={deletingLoading}
        onConfirm={() => void handleDelete()}
      />
    </section>
  );
}
