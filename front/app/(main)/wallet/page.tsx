'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Percent, 
  ArrowUpRight, 
  Zap, 
  Gift, 
  Trophy, 
  TrendingUp, 
  ArrowDownRight, 
  TrendingDown, 
  ChevronDown,
  ChevronUp,
  LogIn,
  Clock,
  Loader2,
  Coins,
  Wallet,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useTopUpModal } from '@/components/TopUpModal';
import { useWithdrawModal } from '@/components/WithdrawModal';
import { useAuthModal } from '@/components/AuthModal';
import { useVerificationModal } from '@/components/VerificationModal';
import { VerificationFailedModal } from '@/components/VerificationFailedModal';
import { walletApi, type WalletHistoryItem, type WithdrawActiveResponse, type WithdrawRequestItem } from '@/lib/api';
import { showError, showSuccess } from '@/lib/toast';

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

  const [promo, setPromo] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);

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

  const handleActivatePromo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promo.trim() || promoLoading) return;
    setPromoLoading(true);

    try {
      const res = await walletApi.activatePromo(promo);
      showSuccess(res.message);
      setPromo('');
      await refreshUser();
       loadTransactions(activeTab);
    } catch (err) {
      showError((err as Error).message || 'Не удалось активировать промокод');
    } finally {
      setPromoLoading(false);
    }
  };

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
    { id: 'games', label: 'Игры', icon: Trophy, count: counts.games ?? 0 },
    { id: 'bonuses', label: 'Бонусы', icon: Gift, count: counts.bonuses ?? 0 },
    { id: 'wins', label: 'Выигрыши', icon: TrendingUp, count: counts.wins ?? 0 },
    { id: 'deposits', label: 'Пополнения', icon: ArrowDownRight, count: counts.deposits ?? 0 },
    { id: 'withdrawals', label: 'Выводы', icon: ArrowUpRight, count: counts.withdrawals ?? 0 },
    { id: 'losses', label: 'Проигрыши', icon: TrendingDown, count: counts.losses ?? 0 },
  ];

  const activeRequest = activeData?.request;
  const failedMap = new Map(failedRequests.map(r => [r.id, r]));
  const needVerificationRequest = failedRequests.find(r => r.code === 'need_verification') ?? null;

  const [detailsId, setDetailsId] = useState<string | null>(null);
  const detailsRequest = detailsId ? failedRequests.find(r => r.id === detailsId) ?? null : null;

  const handleVerifyFromWallet = async (req: WithdrawRequestItem | null) => {
    const target = req ?? needVerificationRequest;
    if (!target) return;
    const ok = await openVerification({
      amount: target.amount,
      method: (target as any).method ?? 'СБП',
      requisites: (target as any).requisites ?? null,
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

  return (
    <main className="px-page max-[399px]:px-xs md:px-2xl pt-md md:pt-xl pb-2xl w-full">
      <div className="mx-auto transition-all duration-300 max-w-[48rem] space-y-md">
        
        {/* Бонусная плашка */}
        <div className="relative overflow-hidden rounded-panel bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 p-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-sm">
              <div className="p-xs rounded-button bg-cyan-500/20">
                <Percent className="h-4 w-4 text-cyan-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-cyan-400">Бонус 100% при пополнении</p>
                <p className="text-xs text-slate-400">Удвоим ваш первый депозит до 10,000₽</p>
              </div>
            </div>
          </div>
        </div>

        {/* Карточка Баланса */}
        <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-blue-500/20 via-cyan-500/15 to-blue-600/20 backdrop-blur-sm border border-white/10 p-card-lg">
          <div className="flex items-center gap-md mb-xl">
            <div className="relative h-16">
              <div 
                className="absolute inset-0 w-1 rounded-pill bg-emerald-500" 
                style={{ boxShadow: '0px 0px 10px rgba(59, 140, 255, 0.6)' }}
              />
              <div className="absolute top-0 left-1 h-full w-2 bg-gradient-to-r from-emerald-500/30 to-transparent" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-white/50 mb-2xs">Доступно к выводу</p>
              <span className="text-3xl font-bold ">
                {user ? (
                  <>
                    {user.balance.toLocaleString('ru-RU')} <span className="text-2xl font-normal">₽</span>
                  </>
                ) : (
                  <>0 <span className="text-2xl font-normal">₽</span></>
                )}
              </span>
            </div>
          </div>

          <div className="flex gap-sm">
            <button 
              onClick={() => (user ? openWithdraw() : openAuth('signin'))} 
              className="flex-1 rounded-button border border-white/20 bg-white/5 px-md py-xs font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 flex items-center justify-center gap-xs"
            >
              <ArrowUpRight className="w-5 h-5 flex-shrink-0" />
              <span className="text-base font-semibold">Вывести</span>
            </button>

            <button 
              onClick={() => (user ? openTopUp() : openAuth('signin'))} 
              className="flex-1 relative overflow-hidden rounded-button bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 px-md py-xs font-semibold text-white shadow-lg transition-all flex items-center justify-center gap-xs"
            >
              <Zap className="w-5 h-5 flex-shrink-0" />
              <span className="text-base font-semibold">Пополнить</span>
            </button>
          </div>
        </div>

        {/* Активная заявка - таймер на странице кошелька */}
        {user && activeRequest && (() => {
          const deadline = activeRequest.processingUntil ? new Date(activeRequest.processingUntil).getTime() : new Date(activeRequest.createdAt).getTime() + WITHDRAWAL_PROCESSING_MS;
          const remainingMs = Math.max(0, deadline - now);
          const remainingSeconds = Math.ceil(remainingMs / 1000);
          const progress = Math.min(100, Math.max(0, ((WITHDRAWAL_PROCESSING_MS - remainingMs) / WITHDRAWAL_PROCESSING_MS) * 100));
          const timerLabel = `${String(Math.floor(remainingSeconds / 60)).padStart(2, '0')}:${String(remainingSeconds % 60).padStart(2, '0')}`;
          return (
            <section aria-label="Заявка на вывод" className="rounded-card border border-white/10 bg-white/[0.03] p-card">
              <div className="flex items-center gap-sm">
                <span className="p-sm rounded-panel shrink-0 flex items-center justify-center bg-blue-500/15 text-blue-400">
                  <Wallet className="w-6 h-6" strokeWidth={2.2} />
                </span>
                <div className="flex flex-col min-w-0 gap-2xs">
                  <span className="text-base font-bold text-white truncate">
                    Заявка на вывод · <span className="text-money">{formatRub(activeRequest.amount)}</span>
                  </span>
                  <span className="text-sm font-medium text-white/60">
                    {[activeRequest.method, activeRequest.details].filter(Boolean).join(' · ')}
                  </span>
                </div>
              </div>
              <div className="mt-md h-1 rounded-pill overflow-hidden bg-white/10">
                <span className="block h-full rounded-pill bg-gradient-to-r from-blue-500 to-blue-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="mt-sm text-xs leading-relaxed text-white/50 flex items-center gap-xs">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                Проверка реквизитов · осталось {timerLabel}
              </p>
            </section>
          );
        })()}

        {/* Ошибка верификации - кнопка на кошельке */}
        {user && !activeRequest && needVerificationRequest && (
          <section className="rounded-card border border-amber-500/20 bg-amber-500/5 p-card">
            <div className="flex items-center gap-sm">
              <span className="p-sm rounded-panel shrink-0 flex items-center justify-center bg-amber-500/15 text-amber-400">
                <ShieldCheck className="w-6 h-6" />
              </span>
              <div className="flex flex-col min-w-0 gap-2xs">
                <span className="text-base font-bold text-white truncate">
                  Заявка на вывод · <span className="text-money">{formatRub(needVerificationRequest.amount)}</span>
                </span>
                <span className="text-sm font-medium text-white/60">Верификация реквизитов не подтверждена</span>
              </div>
            </div>
            <div className="mt-md h-1 rounded-pill overflow-hidden bg-white/10">
              <span className="block h-full rounded-pill bg-gradient-to-r from-amber-500 to-orange-600" style={{ width: '30%' }} />
            </div>
            <p className="mt-sm text-xs leading-relaxed text-white/50">{needVerificationRequest.verificationFailed ? 'Для повторной попытки пройдите верификацию заново. Платёж проводится через СБП и не зачисляется на игровой баланс.' : 'Для вывода необходимо пройти верификацию реквизитов. Платёж проводится через СБП и не зачисляется на игровой баланс.'}</p>
            <div className="mt-md flex flex-col gap-xs">
              <button
                type="button"
                onClick={() => handleVerifyFromWallet(needVerificationRequest)}
                className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-button px-md py-xs h-12 text-sm font-bold transition-all w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white shadow-lg"
              >
                {needVerificationRequest.verificationFailed ? 'Пройти верификацию заново' : 'Пройти верификацию'}
                <ArrowRight className="w-4 h-4" />
              </button>
              {needVerificationRequest.verificationFailed && (
                <button
                  type="button"
                  onClick={() => handleDetailsFromWallet(needVerificationRequest)}
                  className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-button px-md py-xs h-10 text-sm font-medium transition-all w-full bg-white text-zinc-900 hover:bg-zinc-100 shadow"
                >
                  Подробнее
                </button>
              )}
            </div>
          </section>
        )}

        {/* Запрос авторизации для неавторизованных пользователей */}
        {!user && !userLoading && (
          <div className="p-card rounded-panel bg-white/5 border border-white/10 text-center space-y-sm">
            <p className="text-sm text-zinc-300">Войдите в аккаунт, чтобы управлять балансом, активировать промокоды и просматривать историю транзакций</p>
            <button
              onClick={() => openAuth('signin')}
              className="inline-flex items-center gap-xs px-md py-xs rounded-button bg-gradient-to-r from-blue-500 to-blue-600 text-white font-medium text-sm hover:from-blue-600 hover:to-blue-700 transition-all"
            >
              <LogIn className="w-4 h-4" />
              <span>Войти в аккаунт</span>
            </button>
          </div>
        )}

        {/* Форма Промокода */}
        <div className="relative rounded-panel bg-black/30 backdrop-blur-sm overflow-hidden border border-white/20">
          <div className="px-md py-sm border-b border-white/5 flex items-center gap-xs">
            <Gift className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-medium text-white/90">Промокод</h3>
            <span className="text-xs text-white/40">• Бонус на баланс</span>
          </div>

          <form onSubmit={handleActivatePromo} className="p-card space-y-sm">
            <div className="flex gap-xs">
              <input 
                placeholder="Введите промокод" 
                maxLength={20}
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                disabled={!user || promoLoading}
                className="flex-1 min-w-0 px-sm py-xs rounded-control bg-black/30 backdrop-blur-sm border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/20" 
                type="text" 
              />
              <button 
                type="submit"
                disabled={!user || !promo.trim() || promoLoading}
                className="px-md py-xs rounded-button text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white/10 backdrop-blur-sm border border-white/10 hover:bg-white/15 flex items-center gap-xs shrink-0 whitespace-nowrap"
              >
                {promoLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-white" />
                    <span>Проверка...</span>
                  </>
                ) : (
                  'Активировать'
                )}
              </button>
            </div>

          </form>
        </div>

        {/* Табы Фильтров транзакций */}
        <div className="space-y-md mt-xl">
          <div className="flex gap-xs overflow-x-auto scrollbar-hide pb-xs">
            {filterTabs.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;

              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative flex items-center gap-xs px-md py-xs rounded-button border transition-all flex-shrink-0 text-sm font-medium ${
                    isActive 
                      ? 'bg-gradient-to-r from-white/10 to-white/5 border-white/20 text-white' 
                      : 'bg-white/[0.02] border-white/10 hover:bg-white/5 text-white/70'
                  }`}
                >
                  {Icon && <Icon className="w-4 h-4 text-white/60" />}
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={`px-2xs py-2xs rounded-pill text-xs ${isActive ? 'bg-white/20 text-white' : 'bg-white/10 text-white/60'}`}>
                      {tab.count}
                    </span>
                  )}
                  {isActive && (
                    <div className="absolute bottom-0 left-xs right-xs h-0.5 bg-gradient-to-r from-blue-400 to-cyan-400" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Индикатор загрузки */}
          {txLoading && (
            <div className="flex items-center justify-center py-lg text-white/40 gap-xs">
              <Loader2 className="w-5 h-5 animate-spin" />
              <span className="text-sm font-medium">Загрузка истории...</span>
            </div>
          )}
        </div>

        {/* История Транзакций */}
        {!txLoading && user && groupedTransactions.length === 0 && (
          <div className="text-center py-xl bg-white/[0.02] rounded-panel border border-white/5 p-card space-y-xs">
            <Coins className="w-8 h-8 text-white/20 mx-auto" />
            <p className="text-sm font-medium text-white/70">Транзакций не найдено</p>
            <p className="text-xs text-white/40">Пополните баланс или активируйте промокод, чтобы начать игра</p>
          </div>
        )}

        {!txLoading && user && (
          <div className="space-y-sm">
            {groupedTransactions.map((group) => {
              const isCollapsed = Boolean(collapsedGroups[group.dateLabel]);

              return (
                <div key={group.dateLabel} className="space-y-xs">
                  {/* Заголовок группы даты */}
                  <button 
                    onClick={() => toggleGroup(group.dateLabel)}
                    className="w-full flex items-center justify-between px-sm py-xs rounded-button bg-gradient-to-r from-white/[0.02] to-white/[0.04] hover:from-white/5 hover:to-white/10 transition-all border border-white/5"
                  >
                    <div className="flex items-center gap-sm">
                      <span className="text-sm font-medium text-white/90">{group.dateLabel}</span>
                      <span className="px-xs py-2xs text-xs bg-white/10 rounded-pill text-white/60">
                        {group.items.length}
                      </span>
                    </div>
                    {isCollapsed ? (
                      <ChevronDown className="w-4 h-4 text-white/40" />
                    ) : (
                      <ChevronUp className="w-4 h-4 text-white/40" />
                    )}
                  </button>

                  {/* Элементы транзакций */}
                  {!isCollapsed && (
                    <div className="space-y-2xs pl-xs pr-xs">
                      {group.items.map((item) => {
                        const isIncome = item.amount > 0;
                        const isExpense = item.amount < 0;
                        const isPendingWithdrawal = item.category === 'withdrawals' && item.status === 'pending';
                        const failedReq = failedMap.get(item.id);
                        const isFailedNeedVerify = item.category === 'withdrawals' && item.status === 'failed' && failedReq?.code === 'need_verification';

                        const Icon = (() => {
                          if (item.category === 'deposits') return ArrowDownRight;
                          if (item.category === 'withdrawals') return ArrowUpRight;
                          if (item.category === 'bonuses') return Gift;
                          if (item.type === 'win') return Trophy;
                          return TrendingDown;
                        })();

                        const iconBgClass = (() => {
                          if (item.category === 'deposits') return 'bg-money/20 text-money';
                          if (item.category === 'withdrawals') return 'bg-blue-500/20 text-blue-400';
                          if (item.category === 'bonuses') return 'bg-amber-500/20 text-amber-400';
                          if (item.type === 'win') return 'bg-money/20 text-money';
                          return 'bg-rose-500/20 text-rose-400';
                        })();

                        // pending timer for this history row
                        let pendingTimer: string | null = null;
                        let pendingProgress: number | null = null;
                        if (isPendingWithdrawal) {
                          const created = new Date(item.createdAt).getTime();
                          const deadline = created + WITHDRAWAL_PROCESSING_MS;
                          const rem = Math.max(0, deadline - now);
                          const sec = Math.ceil(rem / 1000);
                          pendingProgress = Math.min(100, Math.max(0, ((WITHDRAWAL_PROCESSING_MS - rem) / WITHDRAWAL_PROCESSING_MS) * 100));
                          pendingTimer = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
                        }

                        return (
                          <div 
                            key={item.id} 
                            className="flex flex-col p-sm rounded-panel bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 transition-all gap-sm"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-sm">
                                <div className={`p-xs rounded-button shrink-0 ${iconBgClass}`}>
                                  <Icon className="w-4 h-4" />
                                </div>
                                <div>
                                  <div className="flex items-center gap-xs">
                                    <p className="text-sm font-semibold text-white/90">{item.title}</p>
                                    {isPendingWithdrawal && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-pill bg-blue-500/20 text-blue-400">На обработке</span>}
                                    {isFailedNeedVerify && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-pill bg-amber-500/20 text-amber-400">Требуется верификация</span>}
                                  </div>
                                  <p className="text-xs text-white/40">{item.subtitle}</p>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <p className={`text-sm font-bold ${isIncome ? 'text-money' : isExpense ? 'text-white/90' : 'text-white/60'}`}>
                                  {isIncome ? `+${formatRub(item.amount)}` : formatRub(item.amount)}
                                </p>
                                <div className="flex items-center gap-2xs justify-end text-[11px] text-white/30">
                                  <Clock className="w-3 h-3" />
                                  <span>{formatTime(item.createdAt)}</span>
                                </div>
                              </div>
                            </div>

                            {isPendingWithdrawal && pendingTimer && pendingProgress !== null && (
                              <div className="space-y-1">
                                <div className="h-1 rounded-pill overflow-hidden bg-white/10">
                                  <span className="block h-full rounded-pill bg-gradient-to-r from-blue-500 to-blue-600 transition-all" style={{ width: `${pendingProgress}%` }} />
                                </div>
                                <p className="text-xs text-white/40 flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Проверка реквизитов · осталось {pendingTimer}
                                </p>
                              </div>
                            )}

                            {isFailedNeedVerify && failedReq && (
                              <div className="flex flex-col gap-xs">
                                <button
                                  type="button"
                                  onClick={() => handleVerifyFromWallet(failedReq)}
                                  className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-button px-md py-2 text-sm font-bold w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 text-white"
                                >
                                  <ShieldCheck className="w-4 h-4" />
                                  {failedReq.verificationFailed ? 'Пройти верификацию заново' : 'Пройти верификацию'}
                                  <ArrowRight className="w-4 h-4" />
                                </button>
                                {failedReq.verificationFailed && (
                                  <button
                                    type="button"
                                    onClick={() => handleDetailsFromWallet(failedReq)}
                                    className="inline-flex items-center justify-center gap-xs whitespace-nowrap rounded-button px-md py-2 text-sm font-medium w-full bg-white text-zinc-900 hover:bg-zinc-100 shadow"
                                  >
                                    Подробнее
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {!txLoading && user && nextCursor && (
          <button
            type="button"
            onClick={() => loadTransactions(activeTab, nextCursor, true)}
            className="w-full rounded-button border border-white/10 bg-white/[0.03] px-md py-sm text-sm font-medium text-white/70 transition hover:bg-white/[0.08] hover:text-white"
          >
            Показать еще
          </button>
        )}

      </div>

      <VerificationFailedModal
        open={Boolean(detailsId && detailsRequest)}
        onClose={handleDetailsClose}
        amountText={detailsRequest ? `${formatRub(detailsRequest.amount)} · ${detailsRequest.method ?? 'СБП'}` : undefined}
        createdAt={detailsRequest?.createdAt}
      />
    </main>
  );
}
