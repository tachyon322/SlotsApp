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
  CheckCircle2,
  AlertCircle,
  Loader2,
  Coins
} from 'lucide-react';
import { useUser } from '@/components/UserProvider';
import { useTopUpModal } from '@/components/TopUpModal';
import { useWithdrawModal } from '@/components/WithdrawModal';
import { useAuthModal } from '@/components/AuthModal';
import { walletApi, type WalletHistoryItem } from '@/lib/api';

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

  const [promo, setPromo] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [promoSuccess, setPromoSuccess] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState('all');
  const [transactions, setTransactions] = useState<WalletHistoryItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [txLoading, setTxLoading] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const loadTransactions = useCallback(async (tab: string) => {
    setTxLoading(true);
    try {
      const res = await walletApi.transactions(tab);
      setTransactions(res.items);
      setCounts(res.counts);
    } catch {
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadTransactions(activeTab);
    }
  }, [user, activeTab, loadTransactions]);

  const handleActivatePromo = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promo.trim() || promoLoading) return;
    setPromoLoading(true);
    setPromoError(null);
    setPromoSuccess(null);

    try {
      const res = await walletApi.activatePromo(promo);
      setPromoSuccess(res.message);
      setPromo('');
      await refreshUser();
      loadTransactions(activeTab);
    } catch (err) {
      setPromoError((err as Error).message || 'Не удалось активировать промокод');
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
    { id: 'withdrawals', label: 'Выплаты', icon: ArrowUpRight, count: counts.withdrawals ?? 0 },
    { id: 'losses', label: 'Проигрыши', icon: TrendingDown, count: counts.losses ?? 0 },
  ];

  return (
    <main className="px-page md:px-2xl pt-md md:pt-xl pb-2xl w-full">
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
            <span className="inline-flex items-center rounded-control border border-transparent px-xs py-2xs text-xs font-semibold bg-cyan-500 text-white shadow">
              x2
            </span>
          </div>
        </div>

        {/* Карточка Баланса */}
        <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-blue-500/20 via-cyan-500/15 to-blue-600/20 backdrop-blur-sm border border-white/10 p-card-lg">
          <div className="flex items-center gap-md mb-xl">
            <div className="relative h-16">
              <div 
                className="absolute inset-0 w-1 rounded-pill bg-emerald-500" 
                style={{ boxShadow: '0px 0px 10px rgba(16, 185, 129, 0.6)' }}
              />
              <div className="absolute top-0 left-1 h-full w-2 bg-gradient-to-r from-emerald-500/30 to-transparent" />
            </div>
            <div className="flex-1">
              <p className="text-xs text-white/50 mb-2xs">Доступно к выводу</p>
              <span className="text-3xl font-bold text-white">
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
                placeholder="Введите промокод (напр. WELCOME1000)" 
                maxLength={20}
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                disabled={!user || promoLoading}
                className="flex-1 px-sm py-xs rounded-control bg-black/30 backdrop-blur-sm border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/20 uppercase" 
                type="text" 
              />
              <button 
                type="submit"
                disabled={!user || !promo.trim() || promoLoading}
                className="px-md py-xs rounded-button text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white/10 backdrop-blur-sm border border-white/10 hover:bg-white/15 flex items-center gap-xs"
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

            {promoSuccess && (
              <div className="flex items-center gap-xs text-xs text-emerald-400 bg-emerald-500/10 p-xs rounded-control border border-emerald-500/20">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{promoSuccess}</span>
              </div>
            )}

            {promoError && (
              <div className="flex items-center gap-xs text-xs text-red-400 bg-red-500/10 p-xs rounded-control border border-red-500/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{promoError}</span>
              </div>
            )}

            <div className="text-xs text-white/40 text-center">
              Получайте промокоды в {' '}
              <a 
                href="https://t.me/promosw_bot" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="text-green-400 underline hover:text-green-300"
              >
                нашем боте
              </a>
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

                        const Icon = (() => {
                          if (item.category === 'deposits') return ArrowDownRight;
                          if (item.category === 'withdrawals') return ArrowUpRight;
                          if (item.category === 'bonuses') return Gift;
                          if (item.type === 'win') return Trophy;
                          return TrendingDown;
                        })();

                        const iconBgClass = (() => {
                          if (item.category === 'deposits') return 'bg-emerald-500/20 text-emerald-400';
                          if (item.category === 'withdrawals') return 'bg-blue-500/20 text-blue-400';
                          if (item.category === 'bonuses') return 'bg-amber-500/20 text-amber-400';
                          if (item.type === 'win') return 'bg-emerald-500/20 text-emerald-400';
                          return 'bg-rose-500/20 text-rose-400';
                        })();

                        return (
                          <div 
                            key={item.id} 
                            className="flex items-center justify-between p-sm rounded-panel bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 transition-all"
                          >
                            <div className="flex items-center gap-sm">
                              <div className={`p-xs rounded-button shrink-0 ${iconBgClass}`}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-xs">
                                  <p className="text-sm font-semibold text-white/90">{item.title}</p>
                                  <span className="text-[10px] px-1.5 py-0.5 rounded-pill bg-white/5 text-white/40 border border-white/5">
                                    {item.status === 'success' ? 'Успешно' : 'В обработке'}
                                  </span>
                                </div>
                                <p className="text-xs text-white/40">{item.subtitle}</p>
                              </div>
                            </div>

                            <div className="text-right">
                              <p className={`text-sm font-bold ${isIncome ? 'text-emerald-400' : isExpense ? 'text-white/90' : 'text-white/60'}`}>
                                {isIncome ? `+${formatRub(item.amount)}` : formatRub(item.amount)}
                              </p>
                              <div className="flex items-center gap-2xs justify-end text-[11px] text-white/30">
                                <Clock className="w-3 h-3" />
                                <span>{formatTime(item.createdAt)}</span>
                              </div>
                            </div>
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

      </div>
    </main>
  );
}
