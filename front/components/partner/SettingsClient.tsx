'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Pencil, Plus, Save, Trash2, Users, Wallet } from 'lucide-react';
import { usePartnerAuth } from '@/components/partner/PartnerShell';
import { GroupModal } from '@/components/partner/GroupModal';
import { RedirectModal } from '@/components/partner/RedirectModal';
import { DomainModal } from '@/components/partner/DomainModal';
import { PartnerModal } from '@/components/partner/PartnerModal';
import { PartnerUsersDrawer } from '@/components/partner/PartnerUsersDrawer';
import {
  DataTable,
  Switch,
  Tag,
  ConfirmModal,
  type Column,
  btnIcon,
  btnPrimary,
  inputClass,
} from '@/components/partner/ui';
import { cn } from '@/lib/utils';
import { showError, showSuccess } from '@/lib/toast';
import { formatRub } from '@/components/partner/format';
import {
  partnerApi,
  type AffiliateGroup,
  type AffiliateRedirect,
  type AffiliateDomain,
  type AffiliatePartner,
} from '@/lib/api';

interface SettingsClientProps {
  initialLoaded?: boolean;
  initialGroups?: AffiliateGroup[];
  initialRedirects?: AffiliateRedirect[];
  initialDomains?: AffiliateDomain[];
  initialPartners?: AffiliatePartner[];
}

type TabKey = 'groups' | 'redirects' | 'domains' | 'partners';

interface ConfirmState {
  title: string;
  description: string;
  action: () => Promise<unknown>;
}

export default function SettingsClient({
  initialLoaded = false,
  initialGroups = [],
  initialRedirects = [],
  initialDomains = [],
  initialPartners = [],
}: SettingsClientProps) {
  const { token, partner } = usePartnerAuth();
  const isOwner = partner.isOwner;
  const isAdmin = partner.isAdmin;
  const canViewPartners = isOwner || isAdmin;
  const canManage = isOwner;
  const [groups, setGroups] = useState<AffiliateGroup[]>(initialGroups);
  const [redirects, setRedirects] = useState<AffiliateRedirect[]>(initialRedirects);
  const [domains, setDomains] = useState<AffiliateDomain[]>(initialDomains);
  const [partners, setPartners] = useState<AffiliatePartner[]>(initialPartners);
  const [loading, setLoading] = useState(!initialLoaded);
  const [tab, setTab] = useState<TabKey>('groups');

  const [groupModal, setGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<AffiliateGroup | null>(null);

  const [redirectModal, setRedirectModal] = useState(false);
  const [editingRedirect, setEditingRedirect] = useState<AffiliateRedirect | null>(null);

  const [domainModal, setDomainModal] = useState(false);
  const [editingDomain, setEditingDomain] = useState<AffiliateDomain | null>(null);

  const [partnerModal, setPartnerModal] = useState(false);
  const [editingPartner, setEditingPartner] = useState<AffiliatePartner | null>(null);

  const [usersDrawerPartner, setUsersDrawerPartner] = useState<AffiliatePartner | null>(null);
  const [usersDrawerOpen, setUsersDrawerOpen] = useState(false);

  const [commissionDrafts, setCommissionDrafts] = useState<Record<string, string>>({});
  const [savingCommission, setSavingCommission] = useState<Record<string, boolean>>({});

  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  const skipData = useRef(initialLoaded);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, r, d, p] = await Promise.all([
        partnerApi.groups(token),
        partnerApi.redirects(token),
        partnerApi.domains(token),
        canViewPartners ? partnerApi.partners(token) : Promise.resolve({ items: [] as AffiliatePartner[] }),
      ]);
      setGroups(g.items);
      setRedirects(r.items);
      setDomains(d.items);
      setPartners(p.items);
    } catch (err) {
      showError((err as Error).message || 'Ошибка загрузки');
    } finally {
      setLoading(false);
    }
  }, [token, canViewPartners]);

  useEffect(() => {
    if (skipData.current) {
      skipData.current = false;
      return;
    }
    void load();
  }, [load]);

  const handleConfirm = async () => {
    if (!confirm) return;
    setConfirmLoading(true);
    try {
      await confirm.action();
      setConfirm(null);
      void load();
    } catch (err) {
      showError((err as Error).message || 'Ошибка');
    } finally {
      setConfirmLoading(false);
    }
  };

  const saveCommission = async (p: AffiliatePartner) => {
    const raw = commissionDrafts[p.id];
    if (raw === undefined) return;
    const value = Number(raw);
    if (!Number.isFinite(value)) return;
    setSavingCommission((prev) => ({ ...prev, [p.id]: true }));
    try {
      const res = await partnerApi.updatePartner(token, p.id, { commissionPercent: value });
      setPartners((prev) => prev.map((it) => (it.id === p.id ? { ...it, commissionPercent: res.partner.commissionPercent } : it)));
      setCommissionDrafts((prev) => {
        const next = { ...prev };
        delete next[p.id];
        return next;
      });
      showSuccess('Комиссия сохранена');
    } catch (err) {
      showError((err as Error).message || 'Ошибка сохранения комиссии');
    } finally {
      setSavingCommission((prev) => ({ ...prev, [p.id]: false }));
    }
  };

  const draftFor = (p: AffiliatePartner): string => commissionDrafts[p.id] ?? String(p.commissionPercent);

  const totalBalance = useMemo(() => partners.reduce((acc, p) => acc + p.balance, 0), [partners]);

  const toggleAdmin = async (p: AffiliatePartner, value: boolean) => {
    try {
      const res = await partnerApi.updatePartner(token, p.id, { isAdmin: value });
      setPartners((prev) => prev.map((it) => (it.id === p.id ? { ...it, isAdmin: res.partner.isAdmin } : it)));
      showSuccess(value ? `Партнёр ${p.name} теперь админ` : `Админ-права партнёра ${p.name} сняты`);
    } catch (err) {
      showError((err as Error).message || 'Ошибка изменения роли');
    }
  };

  const groupColumns: Column<AffiliateGroup>[] = [
    { key: 'name', title: 'Название', render: (g) => <span className="font-semibold text-white">{g.name}</span> },
    {
      key: 'comment',
      title: 'Комментарий',
      render: (g) => (g.comment ? <span className="text-white/80">{g.comment}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      width: '100px',
      render: (g) => (
        <div className="flex items-center justify-end gap-1">
          <button type="button" className={btnIcon} onClick={() => { setEditingGroup(g); setGroupModal(true); }} aria-label="Редактировать">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn(btnIcon, 'hover:text-red-400')}
            onClick={() =>
              setConfirm({ title: 'Удалить поток?', description: 'Источники потока останутся без группы.', action: () => partnerApi.deleteGroup(token, g.id) })
            }
            aria-label="Удалить"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const redirectColumns: Column<AffiliateRedirect>[] = [
    { key: 'name', title: 'Название', render: (r) => <span className="font-semibold text-white">{r.name}</span> },
    {
      key: 'urls',
      title: 'Ссылок',
      width: '110px',
      render: (r) => {
        const active = r.urls.filter((u) => u.isActive).length;
        return <Tag color={active > 0 ? 'blue' : 'zinc'}>{active} активн.</Tag>;
      },
    },
    {
      key: 'comment',
      title: 'Комментарий',
      render: (r) => (r.comment ? <span className="text-white/80">{r.comment}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      width: '100px',
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button type="button" className={btnIcon} onClick={() => { setEditingRedirect(r); setRedirectModal(true); }} aria-label="Редактировать">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn(btnIcon, 'hover:text-red-400')}
            onClick={() =>
              setConfirm({ title: 'Удалить редирект?', description: 'Ссылки редиректа будут удалены.', action: () => partnerApi.deleteRedirect(token, r.id) })
            }
            aria-label="Удалить"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const domainColumns: Column<AffiliateDomain>[] = [
    { key: 'url', title: 'Домен', render: (d) => <span className="font-semibold text-white">{d.url}</span> },
    {
      key: 'isActive',
      title: 'Статус',
      width: '120px',
      render: (d) => <Tag color={d.isActive ? 'green' : 'zinc'}>{d.isActive ? 'Активен' : 'Выключен'}</Tag>,
    },
    {
      key: 'comment',
      title: 'Комментарий',
      render: (d) => (d.comment ? <span className="text-white/80">{d.comment}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      width: '100px',
      render: (d) => (
        <div className="flex items-center justify-end gap-1">
          <button type="button" className={btnIcon} onClick={() => { setEditingDomain(d); setDomainModal(true); }} aria-label="Редактировать">
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            className={cn(btnIcon, 'hover:text-red-400')}
            onClick={() =>
              setConfirm({
                title: 'Удалить домен?',
                description: 'Источники, ссылающиеся на него, перестанут резолвить ссылку.',
                action: () => partnerApi.deleteDomain(token, d.id),
              })
            }
            aria-label="Удалить"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const partnerColumns: Column<AffiliatePartner>[] = [
    { key: 'name', title: 'Имя', render: (p) => <span className="font-semibold text-white">{p.name}</span> },
    { key: 'email', title: 'Email', render: (p) => <span className="text-white/80">{p.email}</span> },
    {
      key: 'status',
      title: 'Статус',
      width: '150px',
      render: (p) => {
        if (p.isOwner) return <Tag color="gold">Владелец</Tag>;
        return <Tag color={p.isActive ? 'green' : 'amber'}>{p.isActive ? 'Активен' : 'Ожидает одобрения'}</Tag>;
      },
    },
    {
      key: 'role',
      title: 'Админ',
      width: '120px',
      render: (p) => {
        if (p.isOwner) return <span className="text-muted-foreground">—</span>;
        if (canManage) return <Switch checked={p.isAdmin} onChange={(v) => void toggleAdmin(p, v)} aria-label="Админ" />;
        return p.isAdmin ? <Tag color="blue">Админ</Tag> : <span className="text-muted-foreground">—</span>;
      },
    },
    {
      key: 'balance',
      title: 'Баланс',
      align: 'right',
      width: '140px',
      render: (p) => (
        <span className={cn('font-semibold', p.balance > 0 ? 'text-money' : 'text-white')}>{formatRub(p.balance)}</span>
      ),
    },
    {
      key: 'commission',
      title: 'Комиссия, %',
      width: '210px',
      render: (p) => {
        if (p.isOwner) return <span className="text-muted-foreground">—</span>;
        if (!canManage) return <span className="text-white/80">{p.commissionPercent}%</span>;
        const draft = draftFor(p);
        const changed = draft !== String(p.commissionPercent);
        return (
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={100}
              step={1}
              className={cn(inputClass, 'w-20 px-3 py-1.5 text-xs')}
              value={draft}
              onChange={(e) => setCommissionDrafts((prev) => ({ ...prev, [p.id]: e.target.value }))}
            />
            <button
              type="button"
              className={cn(btnPrimary, 'px-3 py-1.5 text-xs')}
              disabled={!changed || savingCommission[p.id]}
              onClick={() => void saveCommission(p)}
            >
              <Save className="h-3.5 w-3.5" />
              Сохранить
            </button>
          </div>
        );
      },
    },
    {
      key: 'comment',
      title: 'Комментарий',
      render: (p) => (p.comment ? <span className="text-white/80">{p.comment}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      key: 'actions',
      title: '',
      align: 'right',
      width: '180px',
      render: (p) => (
        <div className="flex items-center justify-end gap-1">
          <button
            type="button"
            className={btnIcon}
            title="Игроки"
            onClick={() => {
              setUsersDrawerPartner(p);
              setUsersDrawerOpen(true);
            }}
            aria-label="Игроки"
          >
            <Users className="h-3.5 w-3.5" />
          </button>
          {canManage && (
            <>
              {!p.isActive && !p.isOwner && (
                <button
                  type="button"
                  className={cn(btnPrimary, 'px-3 py-1.5 text-xs')}
                  onClick={async () => {
                    await partnerApi.updatePartner(token, p.id, { isActive: true });
                    showSuccess(`Партнёр ${p.name} одобрен`);
                    void load();
                  }}
                >
                  <Check className="h-3.5 w-3.5" />
                  Одобрить
                </button>
              )}
              <button type="button" className={btnIcon} onClick={() => { setEditingPartner(p); setPartnerModal(true); }} aria-label="Редактировать">
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {!p.isOwner && (
                <button
                  type="button"
                  className={cn(btnIcon, 'hover:text-red-400')}
                  onClick={() =>
                    setConfirm({
                      title: 'Удалить партнёра?',
                      description: 'Все его источники и статистика будут удалены.',
                      action: () => partnerApi.deletePartner(token, p.id),
                    })
                  }
                  aria-label="Удалить"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  const tabs: Array<{ key: TabKey; label: string; hidden?: boolean }> = [
    { key: 'groups', label: 'Потоки', hidden: !canManage },
    { key: 'redirects', label: 'Редиректы', hidden: !canManage },
    { key: 'domains', label: 'Домены', hidden: !canManage },
    { key: 'partners', label: 'Партнёры', hidden: !canViewPartners },
  ];

  const visibleTabs = tabs.filter((t) => !t.hidden);
  const activeTab = visibleTabs.some((t) => t.key === tab) ? tab : (visibleTabs[0]?.key ?? 'partners');

  const addButtons: Array<{ label: string; hidden?: boolean; onClick: () => void }> = [
    {
      label: 'Партнёр',
      hidden: !isOwner,
      onClick: () => {
        setEditingPartner(null);
        setPartnerModal(true);
      },
    },
    {
      label: 'Поток',
      onClick: () => {
        setEditingGroup(null);
        setGroupModal(true);
      },
    },
    {
      label: 'Редирект',
      onClick: () => {
        setEditingRedirect(null);
        setRedirectModal(true);
      },
    },
    {
      label: 'Домен',
      onClick: () => {
        setEditingDomain(null);
        setDomainModal(true);
      },
    },
  ];

  return (
    <section className="rounded-card border border-white/10 bg-white/[0.02]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
        <nav className="flex items-center gap-1">
          {visibleTabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                'rounded-button px-sm py-xs text-sm font-medium transition-colors',
                activeTab === t.key
                  ? 'bg-sidebar-accent text-sidebar-primary'
                  : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground',
              )}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          {addButtons
            .filter((b) => !b.hidden)
            .map((b) => (
              <button key={b.label} type="button" className={btnPrimary} onClick={b.onClick}>
                <Plus className="h-4 w-4" />
                {b.label}
              </button>
            ))}
        </div>
      </div>

      <div className="p-4">
        {activeTab === 'groups' && (
          <DataTable columns={groupColumns} data={groups} rowKey={(g) => g.id} loading={loading} emptyText="Потоков пока нет" />
        )}
        {activeTab === 'redirects' && (
          <DataTable columns={redirectColumns} data={redirects} rowKey={(r) => r.id} loading={loading} emptyText="Редиректов пока нет" />
        )}
        {activeTab === 'domains' && (
          <DataTable columns={domainColumns} data={domains} rowKey={(d) => d.id} loading={loading} emptyText="Доменов пока нет" />
        )}
        {activeTab === 'partners' && canViewPartners && (
          <>
            <div className="mb-4 flex items-center gap-3 rounded-panel border border-white/10 bg-white/[0.02] p-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-button bg-blue-500/15">
                <Wallet className="h-5 w-5 text-blue-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs text-muted-foreground">Общий баланс партнёров</div>
                <div className="text-xl font-bold text-money">{formatRub(totalBalance)}</div>
                <div className="text-xs text-muted-foreground">{partners.length} партнёров</div>
              </div>
            </div>
            <DataTable columns={partnerColumns} data={partners} rowKey={(p) => p.id} loading={loading} emptyText="Партнёров пока нет" />
          </>
        )}
      </div>

      <GroupModal open={groupModal} token={token} initial={editingGroup} onClose={() => setGroupModal(false)} onSaved={() => void load()} />
      <RedirectModal open={redirectModal} token={token} initial={editingRedirect} onClose={() => setRedirectModal(false)} onSaved={() => void load()} />
      <DomainModal open={domainModal} token={token} initial={editingDomain} onClose={() => setDomainModal(false)} onSaved={() => void load()} />
      {isOwner && (
        <PartnerModal open={partnerModal} token={token} initial={editingPartner} onClose={() => setPartnerModal(false)} onSaved={() => void load()} />
      )}
      {canViewPartners && (
        <PartnerUsersDrawer open={usersDrawerOpen} token={token} partner={usersDrawerPartner} onClose={() => setUsersDrawerOpen(false)} />
      )}

      <ConfirmModal
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm?.title ?? ''}
        description={confirm?.description ?? ''}
        loading={confirmLoading}
        onConfirm={() => void handleConfirm()}
      />
    </section>
  );
}
