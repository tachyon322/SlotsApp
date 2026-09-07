'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Zap,
  Gift,
  Sparkles,
  Trophy,
  TrendingDown,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useTopUpModal } from '@/components/TopUpModal';
import { useWithdrawModal } from '@/components/WithdrawModal';
import { useAuthModal } from '@/components/AuthModal';
import { useVerificationModal } from '@/components/VerificationModal';
import { usePromoModal } from '@/components/PromoModal';
import { VerificationFailedModal } from '@/components/VerificationFailedModal';
import { walletApi, type WalletHistoryItem, type WithdrawActiveResponse, type WithdrawRequestItem } from '@/lib/api';

const WITHDRAWAL_PROCESSING_MS = 10 * 1000;

function formatRub(amount: number): string {
  const isNegative = amount < 0;
  const absVal = Math.abs(amount);
  const formatted = absVal.toLocaleString('ru-RU');
  return `${isNegative ? '-' : ''}${formatted}\u00A0₽`;
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString);
    return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

function getGroupDateLabel(isoString: string): string {
  try {
    const d = new Date(isoString);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return 'Сегодня';
    }
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Вчера';
    }
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  } catch {
    return 'История';
  }
}

interface GroupedHistory {
  dateLabel: string;
  items: WalletHistoryItem[];
}

export default function WalletPage() {
  const { user, isLoading: userLoading, refresh: refreshUser } = useUser();
  const { openTopUp } = useTopUpModal();
  const { openWithdraw } = useWithdrawModal();
  const { openAuth } = useAuthModal();
  const { openVerification } = useVerificationModal();
  const { openPromo } = usePromoModal();

  const [activeTab, setActiveTab] = useState('all');
  const [transactions, setTransactions] = useState<WalletHistoryItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [txLoading, setTxLoading] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Active withdrawal + failed requests for timer / verification CTA
  const [activeData, setActiveData] = useState<WithdrawActiveResponse | null>(null);
  const [failedRequests, setFailedRequests] = useState<WithdrawRequestItem[]>([]);
  const [now, setNow] = useState(() => Date.now());

  const loadTransactions = useCallback(async (tab: string, cursor?: string, append = false) => {
    setTxLoading(true);
    try {
      const res = await walletApi.transactions(tab, cursor);
      setTransactions((current) => append ? [...current, ...res.items] : res.items);
      setCounts(res.counts);
      setNextCursor(res.nextCursor);
    } catch {
      if (!append) setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  }, []);

  const loadActive = useCallback(async () => {
    if (!user) {
      setActiveData(null);
      return;
    }
    try {
      const res = await walletApi.withdrawActive();
      setActiveData(res);
      setNow(Date.now());
    } catch {
      setActiveData(null);
    }
  }, [user]);

  const loadFailed = useCallback(async () => {
    if (!user) {
      setFailedRequests([]);
      return;
    }
    try {
      const res = await walletApi.withdrawRequests();
      setFailedRequests(res.items);
    } catch {
      setFailedRequests([]);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      setNextCursor(null);
      loadTransactions(activeTab);
    }
  }, [user, activeTab, loadTransactions]);

  useEffect(() => {
    if (!user) return;
    loadActive();
    loadFailed();
    const onCreated = () => {
      loadActive();
      loadFailed();
      loadTransactions(activeTab);
    };
    const onSettled = () => {
      loadActive();
      loadFailed();
      loadTransactions(activeTab);
      refreshUser();
    };
    const onVerified = () => {
      loadActive();
      loadFailed();
    };
    window.addEventListener('withdraw-created', onCreated);
    window.addEventListener('withdraw-settled', onSettled);
    window.addEventListener('verification-paid', onVerified);
    window.addEventListener('verification-submitted', onVerified);
    window.addEventListener('focus', onVerified);
    return () => {
      window.removeEventListener('withdraw-created', onCreated);
      window.removeEventListener('withdraw-settled', onSettled);
      window.removeEventListener('verification-paid', onVerified);
      window.removeEventListener('verification-submitted', onVerified);
      window.removeEventListener('focus', onVerified);
    };
  }, [user, loadActive, loadFailed, loadTransactions, activeTab, refreshUser]);

  // Smart polling: only when there is active pending or failed request to keep alive
  useEffect(() => {
    if (!user) return;
    const shouldPoll = Boolean(activeData?.request || failedRequests.length > 0);
    if (!shouldPoll) return;
    const interval = setInterval(() => {
      loadActive();
      // Poll failed only if there is something failed; otherwise event-driven is enough
      if (failedRequests.length > 0) loadFailed();
      else if (activeData?.request) loadFailed();
    }, 30000);
    return () => clearInterval(interval);
  }, [user, activeData?.request, failedRequests.length, loadActive, loadFailed]);

  // Tick for timer - also triggers settlement check when deadline passes (like ActiveWithdrawalCard)
  useEffect(() => {
    const request = activeData?.request;
    if (!request) return;
    const processingUntilMs = request.processingUntil
      ? new Date(request.processingUntil).getTime()
      : new Date(request.createdAt).getTime() + WITHDRAWAL_PROCESSING_MS;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= processingUntilMs) {
        loadActive();
        loadFailed();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [activeData?.request, loadActive, loadFailed]);

  // Промокод активируется в модалке (usePromoModal): обновляем историю,
  // когда изменился баланс (бонус приходит операцией).
  const lastBalanceRef = useRef<number | null>(user?.balance ?? null);
  useEffect(() => {
    const balance = user?.balance ?? null;
    if (balance !== null && lastBalanceRef.current !== null && balance !== lastBalanceRef.current) {
      loadTransactions(activeTab);
    }
    lastBalanceRef.current = balance;
  }, [user?.balance, activeTab, loadTransactions]);

  const toggleGroup = (dateLabel: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [dateLabel]: !prev[dateLabel] }));
  };

  // Group transactions by date
  const groupedTransactions: GroupedHistory[] = [];
  for (const item of transactions) {
    const label = getGroupDateLabel(item.createdAt);
    let group = groupedTransactions.find((g) => g.dateLabel === label);
    if (!group) {
      group = { dateLabel: label, items: [] };
      groupedTransactions.push(group);
    }
    group.items.push(item);
  }

  const filterTabs = [
    { id: 'all', label: 'Все', count: counts.all ?? 0 },
    { id: 'games', label: 'Игры', count: counts.games ?? 0 },
    { id: 'bonuses', label: 'Бонусы', count: counts.bonuses ?? 0 },
    { id: 'wins', label: 'Выигрыши', count: counts.wins ?? 0 },
    { id: 'deposits', label: 'Пополнения', count: counts.deposits ?? 0 },
    { id: 'withdrawals', label: 'Выводы', count: counts.withdrawals ?? 0 },
    { id: 'losses', label: 'Проигрыши', count: counts.losses ?? 0 },
  ];

  const failedMap = new Map(failedRequests.map(r => [r.id, r]));
  const needVerificationRequest = failedRequests.find(r => r.code === 'need_verification') ?? null;
  const activeRequest = activeData?.request;

  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsRequest = detailsId ? failedRequests.find(r => r.id === detailsId) ?? null : null;

  const handleVerifyFromWallet = async (req: WithdrawRequestItem | null) => {
    const target = req ?? needVerificationRequest;
    if (!target) return;
    const ok = await openVerification({
      amount: target.amount,
      method: target.method ?? 'СБП',
      requisites: target.requisites ?? null,
    });
    if (ok) {
      loadFailed();
      loadActive();
      loadTransactions(activeTab);
    }
  };

  const handleDetailsFromWallet = (req: WithdrawRequestItem | null) => {
    const target = req ?? needVerificationRequest;
    if (!target) return;
    setDetailsId(target.id);
  };

  const handleDetailsClose = () => {
    setDetailsId(null);
  };

  // Финансовые действия: для гостя — сначала вход
  const handleDeposit = () => (user ? openTopUp() : openAuth('signin'));
  const handleWithdraw = () => (user ? openWithdraw() : openAuth('signin'));

  return (
    <div className="wl-surface">
      {/* Шапка страницы */}
      <header className="wl-pageHeader">
        <div>
          <span className="wl-eyebrow">Баланс и операции</span>
          <h1>Кошелёк</h1>
        </div>
      </header>

      {userLoading ? (
        <>
          <div className="wl-loadingHero" aria-hidden="true" />
          <div className="wl-loadingPanel" aria-hidden="true" />
        </>
      ) : (
        <>
          {/* Управление балансом: хиро + карточки */}
          <section className="wl-commandGrid" aria-label="Управление балансом">
            <article className="wl-balanceHero">
              <span className="wl-heroGrid" aria-hidden="true" />
              <span className="wl-orbit" aria-hidden="true" />
              <picture className="wl-energyField" aria-hidden="true">
                <source
                  type="image/avif"
                  srcSet="/images/web-hub/v1/pages/wallet/wallet-balance-energy-field-640w.avif 640w, /images/web-hub/v1/pages/wallet/wallet-balance-energy-field-960w.avif 960w, /images/web-hub/v1/pages/wallet/wallet-balance-energy-field-1440w.avif 1440w"
                  sizes="(max-width: 640px) 300px, (max-width: 1180px) 54vw, 620px"
                />
                <source
                  type="image/webp"
                  srcSet="/images/web-hub/v1/pages/wallet/wallet-balance-energy-field-640w.webp 640w, /images/web-hub/v1/pages/wallet/wallet-balance-energy-field-960w.webp 960w, /images/web-hub/v1/pages/wallet/wallet-balance-energy-field-1440w.webp 1440w"
                  sizes="(max-width: 640px) 300px, (max-width: 1180px) 54vw, 620px"
                />
                <img
                  src="/images/web-hub/v1/pages/wallet/wallet-balance-energy-field-960w.webp"
                  width={960}
                  height={432}
                  sizes="(max-width: 640px) 300px, (max-width: 1180px) 54vw, 620px"
                  alt=""
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              </picture>
              <picture className="wl-balanceCore" aria-hidden="true">
                <source
                  type="image/avif"
                  srcSet="/images/web-hub/v1/pages/wallet/wallet-balance-core-320w.avif 320w, /images/web-hub/v1/pages/wallet/wallet-balance-core-480w.avif 480w, /images/web-hub/v1/pages/wallet/wallet-balance-core-640w.avif 640w"
                  sizes="(max-width: 640px) 240px, (max-width: 1180px) 32vw, 390px"
                />
                <source
                  type="image/webp"
                  srcSet="/images/web-hub/v1/pages/wallet/wallet-balance-core-320w.webp 320w, /images/web-hub/v1/pages/wallet/wallet-balance-core-480w.webp 480w, /images/web-hub/v1/pages/wallet/wallet-balance-core-640w.webp 640w"
                  sizes="(max-width: 640px) 240px, (max-width: 1180px) 32vw, 390px"
                />
                <img
                  src="/images/web-hub/v1/pages/wallet/wallet-balance-core-640w.webp"
                  width={640}
                  height={640}
                  sizes="(max-width: 640px) 240px, (max-width: 1180px) 32vw, 390px"
                  alt=""
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              </picture>
              <picture className="wl-hudOverlay" aria-hidden="true">
                <source
                  type="image/avif"
                  srcSet="/images/web-hub/v1/pages/wallet/wallet-finance-hud-overlay-640w.avif 640w, /images/web-hub/v1/pages/wallet/wallet-finance-hud-overlay-960w.avif 960w"
                  sizes="(max-width: 640px) 280px, 440px"
                />
                <source
                  type="image/webp"
                  srcSet="/images/web-hub/v1/pages/wallet/wallet-finance-hud-overlay-640w.webp 640w, /images/web-hub/v1/pages/wallet/wallet-finance-hud-overlay-960w.webp 960w"
                  sizes="(max-width: 640px) 280px, 440px"
                />
                <img
                  src="/images/web-hub/v1/pages/wallet/wallet-finance-hud-overlay-640w.webp"
                  width={640}
                  height={288}
                  sizes="(max-width: 640px) 280px, 440px"
                  alt=""
                  loading="eager"
                  decoding="async"
                  draggable={false}
                />
              </picture>
              <span className="wl-balanceLabel">Баланс LITGAME</span>
              <strong className="wl-balanceAmount">{formatRub(user?.balance ?? 0)}</strong>
              <span className="wl-balanceCaption">{user ? 'Данные обновлены' : 'Войдите в аккаунт'}</span>
              <div className="wl-moneyActions">
                <button type="button" className="wl-primaryAction" onClick={handleDeposit} aria-label="Пополнить баланс">
                  <Plus aria-hidden="true" /> Пополнить
                </button>
                <button type="button" className="wl-secondaryAction" onClick={handleWithdraw} aria-label="Вывести средства">
                  <ArrowUpRight aria-hidden="true" /> Вывести
                </button>
              </div>
            </article>

            <aside className="wl-sideRail">
              <button type="button" className="wl-rewardCard" onClick={handleDeposit} aria-label="Открыть первое пополнение">
                <span className="wl-cardIcon" aria-hidden="true">
                  <Plus />
                </span>
                <span>
                  <small>Пополнение</small>
                  <strong>Пополнить баланс</strong>
                  <em>Сумма и доступные способы оплаты — при оформлении</em>
                </span>
                <Zap aria-hidden="true" />
                <picture className="wl-cardArt" aria-hidden="true">
                  <source
                    type="image/avif"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-token-main-320w.avif 320w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-main-480w.avif 480w"
                    sizes="110px"
                  />
                  <source
                    type="image/webp"
                    srcSet="/images/web-hub/v1/modals/family-a-deposit/deposit-token-main-320w.webp 320w, /images/web-hub/v1/modals/family-a-deposit/deposit-token-main-480w.webp 480w"
                    sizes="110px"
                  />
                  <img
                    src="/images/web-hub/v1/modals/family-a-deposit/deposit-token-main-480w.webp"
                    width={480}
                    height={480}
                    sizes="110px"
                    alt=""
                    loading="eager"
                    decoding="async"
                    draggable={false}
                  />
                </picture>
              </button>
              <button type="button" className="wl-promoCard" onClick={openPromo} aria-label="Ввести промокод">
                <span className="wl-cardIcon" aria-hidden="true">
                  <Gift />
                </span>
                <span>
                  <small>Промокод</small>
                  <strong>Ввести промокод</strong>
                  <em>Результат проверки появится здесь</em>
                </span>
                <Sparkles aria-hidden="true" />
                <picture className="wl-cardArt" aria-hidden="true">
                  <source
                    type="image/avif"
                    srcSet="/images/web-hub/v1/modals/family-b-promo/promo-ticket-main-320w.avif 320w, /images/web-hub/v1/modals/family-b-promo/promo-ticket-main-480w.avif 480w"
                    sizes="110px"
                  />
                  <source
                    type="image/webp"
                    srcSet="/images/web-hub/v1/modals/family-b-promo/promo-ticket-main-320w.webp 320w, /images/web-hub/v1/modals/family-b-promo/promo-ticket-main-480w.webp 480w"
                    sizes="110px"
                  />
                  <img
                    src="/images/web-hub/v1/modals/family-b-promo/promo-ticket-main-480w.webp"
                    width={480}
                    height={480}
                    sizes="110px"
                    alt=""
                    loading="eager"
                    decoding="async"
                    draggable={false}
                  />
                </picture>
              </button>
            </aside>
          </section>

          {/* Плаши активной заявки на вывод / верификации (референс: pendingRail) */}
          {(activeRequest || needVerificationRequest) && (
            <section className="wl-pendingRail" aria-label="Заявка на вывод">
              <header>
                <span className="wl-pulseDot" aria-hidden="true" />
                Заявка на вывод
              </header>
              <div className="wl-pendingList">
                {activeRequest && (
                  <article>
                    <span>
                      {[activeRequest.method, activeRequest.details].filter(Boolean).join(' · ') || 'Проверка реквизитов'}
                    </span>
                    <strong>{formatRub(activeRequest.amount)}</strong>
                  </article>
                )}
                {needVerificationRequest && (
                  <article>
                    <span>Требуется верификация реквизитов</span>
                    <strong>{formatRub(needVerificationRequest.amount)}</strong>
                  </article>
                )}
              </div>
            </section>
          )}

          {/* История операций */}
          <section className="wl-historyWorkspace" aria-label="История операций">
            <header className="wl-historyHeading">
              <div>
                <span className="wl-eyebrow">Операции</span>
                <h2 className="wl-sectionTitle">История операций</h2>
              </div>
              <span className="wl-syncState" aria-live="polite">
                <span className="wl-syncDot" data-loading={txLoading} aria-hidden="true" />
                <span className="wl-syncLabel">{txLoading ? 'Обновляем' : 'Актуально'}</span>
              </span>
            </header>
            <div className="wl-historyLayout">
              <nav className="wl-historyFilters" aria-label="Фильтр истории">
                {filterTabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className="wl-filterButton"
                      data-active={isActive}
                      aria-pressed={isActive}
                      onClick={() => setActiveTab(tab.id)}
                    >
                      <span>{tab.label}</span>
                      <span className="wl-filterCount" data-count-resolved="true">
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </nav>
              <div className="wl-historyFeed" role="region" aria-label="Операции">
                {txLoading && transactions.length === 0 ? (
                  <div className="wl-loadingPanel" aria-hidden="true" />
                ) : !user ? (
                  <div className="wl-historyEmpty" data-wallet-history-empty="true">
                    <picture className="wl-emptyArt" aria-hidden="true">
                      <source
                        type="image/avif"
                        srcSet="/images/web-hub/v1/pages/wallet/wallet-history-empty-240w.avif 240w, /images/web-hub/v1/pages/wallet/wallet-history-empty-320w.avif 320w"
                        sizes="112px"
                      />
                      <source
                        type="image/webp"
                        srcSet="/images/web-hub/v1/pages/wallet/wallet-history-empty-240w.webp 240w, /images/web-hub/v1/pages/wallet/wallet-history-empty-320w.webp 320w"
                        sizes="112px"
                      />
                      <img
                        src="/images/web-hub/v1/pages/wallet/wallet-history-empty-320w.webp"
                        width={320}
                        height={320}
                        sizes="112px"
                        alt=""
                        loading="eager"
                        decoding="async"
                        draggable={false}
                      />
                    </picture>
                    <strong>Войдите в аккаунт</strong>
                    <span>История операций доступна после входа.</span>
                    <button type="button" onClick={() => openAuth('signin')}>
                      Войти
                    </button>
                  </div>
                ) : groupedTransactions.length === 0 ? (
                  <div className="wl-historyEmpty" data-wallet-history-empty="true">
                    <picture className="wl-emptyArt" aria-hidden="true">
                      <source
                        type="image/avif"
                        srcSet="/images/web-hub/v1/pages/wallet/wallet-history-empty-240w.avif 240w, /images/web-hub/v1/pages/wallet/wallet-history-empty-320w.avif 320w"
                        sizes="112px"
                      />
                      <source
                        type="image/webp"
                        srcSet="/images/web-hub/v1/pages/wallet/wallet-history-empty-240w.webp 240w, /images/web-hub/v1/pages/wallet/wallet-history-empty-320w.webp 320w"
                        sizes="112px"
                      />
                      <img
                        src="/images/web-hub/v1/pages/wallet/wallet-history-empty-320w.webp"
                        width={320}
                        height={320}
                        sizes="112px"
                        alt=""
                        loading="eager"
                        decoding="async"
                        draggable={false}
                      />
                    </picture>
                    <strong>Пока нет операций</strong>
                    <span>Новые операции появятся здесь.</span>
                  </div>
                ) : (
                  <>
                    {groupedTransactions.map((group) => {
                      const isCollapsed = Boolean(collapsedGroups[group.dateLabel]);
                      return (
                        <section key={group.dateLabel} className="wl-dayGroup">
                          <button
                            type="button"
                            className="wl-dayHeader"
                            onClick={() => toggleGroup(group.dateLabel)}
                            aria-expanded={!isCollapsed}
                          >
                            <span>{group.dateLabel}</span>
                            <span className="wl-dayMeta">
                              {group.items.length}
                              {isCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
                            </span>
                          </button>
                          {!isCollapsed && (
                            <ul className="wl-eventList">
                              {group.items.map((item) => {
                                const isPendingWithdrawal = item.category === 'withdrawals' && item.status === 'pending';
                                const failedReq = failedMap.get(item.id);
                                const isFailedNeedVerify =
                                  item.category === 'withdrawals' && item.status === 'failed' && failedReq?.code === 'need_verification';

                                const Icon = (() => {
                                  if (item.category === 'deposits') return ArrowDownRight;
                                  if (item.category === 'withdrawals') return ArrowUpRight;
                                  if (item.category === 'bonuses') return Gift;
                                  if (item.type === 'win') return Trophy;
                                  return TrendingDown;
                                })();

                                // Акцентная полоса слева: цвет по типу операции
                                const accent = (() => {
                                  if (item.category === 'deposits') return 'green';
                                  if (item.category === 'bonuses') return 'violet';
                                  if (item.category === 'withdrawals') return 'orange';
                                  if (item.type === 'win') return 'green';
                                  return 'red';
                                })();

                                // pending timer for this history row
                                let pendingTimer: string | null = null;
                                if (isPendingWithdrawal) {
                                  const created = new Date(item.createdAt).getTime();
                                  const deadline = created + WITHDRAWAL_PROCESSING_MS;
                                  const rem = Math.max(0, deadline - now);
                                  const sec = Math.ceil(rem / 1000);
                                  pendingTimer = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
                                }

                                const statusLabel = isPendingWithdrawal
                                  ? 'На обработке'
                                  : isFailedNeedVerify
                                    ? 'Не подтверждено'
                                    : null;

                                return (
                                  <li key={item.id} className="wl-eventRow" data-accent={accent}>
                                    <span className="wl-eventIcon" aria-hidden="true">
                                      <Icon />
                                    </span>
                                    <span className="wl-eventBody">
                                      <span className="wl-eventTitle">{item.title}</span>
                                      <span className="wl-eventMeta">
                                        {pendingTimer ? `Проверка реквизитов · осталось ${pendingTimer}` : item.subtitle}
                                      </span>
                                    </span>
                                    <span className="wl-eventAmount" data-tone={item.amount > 0 ? 'green' : item.amount < 0 ? 'red' : undefined}>
                                      {item.amount > 0 ? `+${formatRub(item.amount)}` : formatRub(item.amount)}
                                      {statusLabel && <small>{statusLabel}</small>}
                                    </span>
                                    <span className="wl-eventTime">{formatTime(item.createdAt)}</span>
                                    {isFailedNeedVerify && failedReq && (
                                      <span className="wl-eventActions">
                                        <button
                                          type="button"
                                          className="wl-eventActionMain"
                                          onClick={() => handleVerifyFromWallet(failedReq)}
                                        >
                                          {failedReq.verificationFailed ? 'Пройти верификацию заново' : 'Пройти верификацию'}
                                        </button>
                                        {failedReq.verificationFailed && (
                                          <button
                                            type="button"
                                            className="wl-eventActionGhost"
                                            onClick={() => handleDetailsFromWallet(failedReq)}
                                          >
                                            Подробнее
                                          </button>
                                        )}
                                      </span>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </section>
                      );
                    })}
                    {nextCursor && (
                      <button
                        type="button"
                        className="wl-loadMore"
                        onClick={() => loadTransactions(activeTab, nextCursor, true)}
                      >
                        Показать ещё
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </section>
        </>
      )}

      {/* Мобильный док «Пополнить / Вывести» */}
      <div className="wl-moneyDock" aria-label="Действия с балансом" data-finance-state="ready">
        <span id="wl-finance-authority-status" className="wl-dockStatus" role="status">
          Финансовые действия доступны
        </span>
        <button type="button" aria-label="Пополнить баланс" aria-describedby="wl-finance-authority-status" onClick={handleDeposit}>
          <Plus aria-hidden="true" />
          Пополнить
        </button>
        <button type="button" aria-label="Вывести средства" aria-describedby="wl-finance-authority-status" onClick={handleWithdraw}>
          <ArrowUpRight aria-hidden="true" />
          Вывести
        </button>
      </div>

      <VerificationFailedModal
        open={Boolean(detailsId && detailsRequest)}
        onClose={handleDetailsClose}
        amountText={detailsRequest ? `${formatRub(detailsRequest.amount)} · ${detailsRequest.method ?? 'СБП'}` : undefined}
        createdAt={detailsRequest?.createdAt}
      />
    </div>
  );
}
