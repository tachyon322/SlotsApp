'use client';

import { useRef } from 'react';
import {
  Target,
  Ticket,
  Gift,
  ArrowUpRight,
  ArrowDownRight,
  MessageCircle,
  CalendarDays,
  Gamepad2,
  LayoutDashboard,
  Sparkles,
  Pickaxe,
  Blocks,
  Bomb,
  Coins,
  Package,
  Rocket,
} from "lucide-react";
import { GameCard } from "@/components/GameCard";
import { useWithdrawModal } from "@/components/WithdrawModal";
import { useTopUpModal } from "@/components/TopUpModal";
import { usePromoModal } from "@/components/PromoModal";
import { useAuthModal } from "@/components/AuthModal";
import { useUser } from "@/components/UserProvider";

const GAMES = [
  {
    title: 'Crash',
    description: 'Успей забрать до взрыва',
    multiplier: 'до 100x',
    online: '1.2K',
    icon: Rocket,
    href: '/game/crash',
    gradient: 'from-[rgb(139,92,246)] to-[rgb(109,40,217)]',
  },
  {
    title: 'Слоты',
    description: 'Классические слоты с множителями',
    multiplier: 'до 100x',
    online: '2.0K',
    icon: Sparkles,
    href: '/game/slots',
    gradient: 'from-[rgb(63,111,228)] to-[rgb(70,52,196)]',
  },
  {
    title: 'Mines',
    description: 'Найдите алмазы, избегая мин',
    multiplier: 'до 50x',
    online: '1.4K',
    icon: Bomb,
    href: '/game/mines',
    gradient: 'from-[rgb(240,118,60)] to-[rgb(216,58,44)]',
  },
  {
    title: 'Кейсы',
    description: 'Лента кейсов с призами',
    multiplier: 'до 20 000 ₽',
    online: '1.1K',
    icon: Package,
    href: '/game/cases',
    gradient: 'from-[rgb(42,166,214)] to-[rgb(36,118,182)]',
    isNew: true,
  },
  {
    title: 'MineDrop',
    description: 'Ломай блоки и зарабатывай',
    multiplier: 'до 200x',
    online: '1.4K',
    icon: Pickaxe,
    href: '/game/minedrop',
    gradient: 'from-[rgb(52,179,102)] to-[rgb(22,121,74)]',
    fullWidth: true, // На всю ширину
  },
  {
    title: 'BlockBlast',
    description: 'Множители за закрытие линий',
    multiplier: 'до 200x',
    online: '1.1K',
    icon: Blocks,
    href: '/game/blockblast',
    gradient: 'from-[rgb(32,183,166)] to-[rgb(14,143,134)]',
    isNew: true,
    fullWidth: true, // На всю ширину
  },
];

export default function HomePage() {
  const { openWithdraw } = useWithdrawModal();
  const { openTopUp } = useTopUpModal();
  const { openPromo } = usePromoModal();
  const { openAuth } = useAuthModal();
  const { user } = useUser();
  const supportRef = useRef<HTMLDivElement>(null);

  const handlePromo = () => {
    if (user) {
      openPromo();
    } else {
      openAuth('signin');
    }
  };

  const handleWithdraw = () => {
    if (user) {
      openWithdraw();
    } else {
      openAuth('signin');
    }
  };

  const handleDeposit = () => {
    if (user) {
      openTopUp();
    } else {
      openAuth('signin');
    }
  };

  const handleSupport = () => {
    supportRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <main className="px-page md:px-2xl pt-md md:pt-xl pb-2xl w-full">
      <div className="mx-auto transition-all duration-300 max-w-5xl">
        {/* Верхние плашки (Колесо Фортуны и Промокоды) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm md:gap-md">
          {/* Колесо Фортуны */}
          <div className="relative rounded-panel cursor-pointer overflow-hidden p-card-lg bg-gradient-to-r from-cyan-900/90 via-blue-900/90 to-cyan-900/90 border border-cyan-500/20">
            <div className="absolute top-2xs right-sm text-2xl z-10">🏆</div>
            <div className="relative z-20 flex items-center justify-between gap-md">
              <div className="flex items-center gap-sm">
                <div className="p-sm rounded-panel bg-gradient-to-br from-cyan-400 to-blue-500 text-white">
                  <Target className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-2xs">
                    Колесо Фортуны
                  </h3>
                  <p className="text-xs text-white/60">
                    Выигрывайте призы каждый день
                  </p>
                </div>
              </div>
              <button className="h-8 rounded-control px-sm text-xs bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-bold flex items-center gap-2xs shadow-lg shadow-cyan-500/30">
                <Target className="h-4 w-4" />
                <span>Крутить</span>
              </button>
            </div>
          </div>

          {/* Промокоды */}
          <div className="relative rounded-panel cursor-pointer overflow-hidden p-card-lg bg-gradient-to-r from-yellow-700/90 via-amber-700/90 to-yellow-700/90 border border-yellow-500/20">
            <div className="absolute top-2xs right-sm text-2xl z-10">💳</div>
            <div className="relative z-20 flex items-center justify-between gap-md">
              <div className="flex items-center gap-sm">
                <div className="p-sm rounded-panel bg-gradient-to-br from-yellow-400 to-amber-500 text-white">
                  <Ticket className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white mb-2xs">
                    Промокоды
                  </h3>
                  <p className="text-xs text-white/60">
                    Активируйте коды для бонусов
                  </p>
                </div>
              </div>
              <button className="h-8 rounded-control px-sm text-xs bg-gradient-to-r from-yellow-500 to-amber-600 hover:from-yellow-400 hover:to-amber-500 text-white font-bold flex items-center gap-2xs shadow-lg shadow-yellow-500/30">
                <Ticket className="h-4 w-4" />
                <span>Ввести</span>
              </button>
            </div>
          </div>
        </div>

        {/* Быстрые кнопки действия */}
        <div className="flex gap-xs py-md flex-wrap">
          <button onClick={handlePromo} className="flex items-center gap-xs px-md py-xs rounded-button border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
            <Gift className="w-4 h-4 text-yellow-400" />
            <span>Промокод</span>
          </button>
          <button onClick={handleWithdraw} className="flex items-center gap-xs px-md py-xs rounded-button border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
            <ArrowUpRight className="w-4 h-4 text-purple-400" />
            <span>Вывести</span>
          </button>
          <button onClick={handleDeposit} className="flex items-center gap-xs px-md py-xs rounded-button border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
            <ArrowDownRight className="w-4 h-4 text-emerald-400" />
            <span>Депозит</span>
          </button>
          <button onClick={handleSupport} className="flex items-center gap-xs px-md py-xs rounded-button border bg-white/[0.02] border-white/10 hover:bg-white/5 text-sm font-medium text-white/70 transition-colors">
            <MessageCircle className="w-4 h-4 text-blue-400" />
            <span>Поддержка</span>
          </button>
        </div>

        {/* Баннер Конкурса */}
        {/* <div className="my-sm">
          <button className="relative w-full text-left p-card rounded-card bg-gradient-to-r from-sky-500 to-blue-700 flex items-center justify-between border border-white/10">
            <div className="flex items-center gap-sm">
              <img
                src="/img/cup.png"
                alt="Кубок"
                className=" w-20 h-20 object-contain -rotate-[15deg] -mt-lg"
              />
              <div>
                <span className="block font-bold text-white text-base">
                  Конкурс недели
                </span>
                <span className="text-xs text-white/75">
                  Участвуйте в конкурсе и выигрывайте призы
                </span>
              </div>
            </div>
            <div className="flex items-center gap-sm">
              <span className="inline-flex items-center gap-2xs rounded-pill border border-white/20 bg-white/15 px-xs py-2xs text-xs font-semibold text-white backdrop-blur-sm">
                <CalendarDays className="h-3 w-3" />
                <span>До 6 августа</span>
              </span>
              <span className="bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold px-md py-xs rounded-button transition-colors">
                Открыть
              </span>
            </div>
          </button>
        </div> */}

        {/* Сетка Доступных Игр */}
        <div className="space-y-md mt-xl">
          <div className="flex items-center gap-xs">
            <Gamepad2 className="h-5 w-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">Доступные Игры</h2>
          </div>

          {/* Карточки раскладываются в 2 колонки ПОД заголовком */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
            {GAMES.map((game) => (
              <GameCard key={game.title} {...game} />
            ))}
          </div>
        </div>

        {/* Поддержка */}
        <div className="mt-2xl" ref={supportRef}>
          <div className="p-card rounded-panel bg-slate-900/40 border border-slate-700/20 hover:border-slate-600/30 transition-all flex items-center gap-md cursor-pointer">
            <div className="p-sm rounded-panel bg-gradient-to-br from-blue-400 to-cyan-500 text-white">
              <MessageCircle className="h-6 w-6" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white mb-2xs">
                Техническая поддержка
              </h3>
              <p className="text-xs text-slate-400">
                Возникли вопросы? Мы на связи 24/7
              </p>
            </div>
          </div>
        </div>

      </div>
    </main>
  );
}
