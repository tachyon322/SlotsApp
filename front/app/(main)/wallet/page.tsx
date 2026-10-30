'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import {
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  Gift,
  Trophy,
  TrendingDown,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Crown,
  Wallet,
  Clock,
  ArrowRight,
  Ticket,
} from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useTopUpModal } from '@/components/TopUpModal';
import { useWithdrawModal } from '@/components/WithdrawModal';
import { useAuthModal } from '@/components/AuthModal';
import { useVerificationModal } from '@/components/VerificationModal';
import { usePromoModal } from '@/components/PromoModal';
import { usePaymentGate } from '@/components/PaymentGateModal';
import { VerificationFailedModal } from '@/components/VerificationFailedModal';
import { walletApi, type WalletHistoryItem, type WithdrawActiveResponse, type WithdrawRequestItem } from '@/lib/api';
import { WITHDRAWAL_PROCESSING_TEXT, formatCountdown } from '@/lib/withdrawal';

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
  const { openGate } = usePaymentGate();

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
    window.addEventListener('premium-paid', onVerified);
    window.addEventListener('gate-paid', onVerified);
    window.addEventListener('focus', onVerified);
    return () => {
      window.removeEventListener('withdraw-created', onCreated);
      window.removeEventListener('withdraw-settled', onSettled);
      window.removeEventListener('verification-paid', onVerified);
      window.removeEventListener('verification-submitted', onVerified);
      window.removeEventListener('premium-paid', onVerified);
      window.removeEventListener('gate-paid', onVerified);
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

  // Tick for timer - also triggers settlement check when deadline passes
  useEffect(() => {
    const request = activeData?.request;
    if (!request) return;
    const processingUntilMs = request.processingUntil
      ? new Date(request.processingUntil).getTime()
      : null;
    const id = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (processingUntilMs !== null && current >= processingUntilMs) {
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
  const needDepositRequest = failedRequests.find(r => r.code === 'need_deposit') ?? null;
  const needVerificationRequest = failedRequests.find(r => r.code === 'need_verification') ?? null;
  const needPremiumRequest = failedRequests.find(r => r.code === 'need_premium') ?? null;
  const activeRequest = activeData?.request;

  // Таймер шага 4/4: дедлайн заявки (createdAt + 30 дней) приходит с бэка
  const withdrawalDeadlineMs = activeRequest?.processingUntil
    ? new Date(activeRequest.processingUntil).getTime()
    : null;
  const withdrawalRemainingMs = withdrawalDeadlineMs === null ? null : Math.max(0, withdrawalDeadlineMs - now);

  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsRequest = detailsId ? failedRequests.find(r => r.id === detailsId) ?? null : null;

  const handlePremiumFromWallet = useCallback(async () => {
    const ok = await openGate('premium');
    if (ok) {
      loadActive();
      loadFailed();
      refreshUser();
    }
  }, [openGate, loadActive, loadFailed, refreshUser]);

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

  // Воронка вывода: какой шаг показывать карточкой — те же условия, что у прежних плашек шагов 1–4
  const withdrawStage: 1 | 2 | 3 | 4 | null = !user
    ? null
    : !activeRequest && needDepositRequest
      ? 1
      : !activeRequest && needVerificationRequest
        ? 2
        : !activeRequest && needPremiumRequest
          ? 3
          : activeRequest && !needDepositRequest && !needVerificationRequest && !needPremiumRequest
            ? 4
            : null;

  // Все заявки воронки (как в прежней полосе «Заявка на вывод»): при нескольких — списком в карточке
  const pendingRows = [
    activeRequest && {
      key: 'active',
      label: `Шаг 4/4: Вывод средств · ${[activeRequest.method, activeRequest.details].filter(Boolean).join(' · ') || 'в обработке'}`,
      amount: activeRequest.amount,
    },
    needDepositRequest && { key: 'deposit', label: 'Шаг 1/4: Требуется первый депозит', amount: needDepositRequest.amount },
    needVerificationRequest && {
      key: 'verification',
      label: 'Шаг 2/4: Требуется верификация реквизитов',
      amount: needVerificationRequest.amount,
    },
    needPremiumRequest && { key: 'premium', label: 'Шаг 3/4: Требуется Премиум подписка', amount: needPremiumRequest.amount },
  ].filter((row): row is { key: string; label: string; amount: number } => Boolean(row));

  const stageInfo = (() => {
    switch (withdrawStage) {
      case 1:
        return {
          icon: ArrowDownRight,
          title: 'Сделайте первый депозит',
          amount: needDepositRequest?.amount ?? 0,
          text: 'Вывод средств доступен только после внесения хотя бы одного депозита.',
        };
      case 2:
        return {
          icon: ArrowUpRight,
          title: 'Верификация реквизитов',
          amount: needVerificationRequest?.amount ?? 0,
          text: 'Для вывода средств необходимо пройти верификацию реквизитов. Подтверждение происходит автоматически после оплаты.',
        };
      case 3:
        return {
          icon: Crown,
          title: 'Оформите Премиум',
          amount: needPremiumRequest?.amount ?? 0,
          text: 'Премиум подписка обязательна для вывода средств (2 000 ₽). Без неё вывести средства нельзя.',
        };
      case 4:
        return {
          icon: Wallet,
          title: 'Вывод средств — в обработке',
          amount: activeRequest?.amount ?? 0,
          text: WITHDRAWAL_PROCESSING_TEXT,
        };
      default:
        return null;
    }
  })();


  return (
    <div className="lw">
      <header className="lw-head">
        <h1>Кошелёк</h1>
      </header>

      {userLoading ? (
        <div className="lw-grid" aria-hidden="true">
          <div className="pg-skel lw-skel-card" />
          <div className="pg-skel lw-skel-list" />
        </div>
      ) : (
        <div className="lw-grid">
          <div className="lw-side">
            {/* Баланс */}
            <section className="lw-balance" aria-label="Баланс">
              <Image className="lw-balance-art" src="/lg/img/wallet-safe.webp" width={320} height={320} alt="" aria-hidden="true" priority />
              <span className="lw-balance-label">Баланс</span>
              <strong className="lw-balance-amount">{formatRub(user?.balance ?? 0)}</strong>
              <span className="lw-balance-caption">
                <i aria-hidden="true" />
                {user ? 'Данные обновлены' : 'Войдите в аккаунт'}
              </span>
              <div className="lw-balance-actions">
                <button type="button" className="pg-btn pg-btn-acc" onClick={handleDeposit} aria-label="Пополнить баланс">
                  <Plus aria-hidden="true" />
                  Пополнить
                </button>
                <button type="button" className="pg-btn pg-btn-sec" onClick={handleWithdraw} aria-label="Вывести средства">
                  <ArrowUpRight aria-hidden="true" />
                  Вывести
                </button>
              </div>
              <button type="button" className="lw-promo" onClick={openPromo} aria-label="Ввести промокод">
                <Ticket aria-hidden="true" />
                Есть промокод?
                <em>
                  Ввести
                  <ChevronRight aria-hidden="true" />
                </em>
              </button>
            </section>

            {/* Заявка на вывод: одна карточка вместо полосы и плашек шагов */}
            {pendingRows.length > 0 && (
              <section className="lw-withdraw" aria-label="Заявка на вывод" data-stage={withdrawStage ?? undefined}>
                <header className="lw-withdraw-top">
                  <span className="lw-withdraw-icon" aria-hidden="true">
                    {stageInfo ? <stageInfo.icon /> : <Clock />}
                  </span>
                  <span className="lw-withdraw-title">
                    <small>Заявка на вывод</small>
                    <b>{stageInfo ? stageInfo.title : 'Заявки в обработке'}</b>
                  </span>
                  {stageInfo && <strong className="lw-withdraw-sum">{formatRub(stageInfo.amount)}</strong>}
                </header>

                {(pendingRows.length > 1 || !stageInfo) && (
                  <ul className="lw-withdraw-rows">
                    {pendingRows.map((row) => (
                      <li key={row.key}>
                        <span>{row.label}</span>
                        <strong>{formatRub(row.amount)}</strong>
                      </li>
                    ))}
                  </ul>
                )}

                {stageInfo && withdrawStage && (
                  <>
                    <p className="lw-withdraw-text">{stageInfo.text}</p>

                    {withdrawStage === 1 && (
                      <button type="button" className="pg-btn pg-btn-acc pg-btn-wide" onClick={handleDeposit}>
                        Внести депозит
                        <ArrowRight aria-hidden="true" />
                      </button>
                    )}
                    {withdrawStage === 2 && needVerificationRequest && (
                      <>
                        <button
                          type="button"
                          className="pg-btn pg-btn-acc pg-btn-wide"
                          onClick={() => handleVerifyFromWallet(needVerificationRequest)}
                        >
                          Пройти верификацию (2000₽)
                          <ArrowRight aria-hidden="true" />
                        </button>
                        {needVerificationRequest.verificationFailed && (
                          <button
                            type="button"
                            className="pg-btn pg-btn-sec pg-btn-wide pg-btn-sm"
                            onClick={() => handleDetailsFromWallet(needVerificationRequest)}
                          >
                            Подробнее
                          </button>
                        )}
                      </>
                    )}
                    {withdrawStage === 3 && (
                      <button type="button" className="pg-btn pg-btn-acc pg-btn-wide" onClick={handlePremiumFromWallet}>
                        Купить Премиум (2000₽)
                        <ArrowRight aria-hidden="true" />
                      </button>
                    )}
                    {withdrawStage === 4 && (
                      <p className="lw-withdraw-timer">
                        <Clock aria-hidden="true" />
                        {withdrawalRemainingMs !== null && withdrawalRemainingMs > 0
                          ? `Осталось: ${formatCountdown(withdrawalRemainingMs)}`
                          : 'Ожидайте зачисления на указанные реквизиты'}
                      </p>
                    )}
                  </>
                )}
              </section>
            )}
          </div>

          {/* История операций */}
          <section className="lw-history" aria-label="История операций">
            <header className="lw-history-head">
              <h2>История</h2>
              <span className="lw-sync" aria-live="polite">
                <i data-loading={txLoading} aria-hidden="true" />
                {txLoading ? 'Обновляем' : 'Актуально'}
              </span>
            </header>

            <nav className="lw-chips" aria-label="Фильтр истории">
              {filterTabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    className="pg-chip"
                    data-active={isActive}
                    aria-pressed={isActive}
                    onClick={() => setActiveTab(tab.id)}
                  >
                    {tab.label}
                    <b>{tab.count}</b>
                  </button>
                );
              })}
            </nav>

            <div className="lw-feed" role="region" aria-label="Операции">
              {txLoading && transactions.length === 0 ? (
                <div className="pg-skel lw-skel-list" aria-hidden="true" />
              ) : !user ? (
                <div className="lw-empty">
                  <Image className="lw-empty-art" src="/lg/img/wallet-empty.webp" width={320} height={320} alt="" aria-hidden="true" />
                  <strong>Войдите в аккаунт</strong>
                  <span>История операций доступна после входа.</span>
                  <button type="button" className="pg-btn pg-btn-acc" onClick={() => openAuth('signin')}>
                    Войти
                  </button>
                </div>
              ) : groupedTransactions.length === 0 ? (
                <div className="lw-empty">
                  <Image className="lw-empty-art" src="/lg/img/wallet-empty.webp" width={320} height={320} alt="" aria-hidden="true" />
                  <strong>Пока нет операций</strong>
                  <span>Новые операции появятся здесь.</span>
                </div>
              ) : (
                <>
                  {groupedTransactions.map((group) => {
                    const isCollapsed = Boolean(collapsedGroups[group.dateLabel]);
                    return (
                      <section key={group.dateLabel} className="lw-day">
                        <button
                          type="button"
                          className="lw-day-head"
                          onClick={() => toggleGroup(group.dateLabel)}
                          aria-expanded={!isCollapsed}
                        >
                          <span>{group.dateLabel}</span>
                          <span className="lw-day-meta">
                            {group.items.length}
                            {isCollapsed ? <ChevronDown aria-hidden="true" /> : <ChevronUp aria-hidden="true" />}
                          </span>
                        </button>
                        {!isCollapsed && (
                          <ul className="lw-list">
                            {group.items.map((item) => {
                              const isPendingWithdrawal = item.category === 'withdrawals' && item.status === 'pending';
                              const failedReq = failedMap.get(item.id);
                              const isFailedNeedDeposit =
                                item.category === 'withdrawals' && item.status === 'failed' && failedReq?.code === 'need_deposit';
                              const isFailedNeedVerify =
                                item.category === 'withdrawals' && item.status === 'failed' && failedReq?.code === 'need_verification';
                              const isFailedNeedPremium =
                                item.category === 'withdrawals' && item.status === 'failed' && failedReq?.code === 'need_premium';

                              const Icon = (() => {
                                if (item.category === 'deposits') return ArrowDownRight;
                                if (item.category === 'withdrawals') return ArrowUpRight;
                                if (item.category === 'bonuses') return Gift;
                                if (item.type === 'win') return Trophy;
                                return TrendingDown;
                              })();

                              // Тон иконки по типу операции
                              const tone = (() => {
                                if (item.category === 'deposits') return 'pos';
                                if (item.category === 'bonuses') return 'bonus';
                                if (item.category === 'withdrawals') return 'warn';
                                if (item.type === 'win') return 'pos';
                                return 'neutral';
                              })();

                              // Дедлайн заявки (createdAt + 30 дней) приходит с бэка
                              let pendingTimerText: string | null = null;
                              if (isPendingWithdrawal) {
                                const deadlineIso =
                                  item.processingUntil ??
                                  (activeRequest?.id === item.id ? activeRequest.processingUntil : null);
                                if (deadlineIso) {
                                  const rem = new Date(deadlineIso).getTime() - now;
                                  pendingTimerText = rem > 0
                                    ? `Вывод в обработке · осталось ${formatCountdown(rem)}`
                                    : 'Вывод в обработке · ожидайте зачисления';
                                }
                              }

                              const statusLabel = isPendingWithdrawal
                                ? 'На обработке'
                                : isFailedNeedDeposit
                                  ? 'Требуется депозит'
                                  : isFailedNeedVerify
                                    ? 'Не подтверждено'
                                    : isFailedNeedPremium
                                      ? 'Требуется Премиум'
                                      : null;

                              const meta = [pendingTimerText ?? item.subtitle, formatTime(item.createdAt)].filter(Boolean).join(' · ');

                              return (
                                <li key={item.id} className="lw-row">
                                  <span className="lw-row-icon" data-tone={tone} aria-hidden="true">
                                    <Icon />
                                  </span>
                                  <span className="lw-row-body">
                                    <b>{item.title}</b>
                                    <span>{meta}</span>
                                  </span>
                                  <span className="lw-row-amount" data-tone={item.amount > 0 ? 'pos' : item.amount < 0 ? 'neg' : undefined}>
                                    {item.amount > 0 ? `+${formatRub(item.amount)}` : formatRub(item.amount)}
                                    {statusLabel && <small>{statusLabel}</small>}
                                  </span>
                                  {isFailedNeedDeposit && failedReq && (
                                    <span className="lw-row-actions">
                                      <button type="button" className="pg-btn pg-btn-acc pg-btn-sm" onClick={handleDeposit}>
                                        Внести депозит
                                      </button>
                                    </span>
                                  )}
                                  {isFailedNeedVerify && failedReq && (
                                    <span className="lw-row-actions">
                                      <button
                                        type="button"
                                        className="pg-btn pg-btn-acc pg-btn-sm"
                                        onClick={() => handleVerifyFromWallet(failedReq)}
                                      >
                                        {failedReq.verificationFailed ? 'Пройти верификацию заново' : 'Пройти верификацию'}
                                      </button>
                                      {failedReq.verificationFailed && (
                                        <button
                                          type="button"
                                          className="pg-btn pg-btn-sec pg-btn-sm"
                                          onClick={() => handleDetailsFromWallet(failedReq)}
                                        >
                                          Подробнее
                                        </button>
                                      )}
                                    </span>
                                  )}
                                  {isFailedNeedPremium && failedReq && (
                                    <span className="lw-row-actions">
                                      <button
                                        type="button"
                                        className="pg-btn pg-btn-acc pg-btn-sm"
                                        onClick={() => handlePremiumFromWallet()}
                                      >
                                        Купить Премиум
                                      </button>
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
                      className="lw-more"
                      onClick={() => loadTransactions(activeTab, nextCursor, true)}
                    >
                      Показать ещё
                    </button>
                  )}
                </>
              )}
            </div>
          </section>
        </div>
      )}

      <VerificationFailedModal
        open={Boolean(detailsId && detailsRequest)}
        onClose={handleDetailsClose}
        amountText={detailsRequest ? `${formatRub(detailsRequest.amount)} · ${detailsRequest.method ?? 'СБП'}` : undefined}
        createdAt={detailsRequest?.createdAt}
      />
    </div>
  );
}
