'use client';

import { useState } from 'react';
import { 
  Percent, 
  ArrowUpRight, 
  Zap, 
  Gift, 
  Trophy, 
  TrendingUp, 
  ArrowDownRight, 
  TrendingDown, 
  ChevronDown 
} from 'lucide-react';
import { useTopUpModal } from '@/components/TopUpModal';
import { useWithdrawModal } from '@/components/WithdrawModal';

export default function WalletPage() {
  const [promo, setPromo] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const { openTopUp } = useTopUpModal();
  const { openWithdraw } = useWithdrawModal();

  const filterTabs = [
    { id: 'all', label: 'Все', count: 13 },
    { id: 'games', label: 'Игры', icon: Trophy, count: 6 },
    { id: 'bonuses', label: 'Бонусы', icon: Gift, count: 7 },
    { id: 'wins', label: 'Выигрыши', icon: TrendingUp, count: 4 },
    { id: 'deposits', label: 'Пополнения', icon: ArrowDownRight },
    { id: 'withdrawals', label: 'Выплаты', icon: ArrowUpRight },
    { id: 'losses', label: 'Проигрыши', icon: TrendingDown, count: 2 },
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
                24 508,80 <span className="text-2xl font-normal">₽</span>
              </span>
            </div>
          </div>

          <div className="flex gap-sm">
            <button onClick={openWithdraw} className="flex-1 rounded-button border border-white/20 bg-white/5 px-md py-xs font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/10 flex items-center justify-center gap-xs">
              <ArrowUpRight className="w-5 h-5 flex-shrink-0" />
              <span className="text-base font-semibold">Вывести</span>
            </button>

            <button onClick={openTopUp} className="flex-1 relative overflow-hidden rounded-button bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 px-md py-xs font-semibold text-white shadow-lg transition-all flex items-center justify-center gap-xs">
              <Zap className="w-5 h-5 flex-shrink-0" />
              <span className="text-base font-semibold">Пополнить</span>
            </button>
          </div>
        </div>

        {/* Форма Промокода */}
        <div className="relative rounded-panel bg-black/30 backdrop-blur-sm overflow-hidden border border-white/20">
          <div className="px-md py-sm border-b border-white/5 flex items-center gap-xs">
            <Gift className="h-4 w-4 text-emerald-400" />
            <h3 className="text-sm font-medium text-white/90">Промокод</h3>
            <span className="text-xs text-white/40">• Бонус на баланс</span>
          </div>

          <div className="p-card space-y-sm">
            <div className="flex gap-xs">
              <input 
                placeholder="Введите промокод" 
                maxLength={20}
                value={promo}
                onChange={(e) => setPromo(e.target.value)}
                className="flex-1 px-sm py-xs rounded-control bg-black/30 backdrop-blur-sm border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:border-white/20" 
                type="text" 
              />
              <button 
                disabled={!promo}
                className="px-md py-xs rounded-button text-white text-sm font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-white/10 backdrop-blur-sm border border-white/10 hover:bg-white/15"
              >
                Активировать
              </button>
            </div>
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
          </div>
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

          {/* Пагинатор точек под табами */}
          <div className="flex items-center justify-center gap-xs mt-xs">
            <div className="w-4 h-1.5 rounded-pill bg-gradient-to-r from-blue-400 to-cyan-400" />
            {[...Array(6)].map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-pill bg-white/20" />
            ))}
          </div>
        </div>

        {/* История Транзакций */}
        <div className="space-y-xs">
          <button className="w-full flex items-center justify-between px-sm py-xs rounded-button bg-gradient-to-r from-white/[0.02] to-white/[0.04] hover:from-white/5 hover:to-white/10 transition-all border border-white/5">
            <div className="flex items-center gap-sm">
              <span className="text-sm font-medium text-white/90">Вчера</span>
              <span className="px-xs py-2xs text-xs bg-white/10 rounded-pill text-white/60">13</span>
            </div>
            <ChevronDown className="w-4 h-4 text-white/40" />
          </button>
        </div>

      </div>
    </main>
  );
}
